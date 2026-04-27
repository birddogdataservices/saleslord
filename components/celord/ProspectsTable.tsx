'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { ScoredOrg } from '@/signals/scoring'
import type { SignalSource } from '@/core/types'
import { STATUS_OPTIONS, STATUS_BADGE } from './statusConfig'

export type ProspectRow = ScoredOrg & {
  orgId?: string
  orgType?: string
  industry?: string | null
  approxSize?: string | null
  customerStatus?: string
  enrichmentConfidence?: number | null
}

const SOURCE_LABEL: Record<SignalSource, string> = {
  github:        'GitHub',
  docker:        'Docker Hub',
  jobs:          'Job posting',
  forum:         'Forum',
  stackoverflow: 'Stack Overflow',
  conference:    'Conference',
}

const SOURCE_COLOR: Record<SignalSource, string> = {
  github:        'bg-purple-100 text-purple-700',
  docker:        'bg-sky-100 text-sky-700',
  jobs:          'bg-blue-100 text-blue-700',
  forum:         'bg-amber-100 text-amber-700',
  stackoverflow: 'bg-orange-100 text-orange-700',
  conference:    'bg-teal-100 text-teal-700',
}

// STATUS_OPTIONS and STATUS_BADGE imported from ./statusConfig

function StatusPicker({
  orgId,
  current,
  onChanged,
}: {
  orgId: string
  current: string
  onChanged: (next: string) => void
}) {
  const [saving, setSaving] = useState(false)

  async function pick(status: string) {
    if (status === current || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/celord/orgs/${orgId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) onChanged(status)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-500 mr-1">Status</span>
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          disabled={saving}
          onClick={() => pick(opt.value)}
          className={`text-xs px-2.5 py-1 rounded transition-colors ${opt.cls} ${
            current === opt.value ? 'ring-2 ring-offset-1 ring-gray-400' : ''
          } disabled:opacity-50`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

const ORG_TYPE_LABEL: Record<string, string> = {
  end_user:         'End user',
  integrator:       'Integrator',
  vendor:           'Vendor',
  training_provider: 'Training',
  unknown:          'Unknown',
}


// ── Multi-select dropdown ─────────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(opt: string) {
    const next = new Set(selected)
    if (next.has(opt)) next.delete(opt)
    else next.add(opt)
    onChange(next)
  }

  const summary = selected.size === 0
    ? `All ${label.toLowerCase()}`
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} ${label.toLowerCase()}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 flex items-center gap-1.5 min-w-[120px]"
      >
        <span className="flex-1 text-left truncate">{summary}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && options.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 bg-white border border-gray-200 rounded shadow-md min-w-[160px] max-h-64 overflow-y-auto">
          {selected.size > 0 && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
              onClick={() => onChange(new Set())}
            >
              Clear
            </button>
          )}
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="accent-gray-700"
              />
              <span className="text-sm text-gray-800">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'unknown',                      label: 'Unknown' },
  { value: 'prospect',                     label: 'Prospect' },
  { value: 'active_customer',              label: 'Customer' },
  { value: 'former_customer',              label: 'Former customer' },
  { value: 'failed_enterprise_conversion', label: 'Failed conv.' },
  { value: 'lead_created_in_crm',           label: 'Lead in CRM' },
  { value: 'irrelevant',                   label: 'Irrelevant' },
  { value: 'do_not_contact',               label: 'Do not contact' },
]

