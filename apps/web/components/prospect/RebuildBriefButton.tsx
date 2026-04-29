'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  query: string
}

export default function RebuildBriefButton({ query }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle')

  async function handleClick() {
    if (state === 'idle') { setState('confirm'); return }
    if (state !== 'confirm') return

    setState('loading')
    const toastId = toast.loading('Rebuilding brief…', { duration: 90000 })

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      toast.dismiss(toastId)

      if (!res.ok) {
        toast.error(data.error ?? 'Rebuild failed. Please try again.')
        setState('idle')
        return
      }

      toast.success('Brief rebuilt.')
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
      {state === 'loading' ? 'Rebuilding…' : state === 'confirm' ? 'Confirm rebuild?' : 'Rebuild Brief'}
    </button>
  )
}
