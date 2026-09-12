// POST /api/decision-makers
//
// Stage 2 of staged research: find real, named people at an organization the rep
// has already decided is worth pursuing. Rep-triggered only — nothing chains
// into this from stage 1. See docs/prospectlord/STAGED-RESEARCH.md and the
// product principle in the root CLAUDE.md.
//
// Grounded in the stage 1 brief rather than re-researching the company, so the
// entire search budget goes on finding people.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkDailyLimit, logUsage, USAGE_ENDPOINT } from '@/lib/api-usage'
import { buildDecisionMakersPrompt, type RawDecisionMaker } from '@/lib/decision-makers-prompt'
import {
  DECISION_MAKERS_DEADLINE_MS, EMIT_TIMEOUT_MS,
  ANTHROPIC_TIMEOUT_MS, ANTHROPIC_MAX_RETRIES,
  runSearchLoop, findingsFromAllTurns,
} from '@/lib/web-search'
import { withJob } from '@/lib/jobs'
import { languageDirective, JSON_LANGUAGE_RULE } from '@/lib/i18n/languages'
import { generateStructured } from '@/lib/structured-output'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/utils'
import {
  loadProspectContext,
  getUserAnthropicKey,
  buildProductsBlock,
} from '@/lib/prospect-context'
import type { DmRole, TargetingTier } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'

const VALID_ROLES = new Set<DmRole>([
  'champion', 'economic_buyer', 'gatekeeper', 'end_user', 'influencer', 'custom',
])
const VALID_TIERS = new Set<TargetingTier>(['prime_target', 'intel_only', 'low_signal'])

