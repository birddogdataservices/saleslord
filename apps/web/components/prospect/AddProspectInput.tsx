'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import OrgDisambiguationDialog from './OrgDisambiguationDialog'
import type { OrgCandidate } from '@/lib/types'
import { COST_HINTS } from '@/lib/costs'

export default function AddProspectInput() {
  const router = useRouter()
  const [query, setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ candidates: OrgCandidate[]; originalQuery: string } | null>(null)

  async function runResearch(researchQuery: string) {
    const toastId = toast.loading(`Researching ${researchQuery}…`, { duration: 60000 })
    try {
      const res = await fetch('/api/research', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: researchQuery }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.dismiss(toastId)
        toast.error(data.error ?? 'Research failed. Please try again.')
        return
      }
      toast.dismiss(toastId)
      toast.success(`${data.prospect?.name ?? researchQuery} added.`)
      setQuery('')
      router.push(`/prospects/${data.prospect_id}`)
      router.refresh()
    } catch {
      toast.dismiss(toastId)
      toast.error('Network error. Please try again.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || loading) return

    setLoading(true)
    try {
      const res = await fetch('/api/resolve', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: query.trim() }),
      })

      // If resolve fails for any reason, fall through to research directly —
      // research will surface the same auth/config error with a proper message.
      if (!res.ok) {
        await runResearch(query.trim())
        return
      }

      const data = await res.json()
      setDialog({ candidates: data.candidates ?? [], originalQuery: query.trim() })
    } catch {
      // Network error on resolve — fall through to research
      await runResearch(query.trim())
    } finally {
      setLoading(false)
    }
  }

  async function handleDialogSelect(candidate: OrgCandidate | null) {
    const originalQuery  = dialog?.originalQuery ?? query.trim()
    const researchQuery  = candidate?.disambiguated_query ?? originalQuery
    setDialog(null)
    setLoading(true)
    try {
      await runResearch(researchQuery)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="px-[12px] pb-[12px]">
        <div
          className="flex items-center gap-1 rounded-[6px] px-[8px]"
          style={{ background: '#242424', border: '1px solid #333' }}
        >
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Add prospect…"
            disabled={loading}
            className="flex-1 bg-transparent py-[6px] text-[11px] outline-none placeholder:text-[#555] disabled:opacity-50"
            style={{ color: '#aaa' }}
          />
          {query.trim() && !loading && (
            <button
              type="submit"
              className="text-[10px] flex-shrink-0 cursor-pointer"
              style={{ color: '#888' }}
            >
              ↵
            </button>
          )}
          {loading && (
            <span className="text-[10px] flex-shrink-0 animate-pulse" style={{ color: '#888' }}>
              ···
            </span>
          )}
        </div>
      </form>

      {dialog && (
        <OrgDisambiguationDialog
          query={dialog.originalQuery}
          candidates={dialog.candidates}
          onSelect={handleDialogSelect}
          onClose={() => setDialog(null)}
          costHint={COST_HINTS.research}
        />
      )}
    </>
  )
}
