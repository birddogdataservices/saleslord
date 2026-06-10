'use client'

import { useEffect } from 'react'
import type { OrgCandidate } from '@/lib/types'

type Props = {
  query: string
  candidates: OrgCandidate[]
  onSelect: (candidate: OrgCandidate | null) => void  // null = "search anyway"
  onClose: () => void
  costHint?: string  // e.g. "roughly $0.10–$0.40 from your Anthropic key"
}

export default function OrgDisambiguationDialog({ query, candidates, onSelect, onClose, costHint }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const hasResults = candidates.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-[12px] flex flex-col"
        style={{
          background: 'var(--sl-surface)',
          border: '1px solid var(--sl-border)',
          width: 580,
          maxWidth: '92vw',
          maxHeight: '82vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--sl-border-s)' }}
        >
          <div>
            <div className="text-[14px] font-semibold" style={{ color: 'var(--sl-text)' }}>
              {candidates.length === 1 ? 'Confirm company' : 'Which company?'}
            </div>
            <div className="text-[12px] mt-[3px]" style={{ color: 'var(--sl-text2)' }}>
              {candidates.length === 1
                ? `Best match for "${query}"`
                : `"${query}" matched multiple organizations`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] cursor-pointer hover:opacity-70 px-3 py-1 rounded-[4px]"
            style={{ color: 'var(--sl-text3)', background: 'var(--sl-surface2)' }}
          >
            Cancel
          </button>
        </div>

        {/* Candidates */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2" style={{ minHeight: 0 }}>
          {!hasResults ? (
            <div className="py-8 text-center">
              <p className="text-[13px]" style={{ color: 'var(--sl-text2)' }}>
                No matching organizations found for &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(c)}
                className="text-left rounded-[8px] px-4 py-3 w-full cursor-pointer"
                style={{
                  background: 'var(--sl-surface2)',
                  border: '1px solid var(--sl-border-s)',
                  transition: 'border-color 120ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--sl-border)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--sl-border-s)')}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium" style={{ color: 'var(--sl-text)' }}>
                      {c.name}
                    </div>
                    <div
                      className="text-[12px] mt-[3px] leading-snug"
                      style={{ color: 'var(--sl-text2)' }}
                    >
                      {c.description}
                    </div>
                  </div>
                  {c.hq_display && (
                    <div
                      className="text-[11px] flex-shrink-0 mt-[1px] whitespace-nowrap"
                      style={{ color: 'var(--sl-text3)' }}
                    >
                      {c.hq_display}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer — cost hint + escape hatch */}
        <div
          className="px-5 py-3 flex-shrink-0 flex flex-col items-center gap-2"
          style={{ borderTop: '1px solid var(--sl-border-s)' }}
        >
          {costHint && (
            <p className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
              {costHint}
            </p>
          )}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="cursor-pointer hover:opacity-70"
            style={{
              fontSize: hasResults ? 11 : 13,
              color: hasResults ? 'var(--sl-text3)' : 'var(--sl-text2)',
              background: 'none',
              border: 'none',
              padding: 0,
            }}
          >
            Search anyway for &ldquo;{query}&rdquo;
          </button>
        </div>
      </div>
    </div>
  )
}
