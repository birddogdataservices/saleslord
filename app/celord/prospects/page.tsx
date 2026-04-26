export const dynamic = 'force-dynamic'

import Link from 'next/link'
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

// ── Shared header ─────────────────────────────────────────────────────────────

function PageHeader({ unenriched = 0 }: { unenriched?: number }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
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
        <Link
          href="/celord/import"
          className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Import CSV
        </Link>
        <Link
          href="/celord/admin"
          className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Admin
        </Link>
      </div>
    </div>
  )
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
      <div className="flex flex-col flex-1 min-h-0 bg-white">
        <PageHeader />
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-base font-medium text-gray-600">No signal data yet</p>
          <p className="text-sm text-gray-400 max-w-xs text-center leading-relaxed">
            Use the <Link href="/celord/admin" className="underline underline-offset-2 hover:text-gray-700">Admin panel</Link> to run signal collection, then come back here to see results.
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

    const billingHq = org.locations.find(l => l.label === 'billing_hq')
    const country       = billingHq?.country        ?? scored.country
    const stateProvince = billingHq?.state_province ?? scored.stateProvince

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
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <PageHeader unenriched={unenriched} />
      <ProspectsTable orgs={rows} />
    </div>
  )
}
