import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkDailyLimit, logUsage, USAGE_ENDPOINT } from '@/lib/api-usage'
import { buildSystemPrompt } from '@/lib/research-prompt'
import { webSearchTool, RESEARCH_MAX_USES } from '@/lib/web-search'
import { decryptApiKey } from '@/lib/crypto'
import { withJob } from '@/lib/jobs'
import { languageDirective, JSON_LANGUAGE_RULE } from '@/lib/i18n/languages'
import { generateStructured } from '@/lib/structured-output'
import type { CompanyStats, ProductPromptContext } from '@/lib/types'

// The system prompt lives in lib/research-prompt.ts so the A/B harness in
// scripts/ab-research.ts runs the exact prompt production uses.
const MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────
// Stage 1 of staged research: company assessment + the fit verdict the rep
// gates on. Does NOT write decision makers or an email — those are later stages
// the rep triggers. See docs/prospectlord/STAGED-RESEARCH.md.
//
// Job-tracked: withJob records this run in the jobs table (sidebar Jobs
// section). The company name starts as the raw query and is updated to the
// canonical name from the response when research succeeds.
export async function POST(request: Request) {
  return withJob(request, run, {
    kind: 'research',
    adminClient: createAdminClient(),
    getContext: body => ({ companyName: body?.query ?? null }),
  })
}

