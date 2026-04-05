'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function AddProspectInput() {
  const router = useRouter()
  const [query, setQuery]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || loading) return

    setLoading(true)
    const toastId = toast.loading(`Researching ${query.trim()}…`, { duration: 60000 })

    try {
      const res = await fetch('/api/research', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: query.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.dismiss(toastId)
        toast.error(data.error ?? 'Research failed. Please try again.')
        return
      }

      toast.dismiss(toastId)
      toast.success(`${data.prospect?.name ?? query} added.`)
      setQuery('')
      router.push(`/prospects/${data.prospect_id}`)
      router.refresh()
    } catch {
      toast.dismiss(toastId)
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
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
  )
}
