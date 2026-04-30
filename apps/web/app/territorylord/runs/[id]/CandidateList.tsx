'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Candidate = {
  id: string
  status: string
  reject_reason: string | null
  notes: string | null
  org: {
    id: string
    name: string
    domain: string | null
    industry: string | null
    approx_size: string | null
  }
  source_url: string | null
}

type StatusFilter = 'all' | 'new' | 'accepted' | 'rejected' | 'promoted'

const REJECT_REASONS = [
  { value: 'wrong_industry', label: 'Wrong industry' },
  { value: 'too_small',      label: 'Too small' },
  { value: 'not_real',       label: 'Not a real company' },
  { value: 'duplicate',      label: 'Duplicate' },
  { value: 'other',          label: 'Other' },
] as const

const STATUS_BADGE: Record<string, string> = {
  new:      'text-gray-500 bg-gray-100',
  accepted: 'text-green-700 bg-green-100',
  rejected: 'text-red-600 bg-red-100',
  promoted: 'text-blue-700 bg-blue-100',
}

export function CandidateList({ candidates: initial }: { candidates: Candidate[] }) {
  const [candidates, setCandidates] = useState<Candidate[]>(initial)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [rejectOpen, setRejectOpen] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<string>('wrong_industry')
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const counts = {
    all:      candidates.length,
    new:      candidates.filter(c => c.status === 'new').length,
    accepted: candidates.filter(c => c.status === 'accepted').length,
    rejected: candidates.filter(c => c.status === 'rejected').length,
    promoted: candidates.filter(c => c.status === 'promoted').length,
  }

  const filtered = filter === 'all' ? candidates : candidates.filter(c => c.status === filter)

  async function patch(id: string, body: object) {
    setLoading(id)
    try {
      const res = await fetch(`/api/territorylord/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { console.error(data.error); return }

      if (data.status === 'promoted' && data.prospect_id) {
        setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: 'promoted' } : c))
        router.push(`/?prospect=${data.prospect_id}`)
        return
      }
      setCandidates(prev => prev.map(c =>
        c.id === id ? { ...c, status: data.status, reject_reason: body && 'reason' in (body as object) ? (body as { reason: string }).reason : c.reject_reason } : c
      ))
    } finally {
      setLoading(null)
      setRejectOpen(null)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Filter tabs */}
      <div className="px-6 pt-3 pb-0 border-b border-gray-200 flex gap-1 shrink-0">
        {(['all', 'new', 'accepted', 'rejected', 'promoted'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-t transition-colors capitalize ${
              filter === f
                ? 'bg-white border border-b-white border-gray-200 text-gray-900 font-medium -mb-px'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {f} <span className="text-gray-400 ml-0.5">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">No {filter === 'all' ? '' : filter} candidates.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-[35%]">Company</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-[25%]">Industry</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-[10%]">Size</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-[10%]">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 w-[20%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  isLoading={loading === c.id}
                  rejectOpen={rejectOpen === c.id}
                  rejectReason={rejectReason}
                  onRejectReasonChange={setRejectReason}
                  onAccept={() => patch(c.id, { action: 'accept' })}
                  onRejectOpen={() => setRejectOpen(c.id)}
                  onRejectClose={() => setRejectOpen(null)}
                  onRejectConfirm={() => patch(c.id, { action: 'reject', reason: rejectReason })}
                  onPromote={() => patch(c.id, { action: 'promote' })}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CandidateRow({
  candidate: c, isLoading, rejectOpen, rejectReason,
  onRejectReasonChange, onAccept, onRejectOpen, onRejectClose, onRejectConfirm, onPromote,
}: {
  candidate: Candidate
  isLoading: boolean
  rejectOpen: boolean
  rejectReason: string
  onRejectReasonChange: (r: string) => void
  onAccept: () => void
  onRejectOpen: () => void
  onRejectClose: () => void
  onRejectConfirm: () => void
  onPromote: () => void
}) {
  const isNew = c.status === 'new'

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 align-top">
        <div className="font-medium text-gray-900">{c.org.name}</div>
        {c.org.domain && (
          <a
            href={`https://${c.org.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-700 hover:underline"
          >
            {c.org.domain}
          </a>
        )}
        {c.source_url && (
          <a
            href={c.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-300 hover:text-gray-500 ml-2"
            title="View on Wikidata"
          >
            WD
          </a>
        )}
        {rejectOpen && (
          <div className="mt-2 space-y-2">
            <select
              value={rejectReason}
              onChange={e => onRejectReasonChange(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-full"
            >
              {REJECT_REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button
                onClick={onRejectConfirm}
                disabled={isLoading}
                className="text-xs px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={onRejectClose}
                className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-3 align-top text-sm text-gray-600">
        {c.org.industry ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 align-top text-sm text-gray-500">
        {c.org.approx_size ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 align-top">
        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${STATUS_BADGE[c.status] ?? 'text-gray-500 bg-gray-100'}`}>
          {c.status}
          {c.status === 'rejected' && c.reject_reason && (
            <span className="ml-1 opacity-70">· {c.reject_reason.replace('_', ' ')}</span>
          )}
        </span>
      </td>
      <td className="px-4 py-3 align-top text-right">
        {isNew && !rejectOpen && (
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={onAccept}
              disabled={isLoading}
              className="text-xs px-2.5 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={onRejectOpen}
              disabled={isLoading}
              className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onPromote}
              disabled={isLoading}
              className="text-xs px-2.5 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
            >
              Promote →
            </button>
          </div>
        )}
        {c.status === 'accepted' && (
          <button
            onClick={onPromote}
            disabled={isLoading}
            className="text-xs px-2.5 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            Promote →
          </button>
        )}
      </td>
    </tr>
  )
}
