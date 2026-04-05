'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/utils'
import type { DecisionMaker, DmRole } from '@/lib/types'

type Props = { decisionMakers: DecisionMaker[] }

const ALL_ROLES: DmRole[] = ['champion', 'economic_buyer', 'gatekeeper', 'end_user', 'influencer', 'custom']

export default function DecisionMakers({ decisionMakers: initial }: Props) {
  const [dms, setDms] = useState(initial)

  async function updateRole(id: string, role: DmRole, label: string) {
    const colors = ROLE_COLORS[role]
    const supabase = createClient()
    const { error } = await supabase
      .from('decision_makers')
      .update({ role, role_label: label, avatar_color_bg: colors.bg, avatar_color_text: colors.text })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update role.')
      return
    }
    setDms(prev => prev.map(dm =>
      dm.id === id ? { ...dm, role, role_label: label, avatar_color_bg: colors.bg, avatar_color_text: colors.text } : dm
    ))
  }

  return (
    <SectionCard title="Decision makers" meta={`${dms.length} identified · click role to reassign`}>
      {dms.map(dm => (
        <DMCard key={dm.id} dm={dm} onRoleChange={updateRole} />
      ))}
    </SectionCard>
  )
}

function DMCard({ dm, onRoleChange }: {
  dm: DecisionMaker
  onRoleChange: (id: string, role: DmRole, label: string) => void
}) {
  const [open, setOpen]         = useState(false)
  const [customInput, setCustom] = useState('')

  return (
    <div className="px-[14px] py-[12px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
      {/* Header row */}
      <div className="flex items-start gap-[10px] mb-[7px]">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
          style={{ background: dm.avatar_color_bg, color: dm.avatar_color_text }}
        >
          {dm.avatar_initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>
            {dm.name ?? 'Unknown'}
          </div>
          <div className="text-[11px] mt-[1px]" style={{ color: 'var(--sl-text2)' }}>
            {dm.title}
          </div>
        </div>

        {/* Role pill + dropdown */}
        <div className="flex items-center gap-1 flex-shrink-0 relative">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-85"
            style={{ background: dm.avatar_color_bg, color: dm.avatar_color_text }}
          >
            {dm.role_label}
          </button>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] cursor-pointer"
            style={{ background: 'var(--sl-surface2)', border: '1px solid var(--sl-border)', color: 'var(--sl-text2)' }}
          >
            ✎
          </button>

          {open && (
            <div
              className="absolute top-[22px] right-0 rounded-[8px] z-50 min-w-[180px] p-1"
              style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)', boxShadow: '0 4px 16px rgba(0,0,0,.1)' }}
            >
              {ALL_ROLES.filter(r => r !== 'custom').map(role => {
                const colors = ROLE_COLORS[role]
                return (
                  <button
                    key={role}
                    onClick={() => { onRoleChange(dm.id, role, ROLE_LABELS[role]); setOpen(false) }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[5px] text-[12px] text-left cursor-pointer hover:bg-[var(--sl-surface2)]"
                    style={{ color: 'var(--sl-text)' }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.text }} />
                    {ROLE_LABELS[role]}
                  </button>
                )
              })}
              <div className="h-px my-1" style={{ background: 'var(--sl-border-s)' }} />
              <form
                className="flex items-center gap-1 px-2 py-1"
                onSubmit={e => {
                  e.preventDefault()
                  if (customInput.trim()) {
                    onRoleChange(dm.id, 'custom', customInput.trim())
                    setCustom('')
                    setOpen(false)
                  }
                }}
              >
                <span className="text-[11px]" style={{ color: 'var(--sl-text2)' }}>+ Custom:</span>
                <input
                  value={customInput}
                  onChange={e => setCustom(e.target.value)}
                  placeholder="role name"
                  className="flex-1 text-[11px] bg-transparent outline-none"
                  style={{ color: 'var(--sl-text)' }}
                />
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Cares about */}
      {dm.cares_about && (
        <p className="text-[11px] leading-relaxed mb-[7px]" style={{ color: 'var(--sl-text2)' }}>
          <strong style={{ color: 'var(--sl-text)', fontWeight: 500 }}>Cares about:</strong>{' '}
          {dm.cares_about}
        </p>
      )}

      {/* Suggested angle */}
      {dm.suggested_angle && (
        <div className="rounded-[6px] px-[10px] py-[8px] text-[11px] leading-relaxed"
          style={{ background: 'var(--sl-surface2)', borderLeft: '2px solid #7F77DD', color: 'var(--sl-text)' }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] mb-[3px]" style={{ color: 'var(--sl-purple-t)' }}>
            Suggested angle
          </div>
          {dm.suggested_angle}
        </div>
      )}
    </div>
  )
}

function SectionCard({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}>
      <div className="flex items-center justify-between px-[14px] py-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text2)' }}>{title}</span>
        {meta && <span className="text-[10px]" style={{ color: 'var(--sl-text3)' }}>{meta}</span>}
      </div>
      {children}
    </div>
  )
}
