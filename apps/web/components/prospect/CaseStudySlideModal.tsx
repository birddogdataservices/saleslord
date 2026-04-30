'use client'

import { useState, useEffect } from 'react'
import type { CaseStudyMatch } from '@/lib/types'

type Props = {
  caseStudy: CaseStudyMatch
  onClose: () => void
}

export default function CaseStudySlideModal({ caseStudy, onClose }: Props) {
  const [imageUrl, setImageUrl]   = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    async function fetchUrl() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/case-studies/slide-url/${caseStudy.id}`)
        if (!res.ok) {
          setError('Could not load slide image.')
          return
        }
        const data = await res.json()
        setImageUrl(data.url)
      } catch {
        setError('Network error loading slide.')
      } finally {
        setLoading(false)
      }
    }
    fetchUrl()
  }, [caseStudy.id])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative rounded-[12px] overflow-hidden flex flex-col"
        style={{
          background: 'var(--sl-surface)',
          border: '1px solid var(--sl-border)',
          maxWidth: '90vw',
          maxHeight: '90vh',
          width: 820,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--sl-border-s)' }}
        >
          <div>
            <div className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>
              {caseStudy.company_name ?? caseStudy.title}
            </div>
            {caseStudy.industry && (
              <div className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>{caseStudy.industry}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] cursor-pointer hover:opacity-70 px-2 py-1 rounded-[4px]"
            style={{ color: 'var(--sl-text3)', background: 'var(--sl-surface2)' }}
          >
            Close
          </button>
        </div>

        {/* Slide image area */}
        <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div
                className="w-5 h-5 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--sl-border)', borderTopColor: 'var(--sl-text3)' }}
              />
            </div>
          )}
          {error && !loading && (
            <div className="flex items-center justify-center py-16">
              <p className="text-[12px]" style={{ color: 'var(--sl-text3)' }}>{error}</p>
            </div>
          )}
          {imageUrl && !loading && (
            <img
              src={imageUrl}
              alt={`${caseStudy.company_name ?? caseStudy.title} case study slide`}
              className="w-full h-auto block"
            />
          )}
        </div>

        {/* Footer — outcome summary */}
        {caseStudy.outcome && (
          <div
            className="px-4 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid var(--sl-border-s)' }}
          >
            <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
              {caseStudy.outcome}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