// Job-tracked: withJob records this run in the jobs table (sidebar Jobs section).
export async function POST(request: Request) {
  return withJob(request, run, {
    kind: 'decision_makers',
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

  // 3. Load prospect + brief + profile + products (ownership-checked), plus the
  // team targeting config that drives tiering.
  const [loaded, teamConfigRes] = await Promise.all([
    loadProspectContext(adminClient, prospect_id, user.id),
    adminClient.from('team_config')
      .select('seniority_bands, target_functions')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status })

  const { prospect, brief, profile, allProducts } = loaded.value

  // 4. Runaway guard — after the profile load so the rep's override applies.
  const limit = await checkDailyLimit(adminClient, user.id, profile?.daily_call_limit)
  if (!limit.ok) return Response.json({ error: limit.error }, { status: limit.status })

  // BYOK hard gate
  const key = getUserAnthropicKey(profile)
  if (!key.ok) return Response.json({ error: key.error }, { status: key.status })

  // 5. Build the prompt. Rep-facing output (the rep reads these cards) → always
  // profile.locale, never the per-prospect override.
  const systemPrompt = buildDecisionMakersPrompt({
    companyName:     prospect.name,
    productsBlock:   buildProductsBlock(allProducts, false),
    repBackground:   profile?.rep_background ?? '',
    seniorityBands:  (teamConfigRes.data?.seniority_bands  as string[]) ?? [],
    targetFunctions: (teamConfigRes.data?.target_functions as string[]) ?? [],
    snapshot:        brief.snapshot ?? null,
    initiatives:     (brief.initiatives  as string[]) ?? [],
    painSignals:     (brief.pain_signals as string[]) ?? [],
    techSignals:     (brief.tech_signals as string[]) ?? [],
  }) + `\n\n${languageDirective(profile?.locale)} ${JSON_LANGUAGE_RULE}`

  const startedAt = Date.now()
  const client = new Anthropic({
    apiKey: key.value,
    timeout: ANTHROPIC_TIMEOUT_MS,
    maxRetries: ANTHROPIC_MAX_RETRIES,
  })
  const userTurn = `Find the people involved in a software purchase decision at ${prospect.name}.`

  let totalInputTokens  = 0
  let totalOutputTokens = 0
  let cacheReadTokens   = 0
  let cacheWriteTokens  = 0
  let webSearchRequests = 0

  // 6. Search loop — lib/web-search.ts owns it, shared with research,
  // check-updates and the A/B harness. It handles pause_turn (web search runs
  // inside a single API call, so stop_reason is never 'tool_use'), caches the
  // growing prefix with cache_control, and bounds the run by both a
  // continuation count and a wall clock.
  //
  // maxContinuations is lower than research's 6 — this stage searches narrowly
  // and should finish well inside its maxDuration.
  const MAX_CONTINUATIONS = 4
  const loop = await runSearchLoop({
    client, model: MODEL, system: systemPrompt, userTurn,
    maxTokens: 4096,
    maxContinuations: MAX_CONTINUATIONS,
    deadlineMs: DECISION_MAKERS_DEADLINE_MS,
    startedAt,
    onUsage: u => {
      totalInputTokens  += u.input_tokens
      totalOutputTokens += u.output_tokens
      cacheReadTokens   += u.cache_read_input_tokens ?? 0
      cacheWriteTokens  += u.cache_creation_input_tokens ?? 0
      webSearchRequests += u.server_tool_use?.web_search_requests ?? 0
    },
  })

  // Loop telemetry — free to collect, and both numbers answer open questions.
  // continuations: MODEL-UPGRADES.md records the pause_turn path as never having
  // been exercised by a live run. Logging it turns every real brief into evidence,
  // instead of spending ~$0.75 a time hunting for a prospect heavy enough to
  // trigger it.
  // web searches: billed at $10 per 1,000 ON TOP of the tokens api_usage records,
  // so this is the size of the gap in the ledger. Not stored yet — closing it
  // needs an api_usage column. See docs/prospectlord/BACKLOG.md.
  console.log(`[decision-makers] search loop: ${loop.continuations} continuation(s), ${webSearchRequests} web search(es) (~${(webSearchRequests * 0.01).toFixed(2)} not in api_usage)`)

  // 7. Emit as guaranteed-valid JSON via tool use (phase 2), same two-phase
  // pattern as research — the search call cannot also be forced to emit a tool.
  const findings = findingsFromAllTurns(loop)

  let raw: RawDecisionMaker[]
  try {
    const structured = await generateStructured({
      client, model: MODEL, system: systemPrompt,
      messages: [
        { role: 'user', content: userTurn },
        { role: 'assistant', content: findings || '(research gathered)' },
        { role: 'user', content: 'Now output the decision makers exactly as specified above, by calling the emit_result tool with the JSON object. Return an empty array if you could not source anyone.' },
      ],
      maxTokens: 4096,
      cache: true,   // same system prompt as the search loop — reads its cache
      timeoutMs: EMIT_TIMEOUT_MS,
    })
    raw = (structured.value as { decision_makers?: RawDecisionMaker[] }).decision_makers ?? []
    totalInputTokens  += structured.inputTokens
    totalOutputTokens += structured.outputTokens
    cacheReadTokens   += structured.cacheReadTokens
    cacheWriteTokens  += structured.cacheWriteTokens
  } catch {
    console.error('[decision-makers] Structured generation failed')
    return Response.json({ error: 'Failed to identify decision makers' }, { status: 500 })
  }

  // 8. Map to rows. An empty result is a legitimate outcome, not an error —
  // under the sourcing rules "nobody is publicly identifiable" is a correct
  // answer, and the UI renders it as one.
  const rows = raw.map((dm, i) => {
    const role: DmRole = VALID_ROLES.has(dm.role as DmRole) ? (dm.role as DmRole) : 'custom'
    const colors = ROLE_COLORS[role] ?? ROLE_COLORS.custom
    const tier: TargetingTier = VALID_TIERS.has(dm.targeting_tier as TargetingTier)
      ? (dm.targeting_tier as TargetingTier)
      : 'intel_only'   // unclassified is not a prime target — do not flatter the list
    const name = dm.name?.trim() || null
    return {
      prospect_id:       prospect_id,
      name,
      title:             dm.title ?? null,
      role,
      role_label:        dm.role_label ?? ROLE_LABELS[role],
      avatar_initials:   name ? (dm.avatar_initials ?? '??') : '??',
      avatar_color_bg:   colors.bg,
      avatar_color_text: colors.text,
      cares_about:       dm.cares_about ?? null,
      suggested_angle:   dm.suggested_angle ?? null,
      sort_order:        i,
      targeting_tier:    tier,
      tier_reasoning:    dm.tier_reasoning ?? null,
    }
  })

  // 9. Insert-first, then delete the old set — same pattern as research. If the
  // process dies mid-cleanup the new rows are already visible.
  const { data: existing } = await adminClient
    .from('decision_makers').select('id').eq('prospect_id', prospect_id)
  const existingIds = (existing ?? []).map(d => d.id)

  if (rows.length > 0) {
    const { error: insertError } = await adminClient.from('decision_makers').insert(rows)
    if (insertError) {
      console.error('[decision-makers] Insert error:', insertError)
      return Response.json({ error: 'Failed to save decision makers' }, { status: 500 })
    }
  }
  if (existingIds.length > 0) {
    await adminClient.from('decision_makers').delete().in('id', existingIds)
  }

  // 10. Stamp completion — set even when zero people were found, so the UI can
  // tell "looked and found nobody" apart from "never looked" and does not keep
  // inviting the rep to pay for the same empty answer.
  await adminClient
    .from('prospects')
    .update({ dm_researched_at: new Date().toISOString() })
    .eq('id', prospect_id)

  // 11. Log cost
  const cost = await logUsage(adminClient, {
    userId:       user.id,
    prospectId:   prospect_id,
    endpoint:     USAGE_ENDPOINT.DECISION_MAKERS,
    model:        MODEL,
    inputTokens:  totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  })

  return Response.json({ decision_makers: rows, found: rows.length, cost_usd: cost })
}
