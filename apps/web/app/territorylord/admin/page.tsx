'use client'

import { useState } from 'react'
import Link from 'next/link'

type JobState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'done'; ok: boolean; summary: string; elapsed: number }

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  import('react').then(({ useEffect }) => {
    // note: hook rules mean we rely on the parent's re-render cadence here
  })
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return <span>{m > 0 ? `${m}m ` : ''}{s}s</span>
}

export default function TerritoryLordAdminPage() {
  const [regionCode, setRegionCode] = useState('US-IL')
  const [icpId, setIcpId] = useState('')
  const [state, setState] = useState<JobState>({ status: 'idle' })

  async function run() {
    if (!regionCode || !icpId) return
    const startedAt = Date.now()
    setState({ status: 'running', startedAt })

    try {
      const res = await fetch('/api/territorylord/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code: regionCode, icp_profile_id: icpId }),
      })
      const data = await res.json()
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      if (res.ok && data.ok) {
        setState({ status: 'done', ok: true, summary: `run_id: ${data.run_id} · ${data.candidate_count} candidates`, elapsed })
      } else {
        setState({ status: 'done', ok: false, summary: data.error ?? 'Failed', elapsed })
      }
    } catch (err) {
      setState({ status: 'done', ok: false, summary: (err as Error).message, elapsed: Math.round((Date.now() - Date.now()) / 1000) })
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <Link href="/territorylord/runs" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
          ← Back to runs
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">TerritoryLord admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manually trigger a test run for a region and ICP profile ID.</p>
      </div>

      <div className="flex-1 px-6 py-6 max-w-lg space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Region code (ISO 3166-2)</label>
          <input
            type="search"
            value={regionCode}
            onChange={e => setRegionCode(e.target.value.toUpperCase())}
            placeholder="e.g. US-IL"
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">ICP profile ID (UUID)</label>
          <input
            type="search"
            value={icpId}
            onChange={e => setIcpId(e.target.value.trim())}
            placeholder="Paste UUID from ICP profiles page"
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>

        <div className="border border-gray-200 rounded p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900">Wikidata run</div>
              <div className="text-xs text-gray-400 mt-0.5">
                Queries Wikidata for {regionCode || 'the region'}, resolves orgs, classifies industries.
              </div>
              <div className="mt-2 text-xs min-h-[1.25rem]">
                {state.status === 'running' && (
                  <span className="text-blue-600 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Running…
                  </span>
                )}
                {state.status === 'done' && (
                  <span className={state.ok ? 'text-green-700' : 'text-red-600'}>
                    {state.ok ? '✓' : '✗'} {state.summary}{' '}
                    <span className="text-gray-400">({state.elapsed}s)</span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={run}
              disabled={state.status === 'running' || !regionCode || !icpId}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors shrink-0"
            >
              Run
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
