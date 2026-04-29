'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  prospectId: string
  lastRefreshedAt: string | null
}

export default function CheckUpdatesButton({ prospectId, lastRefreshedAt }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const lastCheckedLabel = lastRefreshedAt
    ? new Date(lastRefreshedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/check-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to check for updates')
        return
      }

      if (data.found) {
        toast.success('New intel found — brief updated')
        router.refresh()
      } else {
        toast.success('No significant updates since last check')
        router.refresh() // still refresh so last_refreshed_at updates
      }
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
      className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium flex items-center gap-[5px]"
      style={{
        border: '1px solid var(--sl-border)',
        background: 'var(--sl-surface)',
        color: loading ? 'var(--sl-text3)' : 'var(--sl-text)',
        opacity: loading ? 0.7 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
      title={lastCheckedLabel ? `Last checked ${lastCheckedLabel}` : undefined}
    >
      {loading && (
        <svg
          className="animate-spin"
          style={{ width: 10, height: 10, color: 'var(--sl-text3)' }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {loading ? 'Checking…' : 'Check for Updates'}
    </button>
  )
}
