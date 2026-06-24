'use client'

import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { detectSlop } from '@/lib/slop'
import type { DecisionMaker, NewsItem } from '@/lib/types'

type ProductOption = { id: string; name: string }

type Props = {
  prospectId: string
  products: ProductOption[]
  dms: DecisionMaker[]
  // Brief signals — source the compelling-event picklist
  painSignals: string[]
  initiatives: string[]
  news: NewsItem[]
}

const CUSTOM = '__custom__'

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// A persona label from a decision maker: "VP Data Eng — Jane Doe", falling back
// to the role label when title/name are missing.
function personaLabel(d: DecisionMaker): string {
  const role = d.title?.trim() || d.role_label
  return d.name?.trim() ? `${role} — ${d.name.trim()}` : role
}

export default function PitchOpenerButton({ prospectId, products, dms, painSignals, initiatives, news }: Props) {
  const [open,              setOpen]              = useState(false)
  // Product drives signal selection — default to the first product, never empty.
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id ?? '')

  // Persona: pick a DM or choose custom → free text
  const [personaChoice, setPersonaChoice] = useState<string>('')  // '' = none, CUSTOM, or a DM label
  const [personaCustom, setPersonaCustom] = useState<string>('')

  // Compelling event: pick a brief signal or choose custom → free text
  const [eventChoice, setEventChoice] = useState<string>('')      // '' = none, CUSTOM, or a signal string
  const [eventCustom, setEventCustom] = useState<string>('')

  const [generating, setGenerating] = useState(false)
  const [paragraph,  setParagraph]  = useState<string>('')
  const [copied,     setCopied]     = useState(false)

  // Event options grouped by source — picklist built from the brief.
  const eventGroups = useMemo(() => ([
    { label: 'Pain signals',          items: painSignals ?? [] },
    { label: 'Strategic initiatives', items: initiatives ?? [] },
    { label: 'Recent news',           items: (news ?? []).map(n => n.text) },
  ].filter(g => g.items.length > 0)), [painSignals, initiatives, news])

  const persona = personaChoice === CUSTOM ? personaCustom.trim() : personaChoice.trim()
  const event   = eventChoice   === CUSTOM ? eventCustom.trim()   : eventChoice.trim()
  // Product is the only requirement now — persona and event are both optional.
  const canGenerate = selectedProductId.length > 0 && !generating

  const slopHits = paragraph ? detectSlop(paragraph) : []
  const words    = paragraph ? wordCount(paragraph) : 0

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/pitch-opener', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prospect_id:      prospectId,
          product_id:       selectedProductId || undefined,
          persona:          persona || undefined,
          compelling_event: event || undefined,
        }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Failed to generate opener.')
        return
      }
      const { paragraph: fresh, cost_usd } = await res.json()
      setParagraph(fresh)
      toast.success(`Opener generated · $${cost_usd.toFixed(4)}`)
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setGenerating(false)
    }
  }, [prospectId, selectedProductId, persona, event])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(paragraph).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [paragraph])

  const selectStyle = {
    borderColor: 'var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)',
  }
  const labelStyle = { color: 'var(--sl-text3)' }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium"
        style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
      >
        Pitch opener →
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="flex flex-col rounded-[12px] overflow-hidden"
            style={{
              background: 'var(--sl-surface)',
              border: '1px solid var(--sl-border)',
              width: 540,
              maxWidth: 'calc(100vw - 48px)',
              maxHeight: 'calc(100vh - 80px)',
            }}
          >
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--sl-border)' }}
            >
              <span className="text-[12px] font-semibold" style={{ color: 'var(--sl-text)' }}>
                Pitch opener
              </span>
              <div className="flex items-center gap-2">
                {paragraph && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: words > 60 ? 'var(--sl-coral-bg)' : 'var(--sl-green-bg)',
                      color:      words > 60 ? 'var(--sl-coral-t)' : 'var(--sl-green-t)',
                    }}
                  >
                    {words}w {words > 60 ? '· over limit' : '· on target'}
                  </span>
                )}
                {slopHits.length > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--sl-amber-bg)', color: 'var(--sl-amber-t)' }}
                    title={`Slop detected: ${slopHits.join(', ')}`}
                  >
                    ⚠ slop: {slopHits.slice(0, 2).join(', ')}{slopHits.length > 2 ? ` +${slopHits.length - 2}` : ''}
                  </span>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-[18px] leading-none cursor-pointer hover:opacity-60"
                  style={{ color: 'var(--sl-text3)', background: 'none', border: 'none' }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

              {/* Inputs */}
              <div className="flex flex-col gap-3">

                {/* Product — drives signal selection; always shown, always set */}
                {products.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={labelStyle}>Product to pitch</span>
                    <select
                      value={selectedProductId}
                      onChange={e => setSelectedProductId(e.target.value)}
                      disabled={generating}
                      className="rounded-[6px] border px-2 py-[5px] text-[12px] outline-none disabled:opacity-50"
                      style={selectStyle}
                    >
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Persona */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={labelStyle}>Persona / role (optional)</span>
                  <select
                    value={personaChoice}
                    onChange={e => setPersonaChoice(e.target.value)}
                    disabled={generating}
                    className="rounded-[6px] border px-2 py-[5px] text-[12px] outline-none disabled:opacity-50"
                    style={selectStyle}
                  >
                    <option value="">None — speak to the company</option>
                    {dms.length > 0 && (
                      <optgroup label="Decision makers">
                        {dms.map(d => {
                          const label = personaLabel(d)
                          return <option key={d.id} value={label}>{label}</option>
                        })}
                      </optgroup>
                    )}
                    <option value={CUSTOM}>Other — type a role…</option>
                  </select>
                  {personaChoice === CUSTOM && (
                    <input
                      type="search"
                      value={personaCustom}
                      onChange={e => setPersonaCustom(e.target.value)}
                      disabled={generating}
                      placeholder="e.g. VP of Data Engineering"
                      className="rounded-[6px] border px-2 py-[5px] text-[12px] outline-none disabled:opacity-50"
                      style={selectStyle}
                    />
                  )}
                </div>

                {/* Compelling event — optional override; blank lets the model pick the best fit */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={labelStyle}>Compelling event (optional)</span>
                  <select
                    value={eventChoice}
                    onChange={e => setEventChoice(e.target.value)}
                    disabled={generating}
                    className="rounded-[6px] border px-2 py-[5px] text-[12px] outline-none disabled:opacity-50"
                    style={selectStyle}
                  >
                    <option value="">Auto — best-fit signal for this product</option>
                    {eventGroups.map(g => (
                      <optgroup key={g.label} label={g.label}>
                        {g.items.map((item, i) => <option key={`${g.label}-${i}`} value={item}>{item}</option>)}
                      </optgroup>
                    ))}
                    <option value={CUSTOM}>Other — type your own…</option>
                  </select>
                  {eventChoice === CUSTOM && (
                    <input
                      type="search"
                      value={eventCustom}
                      onChange={e => setEventCustom(e.target.value)}
                      disabled={generating}
                      placeholder="e.g. migrating off legacy Pentaho, retiring on-prem warehouse"
                      className="rounded-[6px] border px-2 py-[5px] text-[12px] outline-none disabled:opacity-50"
                      style={selectStyle}
                    />
                  )}
                </div>
              </div>

              {/* Result */}
              {paragraph && (
                <>
                  <div style={{ height: 1, background: 'var(--sl-border)' }} />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-2" style={labelStyle}>Opener</div>
                    <div className="text-[13px] leading-[1.7] whitespace-pre-wrap" style={{ color: 'var(--sl-text)' }}>
                      {paragraph}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Actions footer */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--sl-border)' }}
            >
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
              >
                {generating ? 'Generating…' : paragraph ? '↺ Regenerate' : 'Generate opener'}
              </button>
              {paragraph && (
                <button
                  onClick={handleCopy}
                  className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium transition-opacity hover:opacity-80"
                  style={{ border: 'none', background: 'var(--sl-text)', color: '#F0EDE6' }}
                >
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
