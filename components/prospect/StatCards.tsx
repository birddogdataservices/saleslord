import type { CompanyStats } from '@/lib/types'

type Props = { stats: CompanyStats | null }

export default function StatCards({ stats }: Props) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-4 gap-[10px]">
      <Card label="Revenue (TTM)"  stat={stats.revenue} />
      <Card label="Headcount"      stat={stats.headcount} />
      <Card label="Open roles"     stat={stats.open_roles} highlight />
      <Card label="Stage"          stat={stats.stage} small />
    </div>
  )
}

function Card({
  label, stat, highlight, small
}: {
  label: string
  stat: { value: string; context: string } | null
  highlight?: boolean
  small?: boolean
}) {
  if (!stat) return null
  return (
    <div
      className="rounded-[10px] px-[14px] py-[12px]"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
    >
      <div
        className="text-[10px] font-medium uppercase tracking-[0.05em] mb-[5px]"
        style={{ color: 'var(--sl-text3)' }}
      >
        {label}
      </div>
      <div
        className={small ? 'text-[15px] font-semibold leading-none pt-[3px]' : 'text-[20px] font-semibold leading-none'}
        style={{ color: highlight ? '#8a5a0a' : 'var(--sl-text)' }}
      >
        {stat.value}
      </div>
      {stat.context && (
        <div className="text-[11px] mt-[3px]" style={{ color: 'var(--sl-text3)' }}>
          {stat.context}
        </div>
      )}
    </div>
  )
}
