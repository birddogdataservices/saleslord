'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ProspectNote } from '@/lib/types'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const INDUSTRIES = ['Data infra','Fintech','SaaS','Healthcare','E-commerce','Cybersecurity','Dev tools','AI/ML','Cloud','Other']

type Props = { notes: ProspectNote[]; prospectId: string }

export default function ProspectLog({ notes: initial, prospectId }: Props) {
  const router    = useRouter()
  const [notes, setNotes]   = useState(initial)
  const [text, setText]     = useState('')
  const [state, setStateFn] = useState('')
  const [industry, setInd]  = useState('')
  const [saving, setSaving] = useState(false)
  const [stateFilter, setStateFilter]    = useState<string | null>(null)
  const [industryFilter, setIndFilter]   = useState<string | null>(null)

  // Unique values from existing notes for filter pills
  const uniqueStates     = [...new Set(notes.map(n => n.state).filter(Boolean))] as string[]
  const uniqueIndustries = [...new Set(notes.map(n => n.industry).filter(Boolean))] as string[]

  const filtered = notes.filter(n => {
    if (stateFilter    && n.state    !== stateFilter)    return false
    if (industryFilter && n.industry !== industryFilter) return false
    return true
  })

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || saving) return
    setSaving(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('prospect_notes')
      .insert({
        prospect_id: prospectId,
        text: text.trim(),
        state:    state    || null,
        industry: industry || null,
      })
      .select()
      .single()

    setSaving(false)
    if (error) { toast.error('Failed to add note.'); return }

    setNotes(prev => [data as ProspectNote, ...prev])
    setText(''); setStateFn(''); setInd('')
    router.refresh()
  }

  return (
    <SCard title="Prospect log" meta={`${notes.length} entr${notes.length === 1 ? 'y' : 'ies'}`}>
      <div className="px-[14px] pt-[10px] pb-[10px]">
        {/* Filter pills */}
        {(uniqueStates.length > 0 || uniqueIndustries.length > 0) && (
          <div className="flex gap-[5px] flex-wrap mb-[10px] pb-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
            <Pill active={stateFilter === null && industryFilter === null} onClick={() => { setStateFilter(null); setIndFilter(null) }}>All</Pill>
            {uniqueStates.map(s => (
              <Pill key={s} active={stateFilter === s} onClick={() => setStateFilter(f => f === s ? null : s)}>{s}</Pill>
            ))}
            {uniqueStates.length > 0 && uniqueIndustries.length > 0 && (
              <div className="w-px self-stretch mx-[2px]" style={{ background: 'var(--sl-border-s)' }} />
            )}
            {uniqueIndustries.map(ind => (
              <Pill key={ind} active={industryFilter === ind} onClick={() => setIndFilter(f => f === ind ? null : ind)}>{ind}</Pill>
            ))}
          </div>
        )}

        {/* Notes list */}
        <div>
          {filtered.length === 0 && (
            <p className="text-[12px] py-2 text-center" style={{ color: 'var(--sl-text3)' }}>
              {notes.length === 0 ? 'No notes yet. Add your first note below.' : 'No notes match the current filters.'}
            </p>
          )}
          {filtered.map((note, i) => (
            <div
              key={note.id}
              className="flex gap-[9px] items-start py-[7px]"
              style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sl-border-s)' : 'none' }}
            >
              <span className="text-[10px] w-[50px] flex-shrink-0 pt-[2px]" style={{ color: 'var(--sl-text3)' }}>
                {formatDate(note.created_at)}
              </span>
              <div className="flex-1">
                <p className="text-[12px] leading-relaxed" style={{ color: '#444' }}>{note.text}</p>
                {(note.state || note.industry) && (
                  <div className="flex gap-1 mt-[3px] flex-wrap">
                    {note.state    && <Tag color="blue">{note.state}</Tag>}
                    {note.industry && <Tag color="amber">{note.industry}</Tag>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add note form */}
        <form onSubmit={addNote} className="flex gap-[6px] mt-[10px] pt-[10px]" style={{ borderTop: '1px solid var(--sl-border-s)' }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 rounded-[6px] px-2 py-[5px] text-[11px] outline-none min-w-0"
            style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
          />
          <select
            value={state}
            onChange={e => setStateFn(e.target.value)}
            className="rounded-[6px] px-[6px] py-[5px] text-[11px] outline-none cursor-pointer"
            style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text2)' }}
          >
            <option value="">State</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={industry}
            onChange={e => setInd(e.target.value)}
            className="rounded-[6px] px-[6px] py-[5px] text-[11px] outline-none cursor-pointer"
            style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text2)' }}
          >
            <option value="">Industry</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <button
            type="submit"
            disabled={!text.trim() || saving}
            className="rounded-[6px] px-[10px] py-[5px] text-[11px] font-medium cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--sl-text)', color: '#F0EDE6', border: 'none' }}
          >
            {saving ? '…' : 'Add'}
          </button>
        </form>
      </div>
    </SCard>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] font-medium px-[10px] py-[3px] rounded-full cursor-pointer transition-all"
      style={{
        border: '1px solid var(--sl-border)',
        background: active ? 'var(--sl-text)' : 'var(--sl-surface)',
        color: active ? '#F0EDE6' : 'var(--sl-text2)',
      }}
    >
      {children}
    </button>
  )
}

function Tag({ color, children }: { color: 'blue' | 'amber'; children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] px-[6px] py-[1px] rounded-full"
      style={
        color === 'blue'
          ? { background: 'var(--sl-blue-bg)',  color: 'var(--sl-blue-t)'  }
          : { background: 'var(--sl-amber-bg)', color: 'var(--sl-amber-t)' }
      }
    >
      {children}
    </span>
  )
}

function SCard({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '' }
}
