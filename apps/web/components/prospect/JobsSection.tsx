'use client'

import Link from 'next/link'
import { useTranslations, useFormatter } from 'next-intl'
import { useEffect, useState } from 'react'
import type { Job, JobKind } from '@/lib/types'

// Each job kind → its catalog key under the Jobs namespace.
const KIND_KEYS: Record<JobKind, string> = {
  research:         'kindResearch',
  email_draft:      'kindEmailDraft',
  pitch_opener:     'kindPitchOpener',
  check_updates:    'kindCheckUpdates',
  case_study_match: 'kindCaseStudyMatch',
}

const RUNNING_POLL_MS = 5_000
const IDLE_POLL_MS    = 20_000

const USD = { style: 'currency', currency: 'USD' } as const

// Elapsed/runtime is a locale-neutral stopwatch (m:ss) — not localized.
function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function JobsSection() {
  const t = useTranslations('Jobs')
  const [jobs, setJobs] = useState<Job[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [, setTick] = useState(0)

  const running = jobs.filter(j => j.status === 'running')
  const hasRunning = running.length > 0

  // Poll — fast while a job is running, slow otherwise. Flipping hasRunning
  // re-runs the effect, which fetches immediately at the new cadence.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/jobs')
        if (!res.ok) return
        const d = await res.json()
        if (!cancelled) setJobs(d.jobs ?? [])
      } catch {
        // network blip — next poll retries
      }
    }
    load()
    const id = setInterval(load, hasRunning ? RUNNING_POLL_MS : IDLE_POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [hasRunning])

  // Tick every second while running so elapsed time counts up live
  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [hasRunning])

  if (jobs.length === 0) return null

  // Running jobs on top, then most recent first (API already sorts by
  // started_at desc — this just floats a long-running job above newer finishes)
  const sorted = [...jobs].sort((a, b) => {
    if ((a.status === 'running') !== (b.status === 'running')) {
      return a.status === 'running' ? -1 : 1
    }
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  })

  return (
    <div style={{ borderTop: '1px solid #2a2a2c' }}>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-[14px] pt-[10px] pb-[5px]"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#484844' }}>
          {collapsed ? '▸' : '▾'} {t('title')}
        </span>
        {hasRunning && (
          <span className="text-[10px]" style={{ color: '#d4a24e' }}>
            {t('running', { count: running.length })}
          </span>
        )}
      </button>

      {!collapsed && sorted.map(job => <JobRow key={job.id} job={job} />)}
    </div>
  )
}

function JobRow({ job }: { job: Job }) {
  const t = useTranslations('Jobs')
  const format = useFormatter()
  const isRunning = job.status === 'running'
  const elapsed = isRunning
    ? Date.now() - new Date(job.started_at).getTime()
    : (job.finished_at ? new Date(job.finished_at).getTime() - new Date(job.started_at).getTime() : 0)

  const statusIcon = isRunning ? (
    <span
      className="flex-shrink-0 rounded-full animate-pulse"
      style={{ width: 7, height: 7, background: '#d4a24e' }}
    />
  ) : (
    <span
      className="flex-shrink-0 text-[10px] leading-none"
      style={{ color: job.status === 'success' ? '#5fa776' : '#c0594f', width: 7, textAlign: 'center' }}
      title={job.status === 'failed' ? (job.error ?? 'Failed') : 'Success'}
    >
      {job.status === 'success' ? '✓' : '✗'}
    </span>
  )

  const content = (
    <>
      {statusIcon}
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px]" style={{ color: '#b8b6b0' }}>
        {job.company_name}
        <span className="ml-[6px] text-[10px]" style={{ color: '#484844' }}>
          {KIND_KEYS[job.kind] ? t(KIND_KEYS[job.kind]) : job.kind}
        </span>
      </span>
      <span className="flex-shrink-0 text-[10px] text-right" style={{ color: '#484844' }}>
        {isRunning ? formatDuration(elapsed) : (
          <>
            {formatDuration(elapsed)}
            {job.cost_usd != null && (
              <span className="ml-[6px]" style={{ color: '#6b6a64' }}>
                {Number(job.cost_usd) < 0.01 ? `<${format.number(0.01, USD)}` : format.number(Number(job.cost_usd), USD)}
              </span>
            )}
          </>
        )}
      </span>
    </>
  )

  const rowClass = 'flex items-center gap-[8px] px-[14px] py-[5px]'

  // Finished jobs with a saved prospect link through to it
  if (!isRunning && job.prospect_id) {
    return (
      <Link
        href={`/prospects/${job.prospect_id}`}
        className={`${rowClass} transition-colors`}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#222224')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      >
        {content}
      </Link>
    )
  }

  return <div className={rowClass}>{content}</div>
}
