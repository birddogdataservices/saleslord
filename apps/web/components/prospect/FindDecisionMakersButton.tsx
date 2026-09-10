'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { COST_HINTS } from '@/lib/costs'

type Props = {
  prospectId: string
  // 'invite'  — first run, prominent
  // 'retry'   — the stage ran and sourced nobody
  // 'refresh' — people exist; re-run after a reorg
  variant: 'invite' | 'retry' | 'refresh'
}

export default function FindDecisionMakersButton({ prospectId, variant }: Props) {
  const t = useTranslations('DecisionMakers')
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)
    // Longer than the default toast: this runs a search loop and the rep should
    // not be left wondering whether it is still going.
    const toastId = toast.loading(t('searching'), { duration: 120000 })

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
      setLoading(false)
    }
  }

  const label = loading
    ? t('searching')
    : variant === 'refresh' ? t('refresh')
    : variant === 'retry'   ? t('searchAgain')
    : t('find')

  const prominent = variant === 'invite'

  return (
    <div className={prominent ? 'flex flex-col items-start gap-[6px]' : ''}>
      <button
        onClick={handleClick}
        disabled={loading}
        // The invite variant is the primary action on an empty section, so it is
        // full-size. Refresh and retry sit in a section header next to 10px meta
        // text, so they are scaled down to avoid pushing the header taller.
        className={`rounded-[6px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer ${
          prominent ? 'text-[11px] px-3 py-[5px]' : 'text-[10px] px-2 py-[3px]'
        }`}
        style={prominent
          ? { border: 'none', background: 'var(--sl-text)', color: '#F0EDE6' }
          : { border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text3)' }
        }
      >
        {label}
      </button>
      {prominent && (
        // BYOK cost transparency — the rep is spending their own key, so the
        // price is stated before they commit, not after.
        <span className="text-[10px]" style={{ color: 'var(--sl-text3)' }}>
          {COST_HINTS.decisionMakers}
        </span>
      )}
    </div>
  )
}
