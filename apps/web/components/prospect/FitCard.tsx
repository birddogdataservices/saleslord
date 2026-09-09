import { getTranslations } from 'next-intl/server'
import { FIT_COLORS, FIT_LABELS } from '@/lib/utils'
import type { FitVerdict } from '@/lib/types'

// The stage 1 verdict the rep gates the decision-maker stage on. Sits directly
// above the decision-makers panel so the decision and its evidence are adjacent.
//
// Renders nothing when fit is null — briefs written before staged research have
// no verdict, and an empty card would be worse than no card.
export default async function FitCard({ fit }: { fit: FitVerdict | null }) {
  if (!fit?.verdict) return null

  const t = await getTranslations('Fit')
  const colors = FIT_COLORS[fit.verdict] ?? FIT_COLORS.weak
  const label  = FIT_LABELS[fit.verdict] ?? FIT_LABELS.weak

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
    >
      <div
        className="flex items-center justify-between px-[14px] py-[10px]"
        style={{ borderBottom: '1px solid var(--sl-border-s)' }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--sl-text2)' }}
        >
          {t('title')}
        </span>
        <span
          className="text-[10px] font-semibold px-[8px] py-[2px] rounded-full"
          style={{ background: colors.bg, color: colors.text }}
        >
          {label}
        </span>
      </div>

      <div className="px-[14px] py-[12px] flex flex-col gap-[10px]">
        {fit.rationale && (
          <p className="text-[12px] leading-[1.7]" style={{ color: '#333' }}>
            {fit.rationale}
          </p>
        )}

        {fit.budget_signal && (
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
            <strong style={{ color: 'var(--sl-text)', fontWeight: 500 }}>{t('budget')}</strong>{' '}
            {fit.budget_signal}
          </p>
        )}

        {fit.what_would_change_it && (
          <p
            className="text-[11px] leading-relaxed rounded-[6px] px-[10px] py-[8px]"
            style={{ background: 'var(--sl-surface2)', color: 'var(--sl-text2)' }}
          >
            <strong style={{ color: 'var(--sl-text)', fontWeight: 500 }}>{t('whatWouldChange')}</strong>{' '}
            {fit.what_would_change_it}
          </p>
        )}
      </div>
    </div>
  )
}
