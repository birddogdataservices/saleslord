'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Run = {
  id: string
  region_code: string
  status: string
  candidate_count: number
  error: string | null
  created_at: string
  completed_at: string | null
  icp_profiles: { name: string } | null
}

type IcpProfile = { id: string; name: string }
type TerritoryRow = { region_code: string }

const STATUS_STYLES: Record<string, string> = {
  complete: 'text-green-700',
  running:  'text-blue-600',
  failed:   'text-red-600',
  pending:  'text-gray-500',
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [icpProfiles, setIcpProfiles] = useState<IcpProfile[]>([])
  const [territory, setTerritory] = useState<TerritoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: rep } = await supabase
      .from('rep_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!rep) return

    const [runsResult, icpResult, terrResult] = await Promise.all([
      supabase
        .from('territorylord_runs')
        .select('id, region_code, status, candidate_count, error, created_at, completed_at, icp_profiles ( name )')
        .eq('rep_id', rep.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('icp_profiles').select('id, name').eq('rep_id', rep.id).order('created_at'),
      supabase
        .from('territories').select('region_code').eq('rep_id', rep.id),
    ])

    setRuns((runsResult.data ?? []) as unknown as Run[])
    setIcpProfiles((icpResult.data ?? []) as IcpProfile[])
    setTerritory((terrResult.data ?? []) as TerritoryRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">TerritoryLord</h1>
          <p className="text-sm text-gray-500 mt-0.5">Run a territory search to find candidate accounts in your region.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/territorylord/territory"
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            My territory
          </Link>
          <Link
            href="/territorylord/icp"
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ICP profiles
          </Link>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm px-4 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors"
          >
            New run
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 max-w-3xl space-y-4">
        {showForm && (
          <NewRunForm
            icpProfiles={icpProfiles}
            territory={territory}
            onCancel={() => setShowForm(false)}
            onCreated={run => {
              setRuns(prev => [run, ...prev])
              setShowForm(false)
            }}
          />
        )}

        {!showForm && runs.length === 0 && (
          <div className="text-sm text-gray-400 space-y-1">
            <p>No runs yet.</p>
            {territory.length === 0 && (
              <p>First, <Link href="/territorylord/territory" className="text-gray-700 underline">set up your territory</Link>.</p>
            )}
            {icpProfiles.length === 0 && (
              <p>Then, <Link href="/territorylord/icp" className="text-gray-700 underline">create an ICP profile</Link>.</p>
            )}
          </div>
        )}

        {runs.map(run => (
          <div key={run.id} className="border border-gray-200 rounded p-4 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 text-sm">{run.region_code}</span>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">
                  {(run.icp_profiles as { name: string } | null)?.name ?? '—'}
                </span>
              </div>
              <div className={`text-xs mt-0.5 ${STATUS_STYLES[run.status] ?? 'text-gray-500'}`}>
                {run.status === 'complete' && `${run.candidate_count} candidate${run.candidate_count !== 1 ? 's' : ''}`}
                {run.status === 'running' && 'Running…'}
                {run.status === 'pending' && 'Pending'}
                {run.status === 'failed' && `Failed${run.error ? ': ' + run.error : ''}`}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(run.created_at)}</div>
            </div>
            {run.status === 'complete' && run.candidate_count > 0 && (
              <Link
                href={`/territorylord/runs/${run.id}`}
                className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 shrink-0 transition-colors"
              >
                View results
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function NewRunForm({
  icpProfiles, territory, onCancel, onCreated,
}: {
  icpProfiles: IcpProfile[]
  territory: TerritoryRow[]
  onCancel: () => void
  onCreated: (run: Run) => void
}) {
  const [regionCode, setRegionCode] = useState(territory[0]?.region_code ?? '')
  const [icpProfileId, setIcpProfileId] = useState(icpProfiles[0]?.id ?? '')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function startRun() {
    if (!regionCode || !icpProfileId) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/territorylord/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code: regionCode, icp_profile_id: icpProfileId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Run failed'); return }
      router.push(`/territorylord/runs/${data.run_id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  if (territory.length === 0) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded p-4 text-sm text-amber-800">
        No territory defined.{' '}
        <Link href="/territorylord/territory" className="underline">Set up your territory</Link> first.
      </div>
    )
  }

  if (icpProfiles.length === 0) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded p-4 text-sm text-amber-800">
        No ICP profiles.{' '}
        <Link href="/territorylord/icp" className="underline">Create an ICP profile</Link> first.
      </div>
    )
  }

  return (
    <div className="border border-gray-300 rounded p-4 space-y-4">
      <h2 className="text-sm font-medium text-gray-900">New run</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Region</label>
          <select
            value={regionCode}
            onChange={e => setRegionCode(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {territory.map(t => (
              <option key={t.region_code} value={t.region_code}>{t.region_code}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">ICP profile</label>
          <select
            value={icpProfileId}
            onChange={e => setIcpProfileId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            {icpProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-gray-400">
        Queries Wikidata for companies in {regionCode || 'the selected region'} and classifies industries.
        This may take 30–60 seconds.
      </p>
      <div className="flex gap-2">
        <button
          onClick={startRun}
          disabled={running || !regionCode || !icpProfileId}
          className="text-sm px-4 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {running ? 'Running…' : 'Start run'}
        </button>
        <button
          onClick={onCancel}
          disabled={running}
          className="text-sm px-4 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