async function run(request: Request): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. Parse body
  const { query } = await request.json() as { query?: string }
  if (!query?.trim()) {
    return Response.json({ error: 'query is required' }, { status: 400 })
  }

  // 3. Fetch rep profile + the user's products. No team_config here — seniority
  // bands and target functions shape decision-maker tiering, which is stage 2.
  const [{ data: profile }, { data: productRows }] = await Promise.all([
    adminClient.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    adminClient.from('products').select('name, description, value_props, competitors').eq('user_id', user.id).order('created_at', { ascending: true }),
  ])

  // 4. Runaway guard — metered calls per rolling 24h. Checked after the profile
  // load so the rep's daily_call_limit override applies; these are cheap reads
  // and the guard exists to prevent the Anthropic call, not the queries.
  const limit = await checkDailyLimit(adminClient, user.id, profile?.daily_call_limit)
  if (!limit.ok) return Response.json({ error: limit.error }, { status: limit.status })

  // BYOK hard gate — decrypt stored key; no platform fallback
  const storedKey = profile?.anthropic_api_key?.trim()
  if (!storedKey) {
    return Response.json(
      { error: 'No Anthropic API key configured. Add your key in Profile & Settings.' },
      { status: 402 }
    )
  }
  let userApiKey: string
  try {
    userApiKey = decryptApiKey(storedKey)
  } catch {
    return Response.json(
      { error: 'Failed to decrypt your API key. Please re-enter it in Profile & Settings.' },
      { status: 500 }
    )
  }

  const products: ProductPromptContext[] = productRows ?? []
  if (products.length === 0) {
    return Response.json({ error: 'No products configured yet. Add at least one product in Profile & Settings before running research.' }, { status: 400 })
  }

  // 5. Build and run the AI research call with agentic tool-use loop
  const today  = new Date()
  const client = new Anthropic({ apiKey: userApiKey })

  // Rep-facing output (the whole brief is read by the rep) → always profile.locale,
  // never the per-prospect override. JSON rule keeps keys English so parsing holds.
  const systemPrompt = buildSystemPrompt(
    {
      products,
      icp_description:  profile.icp_description ?? '',
      rep_background:   profile.rep_background  ?? '',
    },
    today.toISOString().split('T')[0],
    today.getMonth() + 1
  ) + `\n\n${languageDirective(profile.locale)} ${JSON_LANGUAGE_RULE}`

  type AntMessage = Anthropic.MessageParam
  const messages: AntMessage[] = [
    { role: 'user', content: `Research this company for my B2B sales pipeline: ${query.trim()}` }
  ]

  // Top-level cache_control marks the last cacheable block automatically, so the
  // prefix — system prompt, then the accumulated search findings — is cached and
  // re-read at ~0.1x on every continuation below. Without it each continuation
  // resends the whole growing conversation at full price, and there can be seven
  // of them. The same system prompt also feeds the phase-2 emit call, so that
  // reads from this cache too.
  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    cache_control: { type: 'ephemeral' },
    tools: [webSearchTool(RESEARCH_MAX_USES)] as any,
    messages,
  })
  let totalInputTokens  = response.usage.input_tokens
  let totalOutputTokens = response.usage.output_tokens
  let cacheReadTokens   = response.usage.cache_read_input_tokens ?? 0
  let cacheWriteTokens  = response.usage.cache_creation_input_tokens ?? 0

  // web_search is a SERVER-side tool — searches execute inside a single API
  // call, so stop_reason is never 'tool_use'. When the server-side loop hits
  // its iteration limit the response comes back with stop_reason 'pause_turn';
  // continue by appending the assistant content and re-sending (no tool_results,
  // no extra user message). Cap continuations to stay under Vercel's 300s timeout.
  const MAX_CONTINUATIONS = 6
  let continuations = 0
  while (response.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
    continuations++
    messages.push({ role: 'assistant', content: response.content })

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      cache_control: { type: 'ephemeral' },
      tools: [webSearchTool(RESEARCH_MAX_USES)] as any,
      messages,
    })
    totalInputTokens  += response.usage.input_tokens
    totalOutputTokens += response.usage.output_tokens
    cacheReadTokens   += response.usage.cache_read_input_tokens ?? 0
    cacheWriteTokens  += response.usage.cache_creation_input_tokens ?? 0
  }

  // 6. Compose the brief as guaranteed-valid JSON via tool use (phase 2).
  // The web-search loop above can't ALSO be forced to emit a tool (forcing it would
  // stop the search), so this is a dedicated second call: hand the model its own
  // gathered findings and have it return the brief through the emit_result tool,
  // whose input the API serializes as valid JSON — no text parsing, any language.
  const findings = response.content.map(b => (b.type === 'text' ? b.text : '')).join('\n').trim()

  let parsed: any
  try {
    const structured = await generateStructured({
      client, model: MODEL, system: systemPrompt,
      messages: [
        { role: 'user', content: `Research this company for my B2B sales pipeline: ${query.trim()}` },
        { role: 'assistant', content: findings || '(research gathered)' },
        { role: 'user', content: 'Now output the complete brief exactly as specified above, by calling the emit_result tool with the JSON object.' },
      ],
      maxTokens: 8192,   // brief JSON was landing within ~10% of the old 4096 cap
      cache: true,   // same system prompt as the search loop — reads its cache
    })
    parsed = structured.value
    totalInputTokens  += structured.inputTokens
    totalOutputTokens += structured.outputTokens
    cacheReadTokens   += structured.cacheReadTokens
    cacheWriteTokens  += structured.cacheWriteTokens
  } catch {
    console.error('[research] Structured brief generation failed')
    return Response.json({ error: 'Failed to generate brief' }, { status: 500 })
  }

  // 7. Sort news descending (source of truth is DB order — never re-sort client-side)
  const news: { date: string; text: string; source: string; url: string }[] =
    (parsed.news ?? []).sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )

  // 8. Write to database
  // Upsert prospect
  const { data: prospect, error: prospectError } = await adminClient
    .from('prospects')
    .upsert(
      { user_id: user.id, name: parsed.company?.name ?? query.trim(), query: query.trim() },
      { onConflict: 'user_id,query' }
    )
    .select()
    .single()

  if (prospectError || !prospect) {
    console.error('[research] Prospect upsert error:', prospectError)
    return Response.json({ error: 'Failed to save prospect' }, { status: 500 })
  }

  // Insert new brief FIRST — if the process dies before the old one is deleted,
  // the page query (order by created_at desc, limit 1) will serve the new brief.
  // The orphaned old brief is cleaned up on the next research run.
  const stats: CompanyStats = parsed.stats ?? { revenue: null, headcount: null, open_roles: null, stage: null }
  const { data: brief, error: briefError } = await adminClient
    .from('prospect_briefs')
    .insert({
      prospect_id:    prospect.id,
      snapshot:       [parsed.snapshot_business, parsed.snapshot_current].filter(Boolean).join('\n\n') || parsed.snapshot || null,
      initiatives:    parsed.initiatives ?? [],
      pain_signals:   parsed.pain_signals ?? [],
      tech_signals:   parsed.tech_signals ?? [],
      news,
      outreach_angle: parsed.outreach_angle ?? null,
      stats,
      timing:         parsed.timing ?? null,
      fit:            parsed.fit ?? null,
      // email is deliberately not written. Stage 1 no longer drafts one —
      // refresh-email owns that, and the rep asks for it when they want it.
    })
    .select()
    .single()

  if (briefError || !brief) {
    console.error('[research] Brief insert error:', briefError)
    return Response.json({ error: 'Failed to save brief' }, { status: 500 })
  }

  // Now delete any older briefs for this prospect (keep only the one we just inserted)
  await adminClient.from('prospect_briefs').delete()
    .eq('prospect_id', prospect.id)
    .neq('id', brief.id)

  // Decision makers are NOT written here. Finding people is stage 2, which the
  // rep triggers from the brief once the fit verdict convinces them the account
  // is worth it — see the product principle in the root CLAUDE.md. Existing
  // decision makers are deliberately left alone: a stage 1 refresh should not
  // discard people who were already found, and dm_researched_at stays as it was.

  // Update last_refreshed_at on prospect
  await adminClient
    .from('prospects')
    .update({ last_refreshed_at: new Date().toISOString() })
    .eq('id', prospect.id)

  // 9. Log cost
  const cost = await logUsage(adminClient, {
    userId:       user.id,
    prospectId:   prospect.id,
    endpoint:     USAGE_ENDPOINT.RESEARCH,
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  })

  // 10. Return
  return Response.json({
    prospect_id: prospect.id,
    prospect,
    brief,
    cost_usd: cost,
  })
}
