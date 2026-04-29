'use client'

import { useState } from 'react'
import type { ProspectUpdate } from '@/lib/types'

type Props = {
  updates: ProspectUpdate[]
}

export default function UpdateBlurbs({ updates }: Props) {
  if (updates.length === 0) return null

  return (
    <div className="flex flex-col gap-[10px]">
      {updates.map(update => (
        <UpdateCard key={update.id} update={update} />
      ))}
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
