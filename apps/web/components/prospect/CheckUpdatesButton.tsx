'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { COST_HINTS } from '@/lib/costs'
import { useEscapeKey } from '@/lib/use-escape-key'
import CostConfirmHint from './CostConfirmHint'

type Props = {
  prospectId: string
  lastCheckedAt: string | null
}

// Scans for news since the last check and appends an update blurb when there is
// something new. It is a Sonnet web-search loop on the rep's own Anthropic key,
// so it takes two clicks and the confirm step states the price before the rep
// commits. It used to fire on a single click with no cost shown anywhere.
export default function CheckUpdatesButton({ prospectId, lastCheckedAt }: Props) {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle')
  const router = useRouter()
  const loading = state === 'loading'

  useEscapeKey(() => setState('idle'), state === 'confirm')

  const lastCheckedLabel = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  async function handleClick() {
    if (state === 'idle') { setState('confirm'); return }
    if (state !== 'confirm') return

    setState('loading')
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
        router.refresh() // still refresh so last_checked_at updates
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setState('idle')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onBlur={() => { if (state === 'confirm') setState('idle') }}
        disabled={loading}
        className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium flex items-center gap-[5px]"
        style={{
          border: '1px solid var(--sl-border)',
          background: state === 'confirm' ? 'var(--sl-amber-bg)' : 'var(--sl-surface)',
          color: state === 'confirm' ? 'var(--sl-amber-t)' : loading ? 'var(--sl-text3)' : 'var(--sl-text)',
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
        title={lastCheckedLabel ? `Last checked for news ${lastCheckedLabel}` : 'Never checked for news since this brief was researched'}
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
        {loading ? 'Checking…' : state === 'confirm' ? 'Confirm check?' : 'Check for Updates'}
      </button>
      <CostConfirmHint text={COST_HINTS.checkUpdates} show={state === 'confirm'} />
    </div>
  )
}
