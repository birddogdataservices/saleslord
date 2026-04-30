'use client'

import { useState } from 'react'
import type { NewsItem } from '@/lib/types'

const PAGE_SIZE = 3

type Props = { news: NewsItem[] }

export default function NewsCard({ news }: Props) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(news.length / PAGE_SIZE))
  const start = (page - 1) * PAGE_SIZE
  const items = news.slice(start, start + PAGE_SIZE)

  return (
    <Card>
      <div className="flex items-center justify-between px-[14px] py-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text2)' }}>
          Recent news
        </span>
        <span className="text-[10px]" style={{ color: 'var(--sl-text3)' }}>
          Showing {start + 1}–{Math.min(start + PAGE_SIZE, news.length)} of {news.length}
        </span>
      </div>

      <div className="px-[14px] py-[8px]">
        {items.length === 0 && (
          <p className="text-[12px] py-2" style={{ color: 'var(--sl-text3)' }}>No news found.</p>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className="py-[9px]"
            style={{ borderBottom: i < items.length - 1 ? '1px solid var(--sl-border-s)' : 'none' }}
          >
            <div className="flex items-baseline gap-2 mb-[3px]">
              <span className="text-[10px] flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--sl-text3)' }}>
                {item.date}
              </span>
              <span className="text-[12px] leading-relaxed flex-1" style={{ color: 'var(--sl-text)' }}>
                {item.text}
              </span>
            </div>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] mt-[3px] hover:underline"
                style={{ color: 'var(--sl-blue-t)' }}
              >
                <ExternalIcon />
                {item.source}
              </a>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div
          className="flex items-center justify-between px-[14px] py-[10px] mx-[14px] mb-[12px]"
          style={{ borderTop: '1px solid var(--sl-border-s)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <PgBtn onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</PgBtn>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <PgBtn key={n} onClick={() => setPage(n)} active={n === page}>{n}</PgBtn>
            ))}
            <PgBtn onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</PgBtn>
          </div>
        </div>
      )}
    </Card>
  )
}

function PgBtn({ children, onClick, disabled, active }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-[11px] px-[10px] py-[3px] rounded-[5px] cursor-pointer disabled:opacity-35 disabled:cursor-default"
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}>
      {children}
    </div>
  )
}

function ExternalIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.7 }}>
      <path d="M4 2H2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M6 1h3v3M9 1 5.5 4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}
