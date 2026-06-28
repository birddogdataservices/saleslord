'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslations, useFormatter } from 'next-intl'
import { detectSlop } from '@/lib/slop'
import { LANGUAGES, PROFILE_DEFAULT, isSupportedLocale } from '@/lib/i18n/languages'
import type { EmailDraft } from '@/lib/types'

type ProductOption = { id: string; name: string }

type Props = {
  initialEmail: EmailDraft
  prospectId: string
  products: ProductOption[]   // list of available products for the selector
  outputLanguageOverride: string | null   // sticky per-prospect email language; null = profile default
}

const USD = { style: 'currency', currency: 'USD', maximumFractionDigits: 4 } as const

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export default function EmailDraftButton({ initialEmail, prospectId, products, outputLanguageOverride }: Props) {
  const t  = useTranslations('Email')
  const tc = useTranslations('Common')
  const tl = useTranslations('Language')
  const format = useFormatter()
  const [open,              setOpen]              = useState(false)
  const [email,             setEmail]             = useState<EmailDraft>(initialEmail)
  const [refreshing,        setRefreshing]        = useState(false)
  const [copied,            setCopied]            = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')  // '' = auto
  // Pre-select the prospect's sticky override if set, else the "Profile default" sentinel.
  const [language,          setLanguage]          = useState<string>(
    isSupportedLocale(outputLanguageOverride) ? outputLanguageOverride : PROFILE_DEFAULT
  )

  const slopHits  = detectSlop(email.body)
  const bodyWords = wordCount(email.body)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/refresh-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prospect_id:       prospectId,
          product_id:        selectedProductId || undefined,
          languageSelection: language,
        }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error ?? t('toastRefreshFailed'))
        return
      }
      const { email: fresh, cost_usd } = await res.json()
      setEmail(fresh)
      toast.success(t('toastRefreshed', { cost: format.number(cost_usd, USD) }))
    } catch {
      toast.error(tc('networkError'))
    } finally {
      setRefreshing(false)
    }
  }, [prospectId, selectedProductId, language, t, tc, format])

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
        {t('draftEmail')}
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
                {t('suggestedEmail')}
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
                  {bodyWords > 75 ? t('wordsOverLimit', { count: bodyWords }) : t('wordsOnTarget', { count: bodyWords })}
                </span>
                {/* Slop badge */}
                {slopHits.length > 0 && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--sl-amber-bg)', color: 'var(--sl-amber-t)' }}
                    title={`Slop detected: ${slopHits.join(', ')}`}
                  >
                    {t('slop', { phrases: `${slopHits.slice(0, 2).join(', ')}${slopHits.length > 2 ? ` +${slopHits.length - 2}` : ''}` })}
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
                  {t('subject')}
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
                  {t('body')}
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
              className="flex flex-col gap-2 px-5 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--sl-border)' }}
            >
              {/* Product selector — only shown when multiple products exist */}
              {products.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] flex-shrink-0" style={{ color: 'var(--sl-text3)' }}>
                    {t('focusOn')}
                  </span>
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                    disabled={refreshing}
                    className="flex-1 rounded-[6px] border px-2 py-[4px] text-[11px] outline-none disabled:opacity-50"
                    style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)' }}
                  >
                    <option value="">{t('focusAuto')}</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Language selector — the 6 + the "Profile default" sentinel.
                  Drives the sticky per-prospect override on refresh. */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] flex-shrink-0" style={{ color: 'var(--sl-text3)' }}>
                  {tl('label')}
                </span>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  disabled={refreshing}
                  className="flex-1 rounded-[6px] border px-2 py-[4px] text-[11px] outline-none disabled:opacity-50"
                  style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)' }}
                >
                  <option value={PROFILE_DEFAULT}>{tl('profileDefault')}</option>
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                  style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
                >
                  {refreshing ? t('refreshing') : t('refreshDraft')}
                </button>
                <button
                  onClick={handleCopy}
                  className="text-[11px] px-3 py-[5px] rounded-[6px] cursor-pointer font-medium transition-opacity hover:opacity-80"
                  style={{ border: 'none', background: 'var(--sl-text)', color: '#F0EDE6' }}
                >
                  {copied ? tc('copied') : tc('copyToClipboard')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
