'use client'

import { useState } from 'react'
import type { ProspectUpdate } from '@/lib/types'

type Props = {
  updates: ProspectUpdate[]
  // When the current brief was written. Updates older than this were folded in
  // by the re-research that produced it.
  briefCreatedAt: string | null
}

// Update blurbs sit above the brief, which reads as "newer than what follows".
// That was a lie after a re-research: research re-gathers recent news into the
// brief but never touches prospect_updates, so blurbs from before the rebuild
// kept sitting on top, duplicating what the fresh brief already said and
// looking like the more current of the two.
//
// Nothing is deleted — an account's trajectory over time is worth keeping.
// Anything predating the current brief is just moved behind a toggle and
// labelled for what it is: history, already reflected in the brief above.
export default function UpdateBlurbs({ updates, briefCreatedAt }: Props) {
  if (updates.length === 0) return null

  const briefTime = briefCreatedAt ? new Date(briefCreatedAt).getTime() : 0
  const current    = updates.filter(u => new Date(u.created_at).getTime() >  briefTime)
  const superseded = updates.filter(u => new Date(u.created_at).getTime() <= briefTime)

  return (
    <div className="flex flex-col gap-[10px]">
      {current.map(update => (
        <UpdateCard key={update.id} update={update} />
      ))}
      {superseded.length > 0 && <SupersededUpdates updates={superseded} />}
    </div>
  )
}

function SupersededUpdates({ updates }: { updates: ProspectUpdate[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[11px] transition-colors"
        style={{ color: 'var(--sl-text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {open ? '▾' : '▸'} {updates.length} earlier update{updates.length !== 1 ? 's' : ''}, already folded into the brief
      </button>
      {open && (
        <div className="flex flex-col gap-[10px] mt-[10px] opacity-60">
          {updates.map(update => (
            <UpdateCard key={update.id} update={update} />
          ))}
        </div>
      )}
    </div>
  )
}

function UpdateCard({ update }: { update: ProspectUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const hasNews = (update.news_items ?? []).length > 0

  const checkedLabel = new Date(update.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-[14px] py-[10px]"
        style={{ borderBottom: '1px solid var(--sl-border-s)' }}
      >
        <div className="flex items-center gap-[8px]">
          {/* Pulse dot — signals freshness */}
          <div
            className="w-[7px] h-[7px] rounded-full flex-shrink-0"
            style={{ background: 'var(--sl-blue-t)' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text2)' }}>
            Update
          </span>
          <span className="text-[10px]" style={{ color: 'var(--sl-text3)' }}>
            · checked {checkedLabel}
          </span>
        </div>
        {hasNews && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[11px] font-medium"
            style={{ color: 'var(--sl-blue-t)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {expanded ? 'Hide news' : `${update.news_items.length} new item${update.news_items.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="px-[14px] py-[12px]">
        <p className="text-[12px] leading-[1.7]" style={{ color: '#444' }}>
          {update.summary}
        </p>
      </div>

      {/* News items — expandable */}
      {hasNews && expanded && (
        <div style={{ borderTop: '1px solid var(--sl-border-s)' }}>
          {update.news_items.map((item, i) => (
            <div
              key={i}
              className="px-[14px] py-[10px] flex flex-col gap-[3px]"
              style={{ borderBottom: i < update.news_items.length - 1 ? '1px solid var(--sl-border-s)' : 'none' }}
            >
              <div className="flex items-center gap-[8px]">
                <span className="text-[10px]" style={{ color: 'var(--sl-text3)' }}>{item.date}</span>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-medium"
                    style={{ color: 'var(--sl-blue-t)', textDecoration: 'none' }}
                  >
                    {item.source} ↗
                  </a>
                )}
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: '#333' }}>{item.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
