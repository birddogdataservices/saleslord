'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import CaseStudySlideModal from './CaseStudySlideModal'
import type { CaseStudyMatch } from '@/lib/types'

type Props = {
  prospectId: string
  prospectName: string
  caseStudyCount: number  // total records in library — shown in idle state
}

export default function CaseStudySection({ prospectId, prospectName, caseStudyCount }: Props) {
  const [state, setState]               = useState<'idle' | 'loading' | 'results'>('idle')
  const [matches, setMatches]           = useState<CaseStudyMatch[]>([])
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [exporting, setExporting]       = useState(false)
  const [previewMatch, setPreviewMatch] = useState<CaseStudyMatch | null>(null)

  // ── Find matches ────────────────────────────────────────────────
  async function handleFindMatches() {
    setState('loading')
    try {
      const res = await fetch('/api/case-studies/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Matching failed.')
        setState('idle')
        return
      }
      setMatches(data.matches ?? [])
      setState('results')
    } catch {
      toast.error('Network error during matching.')
      setState('idle')
    }
  }

  // ── Toggle card selection ────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Export selected as PDF ───────────────────────────────────────
  async function handleExport() {
    if (selected.size === 0) return
    setExporting(true)
    try {
      const res = await fetch('/api/case-studies/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_study_ids: Array.from(selected),
          prospect_name:  prospectName,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Export failed.')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${prospectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-case-studies.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Network error during export.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <SCard title="Relevant case studies on file.">
        {state === 'idle' && (
          <div className="px-[14px] py-[12px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px]" style={{ color: 'var(--sl-text3)' }}>
                {caseStudyCount} case {caseStudyCount === 1 ? 'study' : 'studies'} on file
              </span>
              <button
                type="button"
                onClick={handleFindMatches}
                className="rounded-[6px] px-3 py-[5px] text-[11px] font-medium cursor-pointer hover:opacity-90 flex-shrink-0"
                style={{ background: 'var(--sl-text)', color: '#F0EDE6' }}
              >
                Find matches
              </button>
            </div>
          </div>
        )}

        {state === 'loading' && (
          <div className="px-[14px] py-[12px] flex items-center gap-2">
            <div
              className="w-[14px] h-[14px] rounded-full border-2 animate-spin flex-shrink-0"
              style={{ borderColor: 'var(--sl-border)', borderTopColor: 'var(--sl-text3)' }}
            />
            <span className="text-[12px]" style={{ color: 'var(--sl-text3)' }}>
              Matching against {caseStudyCount} case {caseStudyCount === 1 ? 'study' : 'studies'}…
            </span>
          </div>
        )}

        {state === 'results' && (
          <div>
            {matches.length === 0 ? (
              <div className="px-[14px] py-[12px]">
                <p className="text-[12px]" style={{ color: 'var(--sl-text3)' }}>
                  No strong matches found for this prospect.
                </p>
                <button
                  type="button"
                  onClick={() => setState('idle')}
                  className="mt-2 text-[11px] cursor-pointer hover:opacity-70"
                  style={{ color: 'var(--sl-text3)' }}
                >
                  ← Back
                </button>
              </div>
            ) : (
              <>
                {/* Match cards */}
                <div className="divide-y" style={{ borderColor: 'var(--sl-border-s)' }}>
                  {matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      checked={selected.has(match.id)}
                      onToggle={() => toggleSelect(match.id)}
                      onPreview={() => setPreviewMatch(match)}
                    />
                  ))}
                </div>

                {/* Footer */}
                <div
                  className="px-[14px] py-[10px] flex items-center justify-between gap-3"
                  style={{ borderTop: '1px solid var(--sl-border-s)' }}
                >
                  <button
                    type="button"
                    onClick={() => { setState('idle'); setMatches([]); setSelected(new Set()) }}
                    className="text-[11px] cursor-pointer hover:opacity-70"
                    style={{ color: 'var(--sl-text3)' }}
                  >
                    ← Reset
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={selected.size === 0 || exporting}
                    className="rounded-[6px] px-3 py-[5px] text-[11px] font-medium cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--sl-text)', color: '#F0EDE6' }}
                  >
                    {exporting
                      ? 'Exporting…'
                      : selected.size === 0
                        ? 'Export selected as PDF'
                        : `Export ${selected.size} as PDF`
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </SCard>

      {/* Slide preview modal */}
      {previewMatch && (
        <CaseStudySlideModal
          caseStudy={previewMatch}
          onClose={() => setPreviewMatch(null)}
        />
      )}
    </>
  )
}

// ── Match card ────────────────────────────────────────────────────
function MatchCard({
  match,
  checked,
  onToggle,
  onPreview,
}: {
  match: CaseStudyMatch
  checked: boolean
  onToggle: () => void
  onPreview: () => void
}) {
  return (
    <div
      className="px-[14px] py-[10px] flex gap-3 items-start"
      style={{ background: checked ? 'var(--sl-surface2)' : 'transparent' }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-[2px] flex-shrink-0 cursor-pointer"
        style={{ accentColor: 'var(--sl-text)' }}
      />

      <div className="flex-1 min-w-0">
        {/* Company + industry */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium" style={{ color: 'var(--sl-text)' }}>
            {match.company_name ?? match.title}
          </span>
          {match.industry && (
            <span
              className="text-[10px] px-[6px] py-[1px] rounded-full"
              style={{ background: 'var(--sl-blue-bg)', color: 'var(--sl-blue-t)' }}
            >
              {match.industry}
            </span>
          )}
        </div>

        {/* Outcome */}
        {match.outcome && (
          <p className="text-[11px] mt-[4px] leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
            {match.outcome}
          </p>
        )}

        {/* Match reason chips */}
        {match.match_reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-[6px]">
            {match.match_reasons.map(reason => (
              <span
                key={reason}
                className="text-[10px] px-[6px] py-[1px] rounded-full"
                style={{ background: 'var(--sl-green-bg)', color: 'var(--sl-green-t)' }}
              >
                {reason}
              </span>
            ))}
          </div>
        )}

        {/* Preview link — only show if slide image exists */}
        {match.slide_image_path && (
          <button
            type="button"
            onClick={onPreview}
            className="mt-[6px] text-[10px] cursor-pointer hover:opacity-70"
            style={{ color: 'var(--sl-text3)', textDecoration: 'underline' }}
          >
            Preview slide →
          </button>
        )}
      </div>
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────
function SCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
    >
      <div className="px-[14px] py-[10px]" style={{ borderBottom: '1px solid var(--sl-border-s)' }}>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: 'var(--sl-text2)' }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}
