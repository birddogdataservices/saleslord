export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { scoreOrg } from '@/signals/scoring'
import type { RawSignal } from '@/signals/collectors/types'
import type { SignalSource } from '@/core/types'
import { ProspectsTable } from '@/components/celord/ProspectsTable'

// ── DB row shapes ─────────────────────────────────────────────────────────────

type SignalRow = {
  source: string
  source_url: string
  snippet: string
  org_hint: string
  org_domain: string | null
  country: string | null
  state_province: string | null
  signal_date: string | null
  collected_at: string
}

type SignalLinkRow = {
  confidence: number
  method: string
  signals: SignalRow[]
}

type LocationRow = {
  label: string
  country: string
  state_province: string | null
  city: string | null
}

type EnrichmentRow = {
  confidence: number
  ran_at: string
}

type OrgRow = {
  id: string
  name: string
  domain: string | null
  org_type: string
  industry: string | null
  approx_size: string | null
  customer_status: string
  signal_links: SignalLinkRow[]
  locations: LocationRow[]
  enrichment_runs: EnrichmentRow[]
}

export default async function CelordProspectsPage() {
  const adminClient = createAdminClient()

  const { data: orgs, error } = await adminClient
    .from('organizations')
    .select(`
      id, name, domain, org_type, industry, approx_size, customer_status,
      signal_links ( confidence, method, signals ( source, source_url, snippet, org_hint, org_domain, country, state_province, signal_date, collected_at ) ),
      locations ( label, country, state_province, city ),
      enrichment_runs ( confidence, ran_at )
    `)
    .neq('customer_status', 'do_not_contact')
    .order('created_at', { ascending: true })

  const hasDb = !error && orgs && orgs.length > 0

  if (!hasDb) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Pentaho CE Prospects</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Organizations showing signals of Pentaho Community Edition usage
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-gray-500">
          <p className="text-base font-medium">No prospects yet</p>
          <p className="text-sm text-gray-400 max-w-sm text-center">
            Trigger a collector cron to populate the database, or run{' '}
            <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
              curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; /api/celord/collect/github
            </code>
          </p>
        </div>
      </div>
    )
  }

  // ── Build ScoredOrg rows from DB data ──────────────────────────────────────

  const rows = ((orgs as unknown) as OrgRow[]).flatMap(org => {
    const signals: RawSignal[] = org.signal_links
      .flatMap(sl => sl.signals)
      .filter((s): s is SignalRow => s !== null)
      .map(s => ({
        source:         s.source as SignalSource,
        source_url:     s.source_url,
        snippet:        s.snippet,
        org_hint:       s.org_hint,
        org_domain:     s.org_domain,
        country:        s.country,
        state_province: s.state_province,
        signal_date:    s.signal_date,
        collected_at:   s.collected_at,
      }))

    if (signals.length === 0) return []

    const scored = scoreOrg(org.name, signals)

    // Prefer billing_hq location from enrichment; fall back to signal-derived
    const billingHq = org.locations.find(l => l.label === 'billing_hq')
    const country      = billingHq?.country       ?? scored.country
    const stateProvince = billingHq?.state_province ?? scored.stateProvince

    // Latest enrichment confidence
    const latestEnrichment = org.enrichment_runs
      .sort((a, b) => b.ran_at.localeCompare(a.ran_at))[0]

    return [{
      ...scored,
      country,
      stateProvince,
      orgId:                org.id,
      orgType:              org.org_type,
      industry:             org.industry,
      approxSize:           org.approx_size,
      customerStatus:       org.customer_status,
      enrichmentConfidence: latestEnrichment?.confidence ?? null,
    }]
  })

  rows.sort((a, b) => b.score - a.score)

  const unenriched = rows.filter(r => r.enrichmentConfidence === null).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pentaho CE Prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Organizations showing signals of Pentaho Community Edition usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unenriched > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-amber-300 bg-amber-50">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="text-sm text-amber-700">
                {unenriched} org{unenriched !== 1 ? 's' : ''} pending enrichment
              </span>
            </div>
          )}
        </div>
      </div>

      <ProspectsTable orgs={rows} />
    </div>
  )
}
