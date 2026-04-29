// GET /api/celord/enrich
// Vercel cron: daily at 04:00 UTC (after all collectors have run).
// Enriches orgs that have never been enriched, or whose last enrichment
// is older than STALE_DAYS days.
// Auth: Bearer $CRON_SECRET header (set automatically by Vercel cron).

import { createAdminClient } from '@/lib/supabase/admin'
import { enrichOrg, persistEnrichment } from '@saleslord/signals/enrichment'
import { calculateCost } from '@/lib/utils'

export const maxDuration = 300

const STALE_DAYS = 30         // re-enrich unknown/prospect orgs after 30 days
const STALE_DAYS_KNOWN = 90   // re-enrich known-status orgs much less often
const BATCH_LIMIT = 50        // max orgs per run — keeps cost predictable

// Statuses where deep enrichment has low prospect value — skip or deprioritize.
const LOW_VALUE_STATUSES = new Set([
  'do_not_contact',
  'active_customer',
  'failed_enterprise_conversion',
])

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 422 })
  }

  const adminClient = createAdminClient()
  const staleThreshold      = new Date(Date.now() - STALE_DAYS       * 24 * 60 * 60 * 1000).toISOString()
  const staleThresholdKnown = new Date(Date.now() - STALE_DAYS_KNOWN * 24 * 60 * 60 * 1000).toISOString()

  // Exclude DNC — never worth enriching.
  // Include known-status orgs (customers, failed conversions) but apply longer staleness window.
  const { data: orgs, error: orgsError } = await adminClient
    .from('organizations')
    .select(`
      id,
      name,
      domain,
      customer_status,
      enrichment_runs ( ran_at )
    `)
    .neq('customer_status', 'do_not_contact')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT * 2)

  if (orgsError) {
    return Response.json({ error: orgsError.message }, { status: 500 })
  }

  type OrgRow = {
    id: string
    name: string
    domain: string | null
    customer_status: string
    enrichment_runs: { ran_at: string }[]
  }

  const toEnrich = ((orgs as unknown as OrgRow[]) ?? [])
    .filter(org => {
      const runs = org.enrichment_runs ?? []
      // Use longer staleness window for known-status orgs
      const threshold = LOW_VALUE_STATUSES.has(org.customer_status)
        ? staleThresholdKnown
        : staleThreshold
      if (runs.length === 0) return true
      const latest = runs.sort((a, b) => b.ran_at.localeCompare(a.ran_at))[0]
      return latest.ran_at < threshold
    })
    .slice(0, BATCH_LIMIT)

  if (toEnrich.length === 0) {
    return Response.json({ ok: true, enriched: 0, message: 'All orgs up to date' })
  }

  // Fetch signals for all target orgs in one query
  const orgIds = toEnrich.map(o => o.id)

  const { data: links } = await adminClient
    .from('signal_links')
    .select('org_id, signals ( source, snippet, country, state_province )')
    .in('org_id', orgIds)

  type SignalCtx = { source: string; snippet: string; country: string | null; state_province: string | null }
  type LinkRow = { org_id: string; signals: SignalCtx[] }

  // Group signals by org_id
  const signalsByOrg = new Map<string, SignalCtx[]>()
  for (const link of ((links ?? []) as unknown as LinkRow[])) {
    if (!link.signals?.length) continue
    if (!signalsByOrg.has(link.org_id)) signalsByOrg.set(link.org_id, [])
    signalsByOrg.get(link.org_id)!.push(...link.signals)
  }

  let enriched = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (const org of toEnrich) {
    const signals = signalsByOrg.get(org.id) ?? []

    try {
      const { output, inputTokens, outputTokens } = await enrichOrg({
        orgId:   org.id,
        orgName: org.name,
        domain:  org.domain,
        signals,
      })

      await persistEnrichment(org.id, output, adminClient)

      totalInputTokens  += inputTokens
      totalOutputTokens += outputTokens
      enriched++
    } catch (err) {
      console.error(`Enrichment failed for org ${org.id} (${org.name}):`, err)
      // Continue with next org — partial enrichment is fine
    }
  }

  // Log cost to api_usage — attribute to the first admin user (cron has no session).
  const cost = calculateCost('claude-haiku-4-5-20251001', totalInputTokens, totalOutputTokens)
  if (totalInputTokens > 0) {
    const { data: adminProfile } = await adminClient
      .from('rep_profiles')
      .select('user_id')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle()

    if (adminProfile) {
      await adminClient.from('api_usage').insert({
        user_id:       adminProfile.user_id,
        prospect_id:   null,
        endpoint:      'celord_enrich_cron',
        model:         'claude-haiku-4-5-20251001',
        input_tokens:  totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd:      cost,
      })
    }
  }

  return Response.json({
    ok: true,
    enriched,
    totalInputTokens,
    totalOutputTokens,
    cost_usd: cost,
  })
}
