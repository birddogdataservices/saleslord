import type { ProspectBrief, DecisionMaker, ProspectNote } from '@/lib/types'
import ProspectLog from './ProspectLog'

// ── Outreach Readiness ────────────────────────────────────────────
function ReadinessCard({ brief, dms, notes }: {
  brief: ProspectBrief
  dms: DecisionMaker[]
  notes: ProspectNote[]
}) {
  const checks = [
    { label: 'Buy window open',         ok: brief.timing?.window_status === 'open' },
    { label: 'Pain matched to product', ok: (brief.pain_signals?.length ?? 0) > 0 },
    { label: 'News trigger available',  ok: (brief.news?.length ?? 0) > 0 },
    { label: 'Champion identified',     ok: dms.some(d => d.role === 'champion') },
    { label: 'First touch drafted',     ok: !!brief.email?.body },
    { label: 'Prospect notes logged',   ok: notes.length > 0 },
  ]

  return (
    <SCard title="Outreach readiness">
      <div className="px-[14px] py-[8px]">
        {checks.map((c, i) => (
          <div
            key={c.label}
            className="flex items-center gap-2 py-[6px]"
            style={{ borderBottom: i < checks.length - 1 ? '1px solid var(--sl-border-s)' : 'none' }}
          >
            <span className="flex-1 text-[12px]" style={{ color: 'var(--sl-text2)' }}>{c.label}</span>
            <span
              className="w-[17px] h-[17px] rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
              style={c.ok
                ? { background: 'var(--sl-green-bg)', color: 'var(--sl-green-t)' }
                : { background: 'var(--sl-surface2)', color: 'var(--sl-text3)' }
              }
            >
              {c.ok ? '✓' : '—'}
            </span>
          </div>
        ))}
      </div>
    </SCard>
  )
}

// ── Recommended Angle ─────────────────────────────────────────────
function AngleCard({ angle }: { angle: string }) {
  return (
    <SCard title="Recommended angle">
      <div className="px-[14px] py-[12px]">
        <div
          className="text-[12px] leading-relaxed rounded-r-[6px] px-3 py-[9px]"
          style={{ borderLeft: '3px solid #D4537E', background: '#fdf6f9', color: '#3a1a24' }}
        >
          {angle}
        </div>
      </div>
    </SCard>
  )
}

// ── Tech Stack ────────────────────────────────────────────────────
function TechCard({ signals }: { signals: string[] }) {
  return (
    <SCard title="Tech stack signals">
      <div className="px-[14px] py-[12px]">
        {signals.map(s => (
          <span
            key={s}
            className="inline-block text-[11px] font-medium px-2 py-[2px] rounded-full mr-1 mb-1"
            style={{ background: 'var(--sl-purple-bg)', color: 'var(--sl-purple-t)' }}
          >
            {s}
          </span>
        ))}
        {signals.length === 0 && (
          <p className="text-[12px]" style={{ color: 'var(--sl-text3)' }}>No signals found.</p>
        )}
      </div>
    </SCard>
  )
}

// ── Right Column ──────────────────────────────────────────────────
type Props = {
  brief: ProspectBrief
  dms: DecisionMaker[]
  notes: ProspectNote[]
  prospectId: string
}

export default function RightColumn({ brief, dms, notes, prospectId }: Props) {
  return (
    <div className="flex flex-col gap-[14px]">
      <ReadinessCard brief={brief} dms={dms} notes={notes} />
      {brief.outreach_angle && <AngleCard angle={brief.outreach_angle} />}
      {(brief.tech_signals?.length ?? 0) > 0 && <TechCard signals={brief.tech_signals} />}
      <ProspectLog notes={notes} prospectId={prospectId} />
    </div>
  )
}

function SCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}>
      <div className="px-[14px] py-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text2)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
