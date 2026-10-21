import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkDailyLimit, logUsage, USAGE_ENDPOINT } from '@/lib/api-usage'
import { buildSystemPrompt } from '@/lib/research-prompt'
import {
  RESEARCH_DEADLINE_MS, EMIT_TIMEOUT_MS,
  ANTHROPIC_TIMEOUT_MS, ANTHROPIC_MAX_RETRIES,
  runSearchLoop, findingsForEmit, type SearchLoopResult,
} from '@/lib/web-search'
import { decryptApiKey } from '@/lib/crypto'
import { withJob } from '@/lib/jobs'
import { languageDirective, JSON_LANGUAGE_RULE } from '@/lib/i18n/languages'
import { generateStructured } from '@/lib/structured-output'
import { WEB_SEARCH_COST_PER_REQUEST } from '@/lib/utils'
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
  const startedAt = Date.now()
  const client = new Anthropic({
    apiKey: userApiKey,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  })

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

  const userTurn = `Research this company for my B2B sales pipeline: ${query.trim()}`

  let totalInputTokens  = 0
  let totalOutputTokens = 0
  let cacheReadTokens   = 0
  let cacheWriteTokens  = 0
  let webSearchRequests = 0

  // Usage is logged on EVERY exit past this point, failures included — the
  // tokens and searches were billed to the rep's key whether or not a brief
  // came out of them. cost_usd in the error body is what withJob stamps on the
  // failed job row.
  const logRun = (prospectId: string | null) => logUsage(adminClient, {
    userId:       user.id,
    prospectId,
    endpoint:     USAGE_ENDPOINT.RESEARCH,
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    webSearchRequests,
  })
  const fail = async (error: string, status: number, prospectId: string | null = null) => {
    const spent = totalInputTokens + totalOutputTokens + cacheReadTokens + cacheWriteTokens + webSearchRequests > 0
    const cost = spent ? await logRun(prospectId) : 0
    return Response.json({ error, cost_usd: cost }, { status })
  }

  // The pause_turn continuation loop lives in lib/web-search.ts — one tested
  // copy, shared by the three search routes and the A/B harness. It owns the
  // cache_control prefix, the tool declaration, and both guards (continuation
  // count AND wall clock, because counting continuations does not bound time).
  // A continuation that fails is swallowed there, keeping what was gathered,
  // and a call still running at the deadline is cut short keeping its results.
  //
  // The FIRST call failing outright, or being cut short before it gathered
  // anything, is the one case with nothing to compose a brief from, and
  // runSearchLoop deliberately lets it propagate. Catching it here turns it
  // into a clear 504 instead of a raw 500, because a rep who waited deserves to
  // know what happened and that their existing brief is untouched.
  const MAX_CONTINUATIONS = 6
  let loop: SearchLoopResult
  try {
    loop = await runSearchLoop({
      client, model: MODEL, system: systemPrompt, userTurn,
      maxTokens: 4096,
      maxContinuations: MAX_CONTINUATIONS,
      deadlineMs: RESEARCH_DEADLINE_MS,
      startedAt,
      onUsage: u => {
        totalInputTokens  += u.input_tokens
        totalOutputTokens += u.output_tokens
        cacheReadTokens   += u.cache_read_input_tokens ?? 0
        cacheWriteTokens  += u.cache_creation_input_tokens ?? 0
        webSearchRequests += u.server_tool_use?.web_search_requests ?? 0
      },
    })
  } catch (err) {
    console.error('[research] Initial search call failed:', err instanceof Error ? err.message : err)
    return fail('Research timed out before it could gather anything. Your existing brief is unchanged — please try again.', 504)
  }

  // Loop telemetry — free to collect, and both numbers answer open questions.
  // continuations: MODEL-UPGRADES.md records the pause_turn path as never having
  // been exercised by a live run. Logging it turns every real brief into evidence,
  // instead of spending ~$0.75 a time hunting for a prospect heavy enough to
  // trigger it.
  // web searches: billed at $10 per 1,000 on top of tokens. Recorded in
  // api_usage.web_search_requests and priced into cost_usd by logUsage below.
  // complete=false: the model never wrote its closing summary (cut short at the
  // deadline, or stopped mid-pause_turn), so the brief is composed from the raw
  // search results — see findingsForEmit.
  console.log(`[research] search loop: ${loop.continuations} continuation(s), ${webSearchRequests} web search(es) (+$${(webSearchRequests * WEB_SEARCH_COST_PER_REQUEST).toFixed(2)} in cost_usd), complete=${loop.complete}`)

  // 6. Compose the brief as guaranteed-valid JSON via tool use (phase 2).
  // The web-search loop above can't ALSO be forced to emit a tool (forcing it would
  // stop the search), so this is a dedicated second call: hand the model its own
  // gathered findings and have it return the brief through the emit_result tool,
  // whose input the API serializes as valid JSON — no text parsing, any language.
  //
  // Findings accumulate across every assistant turn, not just the last one —
  // when a continuation is cut short the earlier turns are all we have.
  const findings = findingsForEmit(loop, '(research gathered)')

  let parsed: any
  try {
    const structured = await generateStructured({
      client, model: MODEL, system: systemPrompt,
      messages: [
        { role: 'user', content: userTurn },
        { role: 'assistant', content: findings.content },
        { role: 'user', content: 'Now output the complete brief exactly as specified above, by calling the emit_result tool with the JSON object.' },
      ],
      maxTokens: 8192,   // brief JSON was landing within ~10% of the old 4096 cap
      cache: true,   // same system prompt as the search loop — reads its cache
      timeoutMs: EMIT_TIMEOUT_MS,
      historyTools: findings.tools,
    })
    parsed = structured.value
    totalInputTokens  += structured.inputTokens
    totalOutputTokens += structured.outputTokens
    cacheReadTokens   += structured.cacheReadTokens
    cacheWriteTokens  += structured.cacheWriteTokens
  } catch (err) {
    console.error('[research] Structured brief generation failed:', err instanceof Error ? err.message : err)
    return fail('Failed to generate brief', 500)
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
    return fail('Failed to save prospect', 500)
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
    return fail('Failed to save brief', 500, prospect.id)
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
  const cost = await logRun(prospect.id)

  // 10. Return
  return Response.json({
    prospect_id: prospect.id,
    prospect,
    brief,
    cost_usd: cost,
  })
}