function StatusMultiSelect({ selected, onChange }: { selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(val: string) {
    const next = new Set(selected)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    onChange(next)
  }

  const summary = selected.size === 0
    ? 'Nothing'
    : STATUS_FILTER_OPTIONS.filter(o => selected.has(o.value)).map(o => o.label).join(', ')

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm bg-white border border-gray-300 rounded px-2 py-1 text-gray-800 flex items-center gap-1.5 min-w-[120px] max-w-[220px]"
      >
        <span className="flex-1 text-left truncate">{summary}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 bg-white border border-gray-200 rounded shadow-md min-w-[180px]">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-gray-700"
              />
              <span className="text-sm text-gray-800">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function scoreBadge(score: number) {
  if (score >= 70) return 'bg-green-100 text-green-700'
  if (score >= 50) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-500'
}

type SortKey = 'score' | 'signals' | 'date' | 'org'

function latestSignalDate(signals: { signal_date: string | null }[]): string | null {
  const dates = signals.map(s => s.signal_date).filter(Boolean) as string[]
  return dates.length > 0 ? dates.sort().at(-1)! : null
}
type SortDir = 'asc' | 'desc'

export function ProspectsTable({ orgs }: { orgs: ProspectRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [countryFilter, setCountryFilter] = useState<Set<string>>(new Set())
  const [stateFilter, setStateFilter] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [industryFilter, setIndustryFilter] = useState<Set<string>>(new Set())
  const [sizeFilter, setSizeFilter] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(['do_not_contact', 'irrelevant', 'lead_created_in_crm']))
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set())
  const [sinceYear, setSinceYear] = useState<number | null>(null)
  // Local status overrides — populated after inline status changes
  const [statusOverrides, setStatusOverrides] = useState<Map<string, string>>(new Map())

  const countries = useMemo(() => {
    const set = new Set(orgs.map(o => o.country).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [orgs])

  const states = useMemo(() => {
    const filtered = countryFilter.size === 0 ? orgs : orgs.filter(o => o.country && countryFilter.has(o.country))
    const set = new Set(filtered.map(o => o.stateProvince).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [orgs, countryFilter])

  const orgTypes = useMemo(() => {
    const set = new Set(orgs.map(o => o.orgType).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [orgs])

  const industries = useMemo(() => {
    const set = new Set(orgs.map(o => o.industry).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [orgs])

  const sizes = useMemo(() => {
    const order = ['Enterprise', 'Mid-market', 'SMB', 'unknown']
    const set = new Set(orgs.map(o => o.approxSize).filter(Boolean) as string[])
    return order.filter(s => set.has(s))
  }, [orgs])

  const sourceLabels = useMemo(() => {
    const set = new Set(orgs.flatMap(o => o.signals.map(s => s.source)))
    // Preserve display order defined in SOURCE_LABEL
    return (Object.keys(SOURCE_LABEL) as SignalSource[])
      .filter(s => set.has(s))
      .map(s => SOURCE_LABEL[s])
  }, [orgs])

  // Years that actually appear in signal_date values, descending
  const signalYears = useMemo(() => {
    const set = new Set<number>()
    for (const org of orgs) {
      for (const sig of org.signals) {
        if (sig.signal_date) set.add(Number(sig.signal_date.slice(0, 4)))
      }
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [orgs])

  const rowKey = (org: ProspectRow) => org.orgId ?? org.orgHint

  const visible = useMemo(() => {
    let rows = [...orgs]
    rows = rows.filter(o => {
      const key = rowKey(o)
      const status = statusOverrides.get(key) ?? o.customerStatus ?? 'unknown'
      return !statusFilter.has(status)
    })
    if (countryFilter.size > 0) rows = rows.filter(o => o.country && countryFilter.has(o.country))
    if (stateFilter.size > 0) rows = rows.filter(o => o.stateProvince && stateFilter.has(o.stateProvince))
    if (typeFilter !== 'all') rows = rows.filter(o => o.orgType === typeFilter)
    if (industryFilter.size > 0) rows = rows.filter(o => o.industry && industryFilter.has(o.industry))
    if (sizeFilter.size > 0) rows = rows.filter(o => o.approxSize && sizeFilter.has(o.approxSize))
    if (sourceFilter.size > 0) rows = rows.filter(o => o.signals.some(s => sourceFilter.has(SOURCE_LABEL[s.source])))
    if (sinceYear !== null) {
      const cutoff = `${sinceYear}-01-01`
      rows = rows.filter(o => o.signals.some(s => s.signal_date && s.signal_date >= cutoff))
    }
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'score') cmp = a.score - b.score
      else if (sortKey === 'signals') cmp = a.signals.length - b.signals.length
      else if (sortKey === 'date') {
        const aDate = latestSignalDate(a.signals)
        const bDate = latestSignalDate(b.signals)
        if (!aDate && !bDate) cmp = 0
        else if (!aDate) cmp = -1   // nulls sort last
        else if (!bDate) cmp = 1
        else cmp = aDate < bDate ? -1 : aDate > bDate ? 1 : 0
      }
      else cmp = a.orgHint.localeCompare(b.orgHint)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return rows
  }, [orgs, countryFilter, stateFilter, typeFilter, industryFilter, sizeFilter, statusFilter, sourceFilter, sinceYear, sortKey, sortDir, statusOverrides])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function exportCsv() {
    const rows = [
      ['Organization', 'Score', 'Signals', 'Latest Signal', 'Top Source', 'Country', 'State/Province', 'Industry', 'Revenue Band', 'Type', 'Domain', 'Status'],
      ...visible.map(o => [
        o.orgHint,
        o.score,
        o.signals.length,
        latestSignalDate(o.signals)?.slice(0, 10) ?? '',
        SOURCE_LABEL[o.topSource],
        o.country ?? '',
        o.stateProvince ?? '',
        o.industry ?? '',
        o.approxSize ?? '',
        ORG_TYPE_LABEL[o.orgType ?? 'unknown'] ?? '',
        o.domain ?? '',
        o.customerStatus ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'celord-prospects.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const col = (key: SortKey, label: string) => (
    <th
      className="px-4 py-3 text-left text-sm font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-800 whitespace-nowrap"
      onClick={() => toggleSort(key)}
    >
      {label} {sortKey === key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Territory</span>
        <MultiSelect
          label="Countries"
          options={countries}
          selected={countryFilter}
          onChange={next => { setCountryFilter(next); setStateFilter(new Set()) }}
        />
        {states.length > 0 && (
          <MultiSelect
            label="States"
            options={states}
            selected={stateFilter}
            onChange={setStateFilter}
          />
        )}
        {orgTypes.length > 1 && (
          <>
            <span className="text-sm font-medium text-gray-600 ml-2">Type</span>
            <select
              className="text-sm bg-white border border-gray-300 rounded px-2 py-1 text-gray-800"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">All types</option>
              {orgTypes.map(t => (
                <option key={t} value={t}>{ORG_TYPE_LABEL[t] ?? t}</option>
              ))}
            </select>
          </>
        )}
        {industries.length > 1 && (
          <>
            <span className="text-sm font-medium text-gray-600 ml-2">Industry</span>
            <MultiSelect label="Industries" options={industries} selected={industryFilter} onChange={setIndustryFilter} />
          </>
        )}
        {sizes.length > 1 && (
          <>
            <span className="text-sm font-medium text-gray-600 ml-2">Revenue</span>
            <MultiSelect label="Sizes" options={sizes} selected={sizeFilter} onChange={setSizeFilter} />
          </>
        )}
        {sourceLabels.length > 1 && (
          <>
            <span className="text-sm font-medium text-gray-600 ml-2">Source</span>
            <MultiSelect
              label="Sources"
              options={sourceLabels}
              selected={sourceFilter}
              onChange={setSourceFilter}
            />
          </>
        )}
        {signalYears.length > 1 && (
          <>
            <span className="text-sm font-medium text-gray-600 ml-2">Since</span>
            <select
              className="text-sm bg-white border border-gray-300 rounded px-2 py-1 text-gray-800"
              value={sinceYear ?? ''}
              onChange={e => setSinceYear(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All time</option>
              {signalYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}
        <>
          <span className="text-sm font-medium text-gray-600 ml-2">Hide</span>
          <StatusMultiSelect selected={statusFilter} onChange={setStatusFilter} />
        </>
        <span className="text-sm text-gray-400 ml-1">{visible.length} orgs</span>
        <button
          onClick={exportCsv}
          className="ml-auto text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-base border-collapse">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
            <tr>
              {col('org', 'Organization')}
              {col('score', 'Score')}
              {col('signals', 'Signals')}
              {col('date', 'Latest signal')}
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Top source</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Country</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">State/Province</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Industry</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Revenue</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Type</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Domain</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(org => {
              const key = rowKey(org)
              const currentStatus = statusOverrides.get(key) ?? org.customerStatus ?? 'unknown'
              const statusBadge = STATUS_BADGE[currentStatus as keyof typeof STATUS_BADGE]
              return (
                <React.Fragment key={key}>
                  <tr
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === key ? null : key)}
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      <span className="mr-2 text-gray-400 text-sm">{expanded === key ? '▾' : '▸'}</span>
                      {org.orgHint}
                      {statusBadge?.label && (
                        <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-xs ${statusBadge.cls}`}>
                          {statusBadge.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-sm font-mono font-semibold ${scoreBadge(org.score)}`}>
                        {org.score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{org.signals.length}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm tabular-nums">
                      {latestSignalDate(org.signals)?.slice(0, 10) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-sm ${SOURCE_COLOR[org.topSource]}`}>
                        {SOURCE_LABEL[org.topSource]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{org.country ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{org.stateProvince ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{org.industry ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 text-sm">{org.approxSize ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {ORG_TYPE_LABEL[org.orgType ?? 'unknown']}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{org.domain ?? '—'}</td>
                  </tr>
                  {expanded === key && (
                    <tr className="bg-gray-50">
                      <td colSpan={10} className="px-6 py-4">
                        <div className="flex gap-6 mb-3 text-sm text-gray-500 flex-wrap">
                          <span>Usage confidence <strong className="text-gray-800">{Math.round(org.dimensions.usageConfidence * 100)}</strong></span>
                          <span>Scale <strong className="text-gray-800">{Math.round(org.dimensions.scale * 100)}</strong></span>
                          <span>Risk posture <strong className="text-gray-800">{Math.round(org.dimensions.riskPosture * 100)}</strong></span>
                          <span>Reachability <strong className="text-gray-800">{Math.round(org.dimensions.reachability * 100)}</strong></span>
                          {org.enrichmentConfidence != null && (
                            <span>Enrichment confidence <strong className="text-gray-800">{Math.round(org.enrichmentConfidence * 100)}%</strong></span>
                          )}
                        </div>
                        {org.orgId && (
                          <div className="mb-4 flex items-start justify-between gap-4">
                            <StatusPicker
                              orgId={org.orgId}
                              current={currentStatus}
                              onChanged={next => {
                                setStatusOverrides(prev => new Map(prev).set(key, next))
                                if (statusFilter.has(next)) setExpanded(null)
                              }}
                            />
                            <Link
                              href={`/celord/prospects/${org.orgId}`}
                              onClick={e => e.stopPropagation()}
                              className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2 shrink-0"
                            >
                              Details →
                            </Link>
                          </div>
                        )}
                        <div className="flex flex-col gap-2">
                          {org.signals.map((sig, i) => (
                            <div key={i} className="border border-gray-200 rounded p-3 bg-white">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-sm ${SOURCE_COLOR[sig.source]}`}>
                                  {SOURCE_LABEL[sig.source]}
                                </span>
                                {sig.signal_date && (
                                  <span className="text-sm text-gray-400">{sig.signal_date.slice(0, 10)}</span>
                                )}
                                <a
                                  href={sig.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="ml-auto text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2"
                                >
                                  Source ↗
                                </a>
                              </div>
                              <p className="text-sm text-gray-700 leading-relaxed">{sig.snippet}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-32 text-base text-gray-400">
            No organizations match the current filter.
          </div>
        )}
      </div>
    </div>
  )
}
