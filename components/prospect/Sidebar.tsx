'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRef, useState, useCallback } from 'react'
import type { ProspectSidebarItem } from '@/lib/types'
import { windowStatusColor } from '@/lib/utils'
import AddProspectInput from './AddProspectInput'

type Props = {
  prospects: ProspectSidebarItem[]
  archivedProspects: ProspectSidebarItem[]
  monthlyCostUsd: number
  isAdmin: boolean
}

const GROUP_ORDER: Array<{ status: 'open' | 'approaching' | 'closed' | null; label: string }> = [
  { status: 'open',        label: 'Window open' },
  { status: 'approaching', label: 'Approaching' },
  { status: 'closed',      label: 'Monitoring' },
]

const MIN_WIDTH = 180
const MAX_WIDTH = 360
const DEFAULT_WIDTH = 230

export default function Sidebar({ prospects, archivedProspects, monthlyCostUsd, isAdmin }: Props) {
  const params    = useParams()
  const activeId  = params?.id as string | undefined
  const [search,         setSearch]         = useState('')
  const [showArchived,   setShowArchived]   = useState(false)
  const [width,          setWidth]          = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    startX.current   = e.clientX
    startW.current   = width

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - startX.current
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [width])

  const filtered = prospects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredArchived = archivedProspects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const openCount = prospects.filter(p => p.window_status === 'open').length

  return (
    <aside
      className="flex flex-col flex-shrink-0 overflow-y-auto relative"
      style={{ width, background: 'var(--sl-sidebar)' }}
    >
      {/* Header */}
      <div className="px-[14px] pt-[18px] pb-[12px]" style={{ borderBottom: '1px solid #2a2a2c' }}>
        <div className="text-[13px] font-semibold text-[#F0EDE6] tracking-[0.05em] uppercase">
          SalesLord
        </div>
        <div className="text-[11px] mt-[2px]" style={{ color: '#555' }}>
          {prospects.length} prospect{prospects.length !== 1 ? 's' : ''} · {openCount} window{openCount !== 1 ? 's' : ''} open
        </div>
      </div>

      {/* Add prospect — at top */}
      <div className="pt-[10px]" style={{ borderBottom: '1px solid #2a2a2c' }}>
        <AddProspectInput />
      </div>

      {/* Filter search */}
      <input
        className="mx-[12px] mt-[10px] rounded-[6px] px-[10px] py-[6px] text-[12px] outline-none"
        style={{ background: '#242424', border: 'none', color: '#aaa' }}
        placeholder="Filter prospects…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Grouped prospect list */}
      {GROUP_ORDER.map(group => {
        const items = filtered.filter(p =>
          group.status === 'closed'
            ? p.window_status === 'closed' || p.window_status === null
            : p.window_status === group.status
        )
        if (!items.length) return null

        return (
          <div key={group.label}>
            <div
              className="text-[11px] font-semibold uppercase tracking-[0.08em] px-[14px] pt-[12px] pb-[5px]"
              style={{ color: '#484844' }}
            >
              {group.label}
            </div>
            {items.map(p => <ProspectLink key={p.id} p={p} isActive={p.id === activeId} />)}
          </div>
        )
      })}

      {/* Archived toggle */}
      {archivedProspects.length > 0 && (
        <div className="px-[14px] pt-[10px]">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-[11px] transition-colors"
            style={{ color: '#484844', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = '#888')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = '#484844')}
          >
            {showArchived ? '▾' : '▸'} {archivedProspects.length} archived
          </button>
          {showArchived && filteredArchived.map(p => (
            <ProspectLink key={p.id} p={p} isActive={p.id === activeId} muted />
          ))}
        </div>
      )}

      {/* Footer — cost badge + settings link */}
      <div className="mt-auto px-[14px] py-[12px]" style={{ borderTop: '1px solid #2a2a2c' }}>
        <div className="text-[10px] mb-[8px]" style={{ color: '#484844' }}>
          This month:{' '}
          <span style={{ color: '#b8b6b0' }}>
            {monthlyCostUsd < 0.01 ? '<$0.01' : `$${monthlyCostUsd.toFixed(2)}`}
          </span>
        </div>
        <Link
          href="/setup"
          className="text-[11px] transition-colors block"
          style={{ color: '#555' }}
          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b8b6b0')}
          onMouseLeave={e => ((e.target as HTMLElement).style.color = '#555')}
        >
          Profile &amp; settings →
        </Link>
        {isAdmin && (
          <>
            <Link
              href="/admin/products"
              className="text-[11px] transition-colors block mt-[5px]"
              style={{ color: '#555' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b8b6b0')}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = '#555')}
            >
              Manage products →
            </Link>
            <Link
              href="/admin/users"
              className="text-[11px] transition-colors block mt-[5px]"
              style={{ color: '#555' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b8b6b0')}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = '#555')}
            >
              Manage team →
            </Link>
            <Link
              href="/admin/case-studies"
              className="text-[11px] transition-colors block mt-[5px]"
              style={{ color: '#555' }}
              onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b8b6b0')}
              onMouseLeave={e => ((e.target as HTMLElement).style.color = '#555')}
            >
              Case studies →
            </Link>
          </>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 h-full w-[4px] cursor-col-resize"
        style={{ zIndex: 10 }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#3a3a3c')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      />
    </aside>
  )
}

function ProspectLink({ p, isActive, muted = false }: { p: ProspectSidebarItem; isActive: boolean; muted?: boolean }) {
  const { dot } = windowStatusColor(p.window_status)
  return (
    <Link
      href={`/prospects/${p.id}`}
      className="flex items-center gap-[8px] px-[14px] py-[7px] cursor-pointer transition-colors"
      style={{ background: isActive ? '#2c2c2e' : 'transparent' }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#222224' }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      <span
        className="flex-shrink-0 rounded-full"
        style={{ width: 7, height: 7, background: muted ? '#3a3a3c' : dot }}
      />
      <span
        className="flex-1 text-[13px] overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ color: isActive ? '#F0EDE6' : muted ? '#484844' : '#b8b6b0', fontWeight: isActive ? 500 : 400 }}
      >
        {p.name}
      </span>
      {p.fy_end && (
        <span className="text-[11px] flex-shrink-0" style={{ color: muted ? '#333' : '#484844' }}>
          {p.fy_end}
        </span>
      )}
    </Link>
  )
}
