// POST /api/celord/admin/trigger
// Session-authenticated trigger for CELord jobs — lets the admin UI run jobs
// without needing to curl with CRON_SECRET. CRON_SECRET never leaves the server.
// Body: { job: 'github' | 'jobs' | 'enrich' }

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { githubCollector } from '@saleslord/signals/collectors/github'
import { jobsCollector } from '@saleslord/signals/collectors/jobs'
import { stackoverflowCollector } from '@saleslord/signals/collectors/stackoverflow'
import { dockerhubCollector } from '@saleslord/signals/collectors/dockerhub'
import { persistSignals } from '@saleslord/signals/persist'
import { enrichOrg, persistEnrichment } from '@saleslord/signals/enrichment'
import { calculateCost } from '@/lib/utils'

export const maxDuration = 300

const VALID_JOBS = ['github', 'jobs', 'stackoverflow', 'dockerhub', 'enrich'] as const
type Job = typeof VALID_JOBS[number]

const STALE_DAYS = 30
const STALE_DAYS_KNOWN = 90
const BATCH_LIMIT = 50
const LOW_VALUE_STATUSES = new Set(['do_not_contact', 'active_customer', 'failed_enterprise_conversion'])

export async function POST(request: Request) {
  // Verify session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const job: Job = body.job
  if (!VALID_JOBS.includes(job)) {
    return Response.json({ error: `Invalid job: ${job}` }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // ── Collectors ────────────────────────────────────────────────────────────────

  if (job === 'github') {
    const signals = await githubCollector({ githubToken: process.env.GITHUB_TOKEN })
    const result = await persistSignals(signals, adminClient)
    return Response.json({ ok: true, job, signals: signals.length, ...result })
  }

  if (job === 'jobs') {
    const config = {
      serpApiKey:   process.env.SERPAPI_KEY,
      adzunaAppId:  process.env.ADZUNA_APP_ID,
      adzunaAppKey: process.env.ADZUNA_APP_KEY,
    }
    const signals = await jobsCollector(config)
    const result = await persistSignals(signals, adminClient)
    const provider = config.serpApiKey ? 'serpapi' : config.adzunaAppId ? 'adzuna' : 'fixture'
    return Response.json({ ok: true, job, provider, signals: signals.length, ...result })
  }

  if (job === 'stackoverflow') {
    const signals = await stackoverflowCollector({ stackoverflowApiKey: process.env.STACKOVERFLOW_API_KEY })
    const result = await persistSignals(signals, adminClient)
    return Response.json({ ok: true, job, signals: signals.length, ...result })
  }

  if (job === 'dockerhub') {
    const signals = await dockerhubCollector({})
    const result = await persistSignals(signals, adminClient)
    return Response.json({ ok: true, job, signals: signals.length, ...result })
  }

  // ── Enrichment ────────────────────────────────────────────────────────────────

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 422 })
  }

  const staleThreshold      = new Date(Date.now() - STALE_DAYS       * 86400000).toISOString()
  const staleThresholdKnown = new Date(Date.now() - STALE_DAYS_KNOWN * 86400000).toISOString()

  const { data: orgs, error: orgsError } = await adminClient
    .from('organizations')
    .select('id, name, domain, customer_status, enrichment_runs ( ran_at )')
    .neq('customer_status', 'do_not_contact')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT * 2)

  if (orgsError) return Response.json({ error: orgsError.message }, { status: 500 })

  type OrgRow = { id: string; name: string; domain: string | null; customer_status: string; enrichment_runs: { ran_at: string }[] }

  const toEnrich = ((orgs as unknown as OrgRow[]) ?? [])
    .filter(org => {
      const runs = org.enrichment_runs ?? []
      const threshold = LOW_VALUE_STATUSES.has(org.customer_status) ? staleThresholdKnown : staleThreshold
      if (runs.length === 0) return true
      return runs.sort((a, b) => b.ran_at.localeCompare(a.ran_at))[0].ran_at < threshold
    })
    .slice(0, BATCH_LIMIT)

  if (toEnrich.length === 0) {
    return Response.json({ ok: true, job, enriched: 0, message: 'All orgs up to date' })
  }

  const { data: links } = await adminClient
    .from('signal_links')
    .select('org_id, signals ( source, snippet, country, state_province )')
    .in('org_id', toEnrich.map(o => o.id))

  type SignalCtx = { source: string; snippet: string; country: string | null; state_province: string | null }
  type LinkRow = { org_id: string; signals: SignalCtx[] }

  const signalsByOrg = new Map<string, SignalCtx[]>()
  for (const link of ((links ?? []) as unknown as LinkRow[])) {
    if (!link.signals?.length) continue
    if (!signalsByOrg.has(link.org_id)) signalsByOrg.set(link.org_id, [])
    signalsByOrg.get(link.org_id)!.push(...link.signals)
  }

  let enriched = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const errors: string[] = []

  for (const org of toEnrich) {
    try {
      const { output, inputTokens, outputTokens } = await enrichOrg({
        orgId: org.id, orgName: org.name, domain: org.domain,
        signals: signalsByOrg.get(org.id) ?? [],
      })
      await persistEnrichment(org.id, output, adminClient)
      totalInputTokens  += inputTokens
      totalOutputTokens += outputTokens
      enriched++
    } catch (err) {
      errors.push(`${org.name}: ${(err as Error).message ?? 'unknown error'}`)
    }
  }

  // Log cost to api_usage
  const cost = calculateCost('claude-haiku-4-5-20251001', totalInputTokens, totalOutputTokens)
  if (totalInputTokens > 0) {
    const { data: adminProfile } = await adminClient
      .from('rep_profiles').select('user_id').eq('is_admin', true).limit(1).maybeSingle()
    if (adminProfile) {
      await adminClient.from('api_usage').insert({
        user_id: adminProfile.user_id, prospect_id: null,
        endpoint: 'celord_enrich_manual', model: 'claude-haiku-4-5-20251001',
        input_tokens: totalInputTokens, output_tokens: totalOutputTokens, cost_usd: cost,
      })
    }
  }

  return Response.json({ ok: true, job, enriched, totalInputTokens, totalOutputTokens, cost_usd: cost, errors })
}
