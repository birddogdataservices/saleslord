// POST /api/check-updates
// Searches for recent news about a prospect and appends a blurb if relevant changes are found.
// Does NOT overwrite the existing brief — only appends to prospect_updates.
// Returns { found: false } if no relevant new intel is found (blurb is not written).
// Cheaper than full research: narrower output, same web search budget.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkDailyLimit, logUsage, USAGE_ENDPOINT } from '@/lib/api-usage'
import {
  CHECK_UPDATES_DEADLINE_MS, emitTimeoutMs,
  ANTHROPIC_TIMEOUT_MS, ANTHROPIC_MAX_RETRIES,
  runSearchLoop, findingsForEmit, type SearchLoopResult,
} from '@/lib/web-search'
import { decryptApiKey } from '@/lib/crypto'
import { withJob } from '@/lib/jobs'
import { languageDirective, JSON_LANGUAGE_RULE } from '@/lib/i18n/languages'
import { generateStructured } from '@/lib/structured-output'
import { WEB_SEARCH_COST_PER_REQUEST } from '@/lib/utils'
import type { ProductPromptContext, NewsItem } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────
// System prompt — narrowly scoped to "what changed"
// ─────────────────────────────────────────
function buildSystemPrompt(
  products: ProductPromptContext[],
  repBackground: string,
  voiceSamples: string,
): string {
  const productsBlock = products.length === 0
    ? '- Products: not specified'
    : products.length === 1
      ? `- Product: ${products[0].name}\n- Value props: ${products[0].value_props}`
      : `- Products (rep carries multiple):\n${
          products.map((p, i) => `  ${i + 1}. ${p.name}: ${p.value_props}`).join('\n')
        }`

  return `You are a B2B sales intelligence assistant scanning for recent developments about a company.

Rep context:
${productsBlock}
- Rep background: ${repBackground}

Your job is ONLY to surface new, relevant intelligence — not to re-research what's already known.
You will be given the company's existing brief and a list of news items already captured.
Search for developments that occurred AFTER the last-checked date provided.

Relevance criteria (all must apply):
- The event happened after the last-checked date
- It is not already in the existing news list (check URLs and event descriptions)
- It is directly relevant to the rep's product and ICP — leadership changes, funding rounds, layoffs, new product launches, earnings reports, regulatory changes, or major partnerships

Source and citation rules:
- This summary is spoken aloud in sales conversations. A wrong item costs the rep credibility; returning {"found": false} costs nothing. When those trade off, return found: false.
- Every item MUST link to the specific article or press release you retrieved — a URL that opens directly onto that story.
- NEVER cite a section index, a paginated listing, a newsroom or blog landing page, a search-results page, or a site's home page. If you cannot produce a direct link to the specific item, omit the item.
- Never construct, guess at, or pattern-match a URL. Use only URLs returned by search.
- Two items must never share a URL.
- Do not pad. One well-sourced development is a better answer than three thin ones.

If no relevant new developments are found, return exactly: {"found": false}

If relevant developments exist, return:
{
  "found": true,
  "summary": "2–3 sentences: what changed and why it matters to this rep right now",
  "news_items": [
    {
      "date": "Mon DD, YYYY",
      "text": "what happened and why it matters to this rep",
      "source": "Publication name",
      "url": "https://real-url-only — omit item if no real URL"
    }
  ]
}

Return ONLY valid JSON. No markdown fencing, no preamble, no trailing text.`
}

// ─────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────
// Job-tracked: withJob records this run in the jobs table (sidebar Jobs section).
export async function POST(request: Request) {
  return withJob(request, run, {
    kind: 'check_updates',
    adminClient: createAdminClient(),
    getContext: body => ({ prospectId: body?.prospect_id ?? null }),
  })
}

