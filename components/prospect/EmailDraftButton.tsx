'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { detectSlop } from '@/lib/slop'
import type { EmailDraft } from '@/lib/types'

type Props = {
  initialEmail: EmailDraft
  prospectId: string
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function EmailDraftButton({ initialEmail, prospectId }: Props) {
  const [open,       setOpen]       = useState(false)
  const [email,      setEmail]      = useState<EmailDraft>(initialEmail)
  const [refreshing, setRefreshing] = useState(false)
  const [copied,     setCopied]     = useState(false)

  const slopHits  = detectSlop(email.body)
  const bodyWords = wordCount(email.body)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/refresh-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prospect_id: prospectId }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? 'Failed to refresh email.')
        return
      }
      const { email: fresh, cost_usd } = await res.json()
      setEmail(fresh)
      toast.success(`Email refreshed · $${cost_usd.toFixed(4)}`)
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setRefreshing(false)
    }
  }, [prospectId])

  const handleCopy = useCallback(() => {
    const text = `Subject: ${email.subject}\n\n${email.body}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [email])

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium"
        style={{ border: 'none', background: 'var(--sl-text)', color: '#F0EDE6' }}
      >
        Draft email →
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
                Suggested email
              </span>
              <div className="flex items-center gap-2">
                {/* Word count */}
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: bodyWords > 75 ? 'var(--sl-coral-bg)' : 'var(--sl-green-bg)',
                    color:      bodyWords > 75 ? 'var(--sl-coral-t)' : 'var(--sl-green-t)',
                  }}
                >
                  {bodyWords}w {bodyWords > 75 ? '· over limit' : '· on target'}
                </span>
                {/* Slop badge */}
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

            {/* Email content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

              {/* Subject */}
              <div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1"
                  style={{ color: 'var(--sl-text3)' }}
                >
                  Subject
                </div>
                <div
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--sl-text)' }}
                >
                  {email.subject}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--sl-border)' }} />

              {/* Body */}
              <div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-2"
                  style={{ color: 'var(--sl-text3)' }}
                >
                  Body
                </div>
                <div
                  className="text-[13px] leading-[1.7] whitespace-pre-wrap"
                  style={{ color: 'var(--sl-text)' }}
                >
                  {email.body}
                </div>
              </div>
            </div>

            {/* Actions footer */}
            <div
              className="flex items-center justify-between px-5 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--sl-border)' }}
            >
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
              >
                {refreshing ? 'Refreshing…' : '↺ Refresh draft'}
              </button>
              <button
                onClick={handleCopy}
                className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium transition-opacity hover:opacity-80"
                style={{ border: 'none', background: 'var(--sl-text)', color: '#F0EDE6' }}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
