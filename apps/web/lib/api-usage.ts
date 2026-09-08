// Anthropic call accounting — the single source of truth for what gets written
// to api_usage and what counts against a rep's daily budget.
//
// api_usage answers two different questions and they must not be conflated:
//
//   1. COST LEDGER — every Anthropic call writes a row, so the monthly spend
//      badge and per-job cost are complete. No endpoint is exempt.
//   2. RATE-LIMIT COUNTER — only the expensive routes consume the daily budget,
//      so the counter reads a filtered subset (METERED_ENDPOINTS).
//
// Before this split the counter read *every* row, so the cheap "iterate freely"
// routes (email, pitch opener) silently burned the research budget they were
// explicitly designed not to touch, and a CELord cron run — attributed to the
// first admin — could lock that admin out of ProspectLord entirely.
//
// Server-side only: imported by API route handlers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateCost } from '@/lib/utils'

// The stored `endpoint` value for each route that logs usage. These strings are
// persisted identifiers — changing one orphans every historical row that used
// it, so treat them as stable and add rather than rename.
export const USAGE_ENDPOINT = {
  RESEARCH:             'research',
  CHECK_UPDATES:        'check-updates',
  CASE_STUDY_MATCH:     'case-study-match',
  EMAIL:                'email',
  PITCH_OPENER:         'pitch-opener',
  RESOLVE:              'resolve',
  CELORD_ENRICH_CRON:   'celord_enrich_cron',
  CELORD_ENRICH_MANUAL: 'celord_enrich_manual',
} as const

export type UsageEndpoint = (typeof USAGE_ENDPOINT)[keyof typeof USAGE_ENDPOINT]

// Endpoints that consume the rep's daily budget: the Sonnet routes that run web
// search and cost real money per call.
//
// Everything else is deliberately unmetered:
//   - email / pitch-opener — Haiku, brief-grounded, no search. Reps are meant to
//     iterate on copy freely; that is the whole point of those routes.
//   - resolve — one small Haiku call fired on every prospect add. Metering it
//     would charge a rep for typing a company name.
//   - celord_* — runs on the platform key, not the rep's, and is attributed to
//     an admin only so the cost lands somewhere. Never the admin's budget.
export const METERED_ENDPOINTS: readonly UsageEndpoint[] = [
  USAGE_ENDPOINT.RESEARCH,
  USAGE_ENDPOINT.CHECK_UPDATES,
  USAGE_ENDPOINT.CASE_STUDY_MATCH,
]

export function dailyCallLimit(): number {
  return Number(process.env.DAILY_CALL_LIMIT ?? '25')
}

// Discriminated result so callers translate to their own Response — same shape
// as the loaders in lib/prospect-context.ts.
export type LimitCheck = { ok: true } | { ok: false; status: number; error: string }

// Rolling 24h budget check. Only metered endpoints count; see METERED_ENDPOINTS.
export async function checkDailyLimit(
  adminClient: SupabaseClient,
  userId: string,
): Promise<LimitCheck> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { count } = await adminClient
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('endpoint', METERED_ENDPOINTS as unknown as string[])
    .gte('created_at', since)

  if ((count ?? 0) >= dailyCallLimit())
    return { ok: false, status: 429, error: 'Daily limit reached. Resets in 24 hours.' }

  return { ok: true }
}

// Writes the cost-ledger row and returns the computed cost so the route can
// hand it back to the client. Call this after every Anthropic call — including
// ones whose downstream parsing failed, since the compute was spent either way.
export async function logUsage(
  adminClient: SupabaseClient,
  args: {
    userId: string
    prospectId?: string | null
    endpoint: UsageEndpoint
    model: string
    inputTokens: number
    outputTokens: number
    // Prompt-caching totals from usage.cache_read_input_tokens /
    // cache_creation_input_tokens. Omit on routes that don't cache.
    cacheReadTokens?: number
    cacheWriteTokens?: number
  },
): Promise<number> {
  const cacheRead  = args.cacheReadTokens  ?? 0
  const cacheWrite = args.cacheWriteTokens ?? 0

  const cost = calculateCost(
    args.model, args.inputTokens, args.outputTokens, cacheRead, cacheWrite,
  )

  await adminClient.from('api_usage').insert({
    user_id:       args.userId,
    prospect_id:   args.prospectId ?? null,
    endpoint:      args.endpoint,
    model:         args.model,
    // Total input tokens processed, cached and uncached. api_usage has no
    // separate cache columns; cost_usd already prices each portion correctly,
    // so this column stays a volume figure rather than a billing one.
    input_tokens:  args.inputTokens + cacheRead + cacheWrite,
    output_tokens: args.outputTokens,
    cost_usd:      cost,
  })

  return cost
}
