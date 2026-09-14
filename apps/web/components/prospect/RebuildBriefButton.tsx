'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { COST_HINTS } from '@/lib/costs'
import { LONG_ACTION_TOAST_MS } from '@/lib/utils'
import { ACTION_BUTTON_CLASS, ACTION_STYLE } from '@/lib/action-styles'
import { useEscapeKey } from '@/lib/use-escape-key'
import CostConfirmHint from './CostConfirmHint'

type Props = {
  query: string
}

// Stage 1 refresh only. Re-runs company research and the fit verdict; decision
// makers are deliberately left alone, so a rep can refresh company facts without
// paying to re-discover people. The decision-makers panel has its own refresh.
//
// Two clicks, and the confirm step states the price. This is a full research run
// on the rep's own Anthropic key; it used to ask "Confirm refresh?" without ever
// saying what confirming would cost.
export default function RebuildBriefButton({ query }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle')

  useEscapeKey(() => setState('idle'), state === 'confirm')

  async function handleClick() {
    if (state === 'idle') { setState('confirm'); return }
    if (state !== 'confirm') return

    setState('loading')
    const toastId = toast.loading('Refreshing company research…', { duration: LONG_ACTION_TOAST_MS })

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
    <div className="relative">
      <button
        onClick={handleClick}
        onBlur={() => { if (state === 'confirm') setState('idle') }}
        disabled={state === 'loading'}
        className={ACTION_BUTTON_CLASS}
        style={state === 'confirm' ? ACTION_STYLE.confirm : ACTION_STYLE.research}
      >
        {state === 'loading' ? 'Refreshing…' : state === 'confirm' ? 'Confirm refresh?' : 'Refresh company'}
      </button>
      <CostConfirmHint text={COST_HINTS.refresh} show={state === 'confirm'} />
    </div>
  )
}
