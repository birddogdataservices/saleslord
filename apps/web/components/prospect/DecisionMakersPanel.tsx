import { getTranslations } from 'next-intl/server'
import DecisionMakers from './DecisionMakers'
import FindDecisionMakersButton from './FindDecisionMakersButton'
import type { DecisionMaker } from '@/lib/types'

type Props = {
  prospectId: string
  dms: DecisionMaker[]
  dmResearchedAt: string | null
}

// Three states, per the product principle in the root CLAUDE.md: an unrun stage
// renders an invitation, never an empty section or a silently missing card.
//
//   never run      -> invitation: what it does, what it costs, a button
//   ran, found     -> the list, plus a quiet refresh
//   ran, found none -> "no named individuals found publicly", plus retry
//
// The middle and last states are only distinguishable because the route stamps
// dm_researched_at even when it sources nobody. Without that the rep would be
// invited to pay for the same empty answer indefinitely.
export default async function DecisionMakersPanel({ prospectId, dms, dmResearchedAt }: Props) {
  const t = await getTranslations('DecisionMakers')

  if (!dmResearchedAt) {
    return (
      <Shell title={t('title')}>
        <div className="px-[14px] py-[14px] flex flex-col gap-[10px]">
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
            {t('inviteBody')}
          </p>
          <FindDecisionMakersButton prospectId={prospectId} variant="invite" />
        </div>
      </Shell>
    )
  }

  if (dms.length === 0) {
    return (
      <Shell title={t('title')}>
        <div className="px-[14px] py-[14px] flex flex-col gap-[10px]">
          <p className="text-[12px] font-medium" style={{ color: 'var(--sl-text)' }}>
            {t('noneTitle')}
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
            {t('noneBody')}
          </p>
          <FindDecisionMakersButton prospectId={prospectId} variant="retry" />
        </div>
      </Shell>
    )
  }

  // Refresh lives in the section header, not below the card — it acts on this
  // section, and a footer button reads as unattached to anything.
  return (
    <DecisionMakers
      decisionMakers={dms}
      action={<FindDecisionMakersButton prospectId={prospectId} variant="refresh" />}
    />
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
    >
      <div className="px-[14px] py-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--sl-text2)' }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}
