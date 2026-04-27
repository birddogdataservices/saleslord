'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type Job = 'github' | 'jobs' | 'stackoverflow' | 'dockerhub' | 'enrich'

type JobState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number; abortController: AbortController }
  | { status: 'done'; ok: boolean; summary: string; warn?: string; elapsed: number }
  | { status: 'aborted' }

type JobResult = { ok: boolean; [key: string]: unknown }

const JOBS: { id: Job; label: string; description: string }[] = [
  { id: 'github', label: 'GitHub collector', description: 'Search GitHub for .ktr / .kjb / pom.xml Pentaho references' },
  { id: 'jobs',          label: 'Jobs collector',          description: 'Search job postings for Pentaho CE mentions (SerpApi / Adzuna)' },
  { id: 'stackoverflow', label: 'Stack Overflow collector', description: 'Search SO questions tagged pentaho / pentaho-kettle / pentaho-pdi (last 12 months)' },
  { id: 'dockerhub',    label: 'Docker Hub collector',    description: 'Search Docker Hub for public Pentaho images with >100 pulls; extract org from namespace profile' },
  { id: 'enrich',        label: 'Enrichment',              description: 'Run Haiku HQ + org type enrichment on unenriched / stale orgs (up to 50)' },
]

function summarize(data: JobResult): { text: string; warn?: string } {
  const { ok: _ok, job: _job, message, errors, warning, ...rest } = data as Record<string, unknown>
  if (message) return { text: message as string }
  const parts = Object.entries(rest)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .map(([k, v]) => `${k}: ${v}`)
  const errList = Array.isArray(errors) && errors.length > 0
    ? ` (${errors.length} error${errors.length !== 1 ? 's' : ''})`
    : ''
  return { text: parts.join(' · ') + errList, warn: warning as string | undefined }
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return <span>{m > 0 ? `${m}m ` : ''}{s}s</span>
}

function JobCard({ job, state, anyRunning, onRun, onAbort }: {
  job: typeof JOBS[number]
  state: JobState
  anyRunning: boolean
  onRun: () => void
  onAbort: () => void
}) {
  return (
    <div className="border border-gray-200 rounded p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900">{job.label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{job.description}</div>
        <div className="mt-2 text-xs min-h-[1.25rem]">
          {state.status === 'running' && (
            <span className="text-blue-600 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Running — <ElapsedTimer startedAt={state.startedAt} />
              <span className="text-gray-400 ml-1">(aborting stops waiting; job continues on server)</span>
            </span>
          )}
          {state.status === 'done' && (
            <span className={state.ok ? 'text-green-700' : 'text-red-600'}>
              {state.ok ? '✓' : '✗'} {state.summary}{' '}
              <span className="text-gray-400">({state.elapsed}s)</span>
              {state.warn && (
                <span className="block text-amber-600 mt-0.5">{state.warn}</span>
              )}
            </span>
          )}
          {state.status === 'aborted' && (
            <span className="text-gray-400">Aborted — job may still be running on server</span>
          )}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {state.status === 'running' ? (
          <button
            onClick={onAbort}
            className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            Abort
          </button>
        ) : (
          <button
            onClick={onRun}
            disabled={anyRunning}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            Run
          </button>
        )}
      </div>
    </div>
  )
}

export default function CelordAdminPage() {
  const [states, setStates] = useState<Map<Job, JobState>>(
    new Map(JOBS.map(j => [j.id, { status: 'idle' }]))
  )
  const anyRunning = [...states.values()].some(s => s.status === 'running')

  function setState(job: Job, next: JobState) {
    setStates(prev => new Map(prev).set(job, next))
  }

  async function run(job: Job) {
    if (anyRunning) return
    const controller = new AbortController()
    const startedAt = Date.now()
    setState(job, { status: 'running', startedAt, abortController: controller })

    try {
      const res = await fetch('/api/celord/admin/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job }),
        signal: controller.signal,
      })
      const data: JobResult = await res.json()
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      const { text, warn } = res.ok ? summarize(data) : { text: (data as { error?: string }).error ?? 'Failed', warn: undefined }
      setState(job, { status: 'done', ok: res.ok && !!data.ok, summary: text, warn, elapsed })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setState(job, { status: 'aborted' })
      } else {
        setState(job, { status: 'done', ok: false, summary: 'Network error', elapsed: Math.round((Date.now() - startedAt) / 1000) })
      }
    }
  }

  function abort(job: Job) {
    const s = states.get(job)
    if (s?.status === 'running') s.abortController.abort()
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <Link href="/celord/prospects" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
          ← Back to prospects
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">CELord admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manually trigger signal collection and enrichment. Run collectors first, then enrichment.
        </p>
      </div>

      <div className="flex-1 px-6 py-6 max-w-2xl space-y-3">
        {JOBS.map(job => (
          <JobCard
            key={job.id}
            job={job}
            state={states.get(job.id) ?? { status: 'idle' }}
            anyRunning={anyRunning}
            onRun={() => run(job.id)}
            onAbort={() => abort(job.id)}
          />
        ))}
        {anyRunning && (
          <p className="text-xs text-gray-400 pt-1">
            One job at a time — other Run buttons are disabled while a job is in progress.
          </p>
        )}
      </div>
    </div>
  )
}