async function run(request: Request): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. Parse body
  const { prospect_id } = await request.json() as { prospect_id?: string }
  if (!prospect_id) return Response.json({ error: 'prospect_id is required' }, { status: 400 })

  // 4. Fetch everything in parallel
  const [prospectRes, briefRes, profileRes, productRes, lastUpdateRes] = await Promise.all([
    adminClient.from('prospects').select('*').eq('id', prospect_id).single(),
    adminClient.from('prospect_briefs').select('*').eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false }).limit(1).single(),
    adminClient.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    adminClient.from('products').select('name, description, value_props, competitors')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    // Most recent update blurb — used to determine "last checked" date
    adminClient.from('prospect_updates').select('created_at').eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Ownership check — adminClient bypasses RLS, so verify the prospect belongs
  // to the caller. 404 (not 403) to avoid confirming the id exists.
  if (!prospectRes.data || prospectRes.data.user_id !== user.id) {
    return Response.json({ error: 'Prospect not found' }, { status: 404 })
  }
  if (!briefRes.data)    return Response.json({ error: 'No brief found — run research first' }, { status: 404 })

  const prospect    = prospectRes.data
  const brief       = briefRes.data
  const profile     = profileRes.data
  const products: ProductPromptContext[] = productRes.data ?? []

  // Runaway guard — checked after the profile load so the rep's
  // daily_call_limit override applies. See METERED_ENDPOINTS.
  const limit = await checkDailyLimit(adminClient, user.id, profile?.daily_call_limit)
  if (!limit.ok) return Response.json({ error: limit.error }, { status: limit.status })

  // BYOK hard gate
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

  // 5. Determine the "search for news after this date" cutoff.
  //
  // Order matters. last_checked_at covers scans that found nothing — without it
  // a fruitless check would be invisible here and the next scan would re-cover
  // the same ground. The newest blurb is the fallback for prospects checked
  // before that column existed, and the brief's own created_at is the floor for
  // a prospect that has only ever been researched.
  const lastCheckedAt =
    prospect.last_checked_at ??
    lastUpdateRes.data?.created_at ??
    brief.created_at

  const lastCheckedLabel = new Date(lastCheckedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  // 6. Build context — existing news for dedup, brief snapshot for relevance grounding
  const existingNewsText = (brief.news as NewsItem[] ?? [])
    .map(n => `- ${n.date}: ${n.text} (${n.url ?? 'no url'})`)
    .join('\n') || 'None yet'

  const userMessage = `Company: ${prospect.name}
Last checked: ${lastCheckedLabel}

Existing brief snapshot:
${brief.snapshot ?? 'not available'}

Strategic initiatives already captured:
${(brief.initiatives as string[] ?? []).join('; ') || 'none'}

Pain signals already captured:
${(brief.pain_signals as string[] ?? []).join('; ') || 'none'}

News items already in the brief (do NOT re-surface these):
${existingNewsText}

Search for developments at ${prospect.name} that occurred after ${lastCheckedLabel} and are relevant to the rep's product. Return {"found": false} if nothing meaningful is new.`

  // 7. Run agentic web search loop
  const startedAt = Date.now()
  const client = new Anthropic({
    apiKey: userApiKey,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  })
  // Rep-facing (the update summary is read by the rep) → always profile.locale.
  const systemPrompt = buildSystemPrompt(
    products,
    profile?.rep_background ?? '',
    profile?.voice_samples ?? '',
  ) + `\n\n${languageDirective(profile?.locale)} ${JSON_LANGUAGE_RULE}`

  let totalInputTokens  = 0
  let totalOutputTokens = 0
  let cacheReadTokens   = 0
  let cacheWriteTokens  = 0
  let webSearchRequests = 0

  // Usage is logged on EVERY exit past this point, failures included — the
  // tokens and searches were billed to the rep's key whether or not anything
  // new turned up. cost_usd in the error body is what withJob stamps on the job.
  const logRun = () => logUsage(adminClient, {
    userId:       user.id,
    prospectId:   prospect_id,
    endpoint:     USAGE_ENDPOINT.CHECK_UPDATES,
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    webSearchRequests,
  })
  const fail = async (error: string, status: number) => {
    const spent = totalInputTokens + totalOutputTokens + cacheReadTokens + cacheWriteTokens + webSearchRequests > 0
    const cost = spent ? await logRun() : 0
    return Response.json({ error, cost_usd: cost }, { status })
  }

  // Search loop — lib/web-search.ts owns it, shared with research,
  // decision-makers and the A/B harness. It handles pause_turn (web search is a
  // SERVER-side tool, so searches run inside a single API call and stop_reason
  // is never 'tool_use'), sends cache_control so each continuation and the
  // phase-2 emit call below re-read the prefix at ~0.1x, and bounds the run by
  // both a continuation count and a wall clock.
  //
  // max_tokens stays at 1024 here: this route asks "what changed", not for a
  // brief, and the emit call is what produces the output the rep reads.
  //
  // The first call failing outright, or being cut short at the deadline before
  // it gathered anything, propagates — there is nothing to compose from.
  const MAX_CONTINUATIONS = 4  // check-updates is narrower than research
  let loop: SearchLoopResult
  try {
    loop = await runSearchLoop({
      client, model: MODEL, system: systemPrompt, userTurn: userMessage,
      maxTokens: 1024,
      maxContinuations: MAX_CONTINUATIONS,
      deadlineMs: CHECK_UPDATES_DEADLINE_MS,
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
    console.error('[check-updates] Initial search call failed:', err instanceof Error ? err.message : err)
    return fail('The update check timed out before it found anything. Your brief is unchanged — please try again.', 504)
  }

  // Loop telemetry — free to collect, and both numbers answer open questions.
  // continuations: MODEL-UPGRADES.md records the pause_turn path as never having
  // been exercised by a live run. Logging it turns every real brief into evidence,
  // instead of spending ~$0.75 a time hunting for a prospect heavy enough to
  // trigger it.
  // web searches: billed at $10 per 1,000 on top of tokens. Recorded in
  // api_usage.web_search_requests and priced into cost_usd by logUsage below.
  console.log(`[check-updates] search loop: ${loop.continuations} continuation(s), ${webSearchRequests} web search(es) (+$${(webSearchRequests * WEB_SEARCH_COST_PER_REQUEST).toFixed(2)} in cost_usd), complete=${loop.complete}`)

  // 8. Emit the result as guaranteed-valid JSON via tool use (phase 2).
  // The web-search loop can't also be forced to emit a tool, so this dedicated call
  // hands the model its own findings and has it return the result through emit_result
  // (either {"found": false} or the full object). No text parsing, any language.
  // An incomplete loop hands over the raw search results — see findingsForEmit.
  const findings = findingsForEmit(loop, '(search complete)')

  let parsed: { found: boolean; summary?: string; news_items?: NewsItem[] }
  try {
    const structured = await generateStructured({
      client, model: MODEL, system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: findings.content },
        { role: 'user', content: 'Now return the result exactly as specified above (either {"found": false} or the full object), by calling the emit_result tool.' },
      ],
      maxTokens: 2048,
      cache: true,   // same system prompt as the search loop — reads its cache
      timeoutMs: emitTimeoutMs(startedAt),
      historyTools: findings.tools,
    })
    parsed =structured.value as typeof parsed
    totalInputTokens  += structured.inputTokens
    totalOutputTokens += structured.outputTokens
    cacheReadTokens   += structured.cacheReadTokens
    cacheWriteTokens  += structured.cacheWriteTokens
  } catch (err) {
    console.error('[check-updates] Structured generation failed:', err instanceof Error ? err.message : err)
    return fail('Failed to generate update', 500)
  }

  // 9. Log cost regardless of whether updates were found (we used compute either way)
  const cost = await logRun()

  // 10. If no relevant updates, return early — no blurb written. Still stamp
  // last_checked_at: "we looked and there was nothing new" is worth knowing,
  // and without this a fruitless check leaves no trace anywhere.
  if (!parsed.found || !parsed.summary) {
    await adminClient
      .from('prospects')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', prospect_id)
    return Response.json({ found: false, cost_usd: cost })
  }

  // 11. Sort news descending and write blurb
  const newsItems: NewsItem[] = (parsed.news_items ?? []).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const { data: update, error: updateError } = await adminClient
    .from('prospect_updates')
    .insert({
      prospect_id,
      user_id:    user.id,
      summary:    parsed.summary,
      news_items: newsItems,
    })
    .select()
    .single()

  if (updateError || !update) {
    console.error('[check-updates] Insert error:', updateError)
    return Response.json({ error: 'Failed to save update' }, { status: 500 })
  }

  // Stamp the news scan, NOT the brief. This route does not rebuild the brief,
  // and writing last_refreshed_at here is what made "last checked" ambiguous:
  // one column recording two different events.
  await adminClient
    .from('prospects')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', prospect_id)

  return Response.json({ found: true, update, cost_usd: cost })
}
