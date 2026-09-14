'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { COST_HINTS } from '@/lib/costs'
import { LONG_ACTION_TOAST_MS } from '@/lib/utils'
import { ACTION_BUTTON_CLASS, ACTION_BUTTON_CLASS_COMPACT, ACTION_STYLE } from '@/lib/action-styles'
import { useEscapeKey } from '@/lib/use-escape-key'
import CostConfirmHint from './CostConfirmHint'

type Props = {
  prospectId: string
  // 'invite'  — first run, prominent
  // 'retry'   — the stage ran and sourced nobody
  // 'refresh' — people exist; re-run after a reorg
  variant: 'invite' | 'retry' | 'refresh'
}

// A research action: it spends the rep's key on a web-search run, so it takes the
// blue research style and states its price before it runs. How it states it
// depends on where the button sits:
//
//   invite, retry — in the card body, where there is room: the price is a visible
//                   caption under the button, and one click runs it.
//   refresh       — in the section header, next to 10px meta text, with no room
//                   for a caption: it confirms first and floats the price below,
//                   like the topbar research buttons. It used to spend
//                   ~$0.40–$0.65 on a single click with no price shown anywhere.
//
// The floating hint is only safe in the header. The panel's Shell card is
// overflow-hidden, so at the foot of the body — where retry sits — it would be
// clipped.
export default function FindDecisionMakersButton({ prospectId, variant }: Props) {
  const t = useTranslations('DecisionMakers')
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'confirm' | 'loading'>('idle')

  const inHeader = variant === 'refresh'

  useEscapeKey(() => setState('idle'), state === 'confirm')

  async function handleClick() {
    if (state === 'loading') return
    if (inHeader && state === 'idle') { setState('confirm'); return }

    setState('loading')
    // Longer than the default toast: this runs a search loop and the rep should
    // not be left wondering whether it is still going.
    const toastId = toast.loading(t('searching'), { duration: LONG_ACTION_TOAST_MS })

    try {
      const res = await fetch('/api/decision-makers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prospect_id: prospectId }),
      })
      const data = await res.json()
      toast.dismiss(toastId)

      if (!res.ok) {
        toast.error(data.error ?? t('failed'))
        return
      }

      // Sourcing nobody is a correct outcome, not a failure — say so plainly
      // rather than showing a success toast over an empty section.
      if (!data.found) toast.info(t('noneTitle'))
      else toast.success(t('foundCount', { count: data.found }))

      router.refresh()
    } catch {
      toast.dismiss(toastId)
      toast.error(t('failed'))
    } finally {
      setState('idle')
    }
  }

  const label = state === 'loading'   ? t('searching')
    : state === 'confirm'   ? t('confirmRefresh')
    : variant === 'refresh' ? t('refresh')
    : variant === 'retry'   ? t('searchAgain')
    : t('find')

  if (inHeader) {
    return (
      <div className="relative">
        <button
          onClick={handleClick}
          onBlur={() => { if (state === 'confirm') setState('idle') }}
          disabled={state === 'loading'}
          className={ACTION_BUTTON_CLASS_COMPACT}
          style={state === 'confirm' ? ACTION_STYLE.confirm : ACTION_STYLE.research}
        >
          {label}
        </button>
        <CostConfirmHint text={COST_HINTS.decisionMakers} show={state === 'confirm'} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-[6px]">
      <button
        onClick={handleClick}
        disabled={state === 'loading'}
        className={ACTION_BUTTON_CLASS}
        style={ACTION_STYLE.research}
      >
        {label}
      </button>
      {/* BYOK cost transparency — the rep is spending their own key, so the
          price is stated before they commit, not after. --sl-text2 rather than
          text3, which is too faint to read at 10px. */}
      <span className="text-[10px]" style={{ color: 'var(--sl-text2)' }}>
        {COST_HINTS.decisionMakers}
      </span>
    </div>
  )
}
