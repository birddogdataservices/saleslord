'use client'

import React, { useState, useMemo } from 'react'
import type { ScoredOrg } from '@/signals/scoring'
import type { SignalSource } from '@/core/types'

const SOURCE_LABEL: Record<SignalSource, string> = {
  github:        'GitHub',
  shodan:        'Shodan',
  jobs:          'Job posting',
  forum:         'Forum',
  stackoverflow: 'Stack Overflow',
  conference:    'Conference',
}

const SOURCE_COLOR: Record<SignalSource, string> = {
  github:        'bg-purple-100 text-purple-700',
  shodan:        'bg-red-100 text-red-700',
  jobs:          'bg-blue-100 text-blue-700',
  forum:         'bg-amber-100 text-amber-700',
  stackoverflow: 'bg-orange-100 text-orange-700',
  conference:    'bg-teal-100 text-teal-700',
}

function scoreBadge(score: number) {
  if (score >= 70) return 'bg-green-100 text-green-700'
  if (score >= 50) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-500'
}

type SortKey = 'score' | 'signals' | 'org'
type SortDir = 'asc' | 'desc'

export function ProspectsTable({ orgs }: { orgs: ScoredOrg[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [countryFilter, setCountryFilter] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('all')

  const countries = useMemo(() => {
    const set = new Set(orgs.map(o => o.country).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [orgs])

  const states = useMemo(() => {
    const filtered = countryFilter === 'all'
      ? orgs
      : orgs.filter(o => o.country === countryFilter)
    const set = new Set(filtered.map(o => o.stateProvince).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [orgs, countryFilter])

  const visible = useMemo(() => {
    let rows = [...orgs]
    if (countryFilter !== 'all') rows = rows.filter(o => o.country === countryFilter)
    if (stateFilter !== 'all') rows = rows.filter(o => o.stateProvince === stateFilter)
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'score') cmp = a.score - b.score
      else if (sortKey === 'signals') cmp = a.signals.length - b.signals.length
      else cmp = a.orgHint.localeCompare(b.orgHint)
      return sortDir === 'desc' ? -cmp : cmp
    })
    return rows
  }, [orgs, countryFilter, stateFilter, sortKey, sortDir])

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
      ['Organization', 'Score', 'Signals', 'Top Source', 'Country', 'State/Province', 'Domain'],
      ...visible.map(o => [
        o.orgHint,
        o.score,
        o.signals.length,
        SOURCE_LABEL[o.topSource],
        o.country ?? '',
        o.stateProvince ?? '',
        o.domain ?? '',
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Territory</span>
        <select
          className="text-sm bg-white border border-gray-300 rounded px-2 py-1 text-gray-800"
          value={countryFilter}
          onChange={e => { setCountryFilter(e.target.value); setStateFilter('all') }}
        >
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {countryFilter !== 'all' && states.length > 0 && (
          <select
            className="text-sm bg-white border border-gray-300 rounded px-2 py-1 text-gray-800"
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
          >
            <option value="all">All states / provinces</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="text-sm text-gray-400 ml-1">{visible.length} orgs</span>
        <button
          onClick={exportCsv}
          className="ml-auto text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-base border-collapse">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
            <tr>
              {col('org', 'Organization')}
              {col('score', 'Score')}
              {col('signals', 'Signals')}
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Top source</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Territory</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500">Domain</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(org => (
              <React.Fragment key={org.orgHint}>
                <tr
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === org.orgHint ? null : org.orgHint)}
                >
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    <span className="mr-2 text-gray-400 text-sm">{expanded === org.orgHint ? '▾' : '▸'}</span>
                    {org.orgHint}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-sm font-mono font-semibold ${scoreBadge(org.score)}`}>
                      {org.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {org.signals.length}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-sm ${SOURCE_COLOR[org.topSource]}`}>
                      {SOURCE_LABEL[org.topSource]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {[org.stateProvince, org.country].filter(Boolean).join(', ')}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {org.domain ?? '—'}
                  </td>
                </tr>
                {expanded === org.orgHint && (
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="flex gap-6 mb-3 text-sm text-gray-500">
                        <span>Usage confidence <strong className="text-gray-800">{Math.round(org.dimensions.usageConfidence * 100)}</strong></span>
                        <span>Scale <strong className="text-gray-800">{Math.round(org.dimensions.scale * 100)}</strong></span>
                        <span>Risk posture <strong className="text-gray-800">{Math.round(org.dimensions.riskPosture * 100)}</strong></span>
                        <span>Reachability <strong className="text-gray-800">{Math.round(org.dimensions.reachability * 100)}</strong></span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {org.signals.map((sig, i) => (
                          <div key={i} className="border border-gray-200 rounded p-3 bg-white">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-sm ${SOURCE_COLOR[sig.source]}`}>
                                {SOURCE_LABEL[sig.source]}
                              </span>
                              {sig.signal_date && (
                                <span className="text-sm text-gray-400">{sig.signal_date}</span>
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
            ))}
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
