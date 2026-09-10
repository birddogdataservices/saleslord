'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  query: string
}

// Stage 1 refresh only. Re-runs company research and the fit verdict; decision
// makers are deliberately left alone, so a rep can refresh company facts without
// paying to re-discover people. The decision-makers panel has its own refresh.
export default function RebuildBriefButton({ query }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle')

  async function handleClick() {
    if (state === 'idle') { setState('confirm'); return }
    if (state !== 'confirm') return

    setState('loading')
    const toastId = toast.loading('Refreshing company research…', { duration: 120000 })

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      toast.dismiss(toastId)

      if (!res.ok) {
        toast.error(data.error ?? 'Refresh failed. Please try again.')
        setState('idle')
        return
      }

      toast.success('Company research refreshed.')
      router.refresh()
    } catch {
      toast.dismiss(toastId)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setState('idle')
    }
  }

  return (
    <button
      onClick={handleClick}
      onBlur={() => { if (state === 'confirm') setState('idle') }}
      disabled={state === 'loading'}
      className="text-[11px] px-3 py-[5px] rounded-[6px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{
        border: '1px solid var(--sl-border)',
        background: state === 'confirm' ? 'var(--sl-amber-bg)' : 'var(--sl-surface)',
        color:      state === 'confirm' ? 'var(--sl-amber-t)' : 'var(--sl-text3)',
      }}
    >
      {state === 'loading' ? 'Refreshing…' : state === 'confirm' ? 'Confirm refresh?' : 'Refresh company'}
    </button>
  )
}
