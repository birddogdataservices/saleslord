import type { TimingData } from '@/lib/types'
import { windowStatusColor, windowStatusLabel } from '@/lib/utils'

type Props = { timing: TimingData }

function daysUntil(fyEnd: string): number | null {
  try {
    const now   = new Date()
    const year  = now.getFullYear()
    const date  = new Date(`${fyEnd} ${year}`)
    if (date < now) date.setFullYear(year + 1)
    return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  } catch { return null }
}

export default function TimingBar({ timing }: Props) {
  const { pill } = windowStatusColor(timing.window_status)
  const days     = daysUntil(timing.fy_end)
  const pillColor =
    timing.window_status === 'open'       ? { bg: 'var(--sl-green-bg)',  text: 'var(--sl-green-t)'  } :
    timing.window_status === 'approaching'? { bg: 'var(--sl-amber-bg)',  text: 'var(--sl-amber-t)'  } :
                                            { bg: 'var(--sl-coral-bg)',  text: 'var(--sl-coral-t)'  }

  const borderColor =
    timing.window_status === 'open'        ? 'var(--sl-green-bg)'  :
    timing.window_status === 'approaching' ? 'var(--sl-amber-bg)'  :
                                             'var(--sl-coral-bg)'

  return (
    <div
      className="flex items-center gap-4 flex-wrap rounded-[10px] px-4 py-3"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
    >
      <span
        className="text-[11px] font-semibold px-3 py-1 rounded-full flex-shrink-0"
        style={{ background: pillColor.bg, color: pillColor.text }}
      >
        {windowStatusLabel(timing.window_status)}
      </span>

      <Div />
      <TItem label="FY ends"      value={timing.fy_end} />
      <Div />
      <TItem label="Best window"  value={timing.recommended_outreach_window} />
      <Div />
      <TItem
        label="Days to FY close"
        value={days != null ? `${days} days` : '—'}
        valueColor={timing.window_status === 'open' ? 'var(--sl-green-t)' : undefined}
      />
      <Div />
      <p
        className="text-[12px] leading-relaxed flex-1 pl-3 min-w-0"
        style={{ color: 'var(--sl-text2)', borderLeft: `2px solid ${borderColor}` }}
      >
        {timing.reasoning}
      </p>
    </div>
  )
}

function Div() {
  return <div className="w-px h-7 flex-shrink-0" style={{ background: 'var(--sl-border-s)' }} />
}

function TItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex flex-col flex-shrink-0">
      <span className="text-[10px] font-medium uppercase tracking-[0.05em]" style={{ color: 'var(--sl-text3)' }}>
        {label}
      </span>
      <span className="text-[12px] font-semibold mt-0.5" style={{ color: valueColor ?? 'var(--sl-text)' }}>
        {value}
      </span>
    </div>
  )
}
