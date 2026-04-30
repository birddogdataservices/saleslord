'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  query: string   // original search query — passed to /api/research to re-run
}

export default function ReresearchButton({ query }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Research failed. Please try again.')
        return
      }

      toast.success('Research complete')
      router.refresh()
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="mt-3 text-[12px] px-4 py-[6px] rounded-[6px] font-medium flex items-center gap-[6px] mx-auto"
      style={{
        background: 'var(--sl-blue-bg)',
        color: 'var(--sl-blue-t)',
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading && (
        <svg
          className="animate-spin"
          style={{ width: 11, height: 11 }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {loading ? 'Researching…' : 'Run research'}
    </button>
  )
}
