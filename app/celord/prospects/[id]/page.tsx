export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CustomerStatus, SignalSource } from '@/core/types'
import { OrgStatusActions } from '@/components/celord/OrgStatusActions'
import { STATUS_BADGE } from '@/components/celord/statusConfig'

// ── DB row shapes ──────────────────────────────────────────────────────────────

type SignalRow = {
  source: string
  source_url: string
  snippet: string
  org_hint: string
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
  model: string
  billing_hq_country: string | null
  billing_hq_state: string | null
  billing_hq_city: string | null
  org_type: string | null
  parent_org_name: string | null
  confidence: number
  ran_at: string
}

type StatusHistoryRow = {
  status: string
  source: string
  note: string | null
  changed_at: string
}

type OrgDetailRow = {
  id: string
  name: string
  domain: string | null
  org_type: string
  industry: string | null
  approx_size: string | null
  customer_status: string
  customer_status_source: string | null
  customer_status_at: string | null
  signal_links: SignalLinkRow[]
  locations: LocationRow[]
  enrichment_runs: EnrichmentRow[]
  org_status_history: StatusHistoryRow[]
}

// ── Display helpers ────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  github:        'GitHub',
  jobs:          'Job posting',
  forum:         'Forum',
  stackoverflow: 'Stack Overflow',
  conference:    'Conference',
}

const SOURCE_COLOR: Record<string, string> = {
  github:        'bg-purple-100 text-purple-700',
  jobs:          'bg-blue-100 text-blue-700',
  forum:         'bg-amber-100 text-amber-700',
  stackoverflow: 'bg-orange-100 text-orange-700',
  conference:    'bg-teal-100 text-teal-700',
}

const ORG_TYPE_LABEL: Record<string, string> = {
  end_user:          'End user',
  integrator:        'Integrator',
  vendor:            'Vendor',
  training_provider: 'Training',
  unknown:           'Unknown',
}


const STATUS_SOURCE_LABEL: Record<string, string> = {
  csv_import: 'CSV import',
  crm_sync:   'CRM sync',
  manual:     'Manual',
}

function fmt(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('organizations')
    .select(`
      id, name, domain, org_type, industry, approx_size,
      customer_status, customer_status_source, customer_status_at,
      signal_links ( confidence, method,
        signals ( source, source_url, snippet, org_hint, signal_date, collected_at )
      ),
      locations ( label, country, state_province, city ),
      enrichment_runs ( model, billing_hq_country, billing_hq_state, billing_hq_city,
        org_type, parent_org_name, confidence, ran_at ),
      org_status_history ( status, source, note, changed_at )
    `)
    .eq('id', id)
    .single()

  if (error || !data) notFound()

  const org = data as unknown as OrgDetailRow

  const signals: SignalRow[] = org.signal_links
    .flatMap(sl => sl.signals)
    .filter((s): s is SignalRow => s !== null)
    .sort((a, b) => {
      const da = a.signal_date ?? a.collected_at
      const db = b.signal_date ?? b.collected_at
      return db.localeCompare(da)
    })

  const latestEnrichment = org.enrichment_runs
    .sort((a, b) => b.ran_at.localeCompare(a.ran_at))[0] ?? null

  const statusHistory = [...org.org_status_history].sort(
    (a, b) => b.changed_at.localeCompare(a.changed_at)
  )

  const billingHq = org.locations.find(l => l.label === 'billing_hq')
  const statusBadge = STATUS_BADGE[org.customer_status as CustomerStatus]
    ?? { label: 'Unknown', cls: 'bg-gray-50 text-gray-400' }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <Link
          href="/celord/prospects"
          className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block"
        >
          ← Back to prospects
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">{org.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              {org.domain && <span>{org.domain}</span>}
              {billingHq && (
                <span>
                  {[billingHq.city, billingHq.state_province, billingHq.country]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              )}
              <span>{ORG_TYPE_LABEL[org.org_type] ?? org.org_type}</span>
              {org.industry && <span>{org.industry}</span>}
              {org.approx_size && <span>{org.approx_size}</span>}
            </div>
          </div>
          <span className={`text-sm px-2.5 py-1 rounded font-medium shrink-0 ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-8 max-w-4xl">
        {/* Status actions */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Status
          </h2>
          <OrgStatusActions orgId={org.id} initial={org.customer_status as CustomerStatus} />
        </section>

        {/* Enrichment */}
        {latestEnrichment && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Enrichment
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {latestEnrichment.billing_hq_country && (
                <>
                  <span className="text-gray-500">Billing HQ</span>
                  <span className="text-gray-900">
                    {[
                      latestEnrichment.billing_hq_city,
                      latestEnrichment.billing_hq_state,
                      latestEnrichment.billing_hq_country,
                    ].filter(Boolean).join(', ')}
                  </span>
                </>
              )}
              {latestEnrichment.org_type && (
                <>
                  <span className="text-gray-500">Org type</span>
                  <span className="text-gray-900">{ORG_TYPE_LABEL[latestEnrichment.org_type] ?? latestEnrichment.org_type}</span>
                </>
              )}
              {latestEnrichment.parent_org_name && (
                <>
                  <span className="text-gray-500">Parent org</span>
                  <span className="text-gray-900">{latestEnrichment.parent_org_name}</span>
                </>
              )}
              <>
                <span className="text-gray-500">Confidence</span>
                <span className="text-gray-900">{Math.round(latestEnrichment.confidence * 100)}%</span>
              </>
              <>
                <span className="text-gray-500">Model</span>
                <span className="text-gray-900 font-mono text-xs">{latestEnrichment.model}</span>
              </>
              <>
                <span className="text-gray-500">Last run</span>
                <span className="text-gray-900">{fmt(latestEnrichment.ran_at)}</span>
              </>
            </div>
          </section>
        )}

        {/* Signals */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Signals ({signals.length})
          </h2>
          <div className="space-y-3">
            {signals.map((sig, i) => (
              <div key={i} className="border border-gray-200 rounded p-4 bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-sm ${SOURCE_COLOR[sig.source] ?? 'bg-gray-100 text-gray-600'}`}>
                    {SOURCE_LABEL[sig.source] ?? sig.source}
                  </span>
                  {sig.signal_date && (
                    <span className="text-sm text-gray-400">{sig.signal_date.slice(0, 10)}</span>
                  )}
                  <span className="text-sm text-gray-400 ml-auto">
                    Collected {fmt(sig.collected_at)}
                  </span>
                  <a
                    href={sig.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2"
                  >
                    Source ↗
                  </a>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{sig.snippet}</p>
                <p className="text-xs text-gray-400 mt-1">Hint: {sig.org_hint}</p>
              </div>
            ))}
            {signals.length === 0 && (
              <p className="text-sm text-gray-400">No signals linked to this org.</p>
            )}
          </div>
        </section>

        {/* Status history */}
        {statusHistory.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Status history
            </h2>
            <div className="space-y-2">
              {statusHistory.map((h, i) => {
                const badge = STATUS_BADGE[h.status as CustomerStatus] ?? STATUS_BADGE.unknown
                return (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 shrink-0 w-28">{fmt(h.changed_at)}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="text-gray-500 text-xs shrink-0">
                      via {STATUS_SOURCE_LABEL[h.source] ?? h.source}
                    </span>
                    {h.note && <span className="text-gray-600">{h.note}</span>}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
