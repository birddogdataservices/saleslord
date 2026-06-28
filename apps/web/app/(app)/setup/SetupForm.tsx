'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import ProductsManager from './ProductsManager'
import { LANGUAGES, normalizeLocale } from '@/lib/i18n/languages'
import type { RepProfile, Product, TeamConfig } from '@/lib/types'

// ── Targeting presets ─────────────────────────────────────────────────────────
const PRESET_SENIORITY_BANDS = [
  'C-Suite', 'SVP / EVP', 'VP', 'Senior Director', 'Director',
  'Head of [Function]', 'Senior Manager', 'Manager', 'Individual Contributor',
]
const PRESET_TARGET_FUNCTIONS = [
  'Data Engineering', 'Data Platform', 'Data Architecture', 'Analytics Engineering',
  'Business Intelligence', 'Data Science', 'Data Governance', 'Data Management',
  'Enterprise Architecture', 'IT / Infrastructure', 'Software Engineering',
  'Operations', 'Product', 'Finance',
]

type Props = {
  profile: RepProfile | null
  products: Product[]
  hasApiKey: boolean
  teamConfig: TeamConfig | null
  userId: string
}

function voiceStatus(samples: string) {
  if (!samples || samples.trim().length < 80) return 'uncalibrated'
  return 'calibrated'
}

export default function SetupForm({ profile, products, hasApiKey, teamConfig, userId }: Props) {
  const supabase = createClient()
  const router   = useRouter()
  const t        = useTranslations('Setup')
  const tc       = useTranslations('Common')

  const [repBackground, setBackground] = useState(profile?.rep_background ?? '')
  const [voiceSamples,  setVoice]      = useState(profile?.voice_samples  ?? '')
  const [icp,           setIcp]        = useState(profile?.icp_description ?? '')
  const [apiKey,        setApiKey]     = useState('')
  const [saving, setSaving] = useState(false)

  // Language drives chrome + default generation language. Saving it goes through
  // /api/profile/locale (writes rep_profiles.locale AND the NEXT_LOCALE cookie),
  // then router.refresh() so the chrome re-renders in the new language.
  const [locale,       setLocale]       = useState<string>(normalizeLocale(profile?.locale))
  const [savingLocale, setSavingLocale] = useState(false)

  async function saveLocale(next: string) {
    setLocale(next)
    setSavingLocale(true)
    const res = await fetch('/api/profile/locale', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ locale: next }),
    })
    setSavingLocale(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? t('toastLanguageFailed'))
      return
    }
    toast.success(t('toastLanguageSaved'))
    router.refresh()
  }

  // Targeting state — initialized from team_config, merged with presets
  const [seniorityBands,   setSeniorityBands]   = useState<string[]>(teamConfig?.seniority_bands   ?? [])
  const [targetFunctions,  setTargetFunctions]  = useState<string[]>(teamConfig?.target_functions  ?? [])
  const [customBandInput,  setCustomBandInput]  = useState('')
  const [customFuncInput,  setCustomFuncInput]  = useState('')
  const [savingTargeting,  setSavingTargeting]  = useState(false)

  // All known band/function options = presets + any saved custom values
  const allBands = [...new Set([...PRESET_SENIORITY_BANDS, ...(teamConfig?.seniority_bands ?? [])])]
  const allFuncs = [...new Set([...PRESET_TARGET_FUNCTIONS, ...(teamConfig?.target_functions ?? [])])]

  const status = voiceStatus(voiceSamples)

  // Chrome ignores autoComplete hints and fills custom inputs with saved credentials.
  // Force-clear after mount so browser autofill never sticks.
  useEffect(() => {
    setCustomBandInput('')
    setCustomFuncInput('')
  }, [])

  async function saveTargeting() {
    setSavingTargeting(true)
    const res = await fetch('/api/admin/team-config', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ seniority_bands: seniorityBands, target_functions: targetFunctions }),
    })
    const data = await res.json()
    setSavingTargeting(false)
    if (!res.ok) { toast.error(data.error ?? t('toastTargetingFailed')); return }
    toast.success(t('toastTargetingSaved'))
  }

  function toggleChip(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value])
  }

  function addCustomChip(
    list: string[], setList: (v: string[]) => void,
    input: string, setInput: (v: string) => void,
    allOptions: string[]
  ) {
    const val = input.trim()
    if (!val || allOptions.includes(val)) { setInput(''); return }
    setList([...list, val])
    setInput('')
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error(t('toastNotAuthed')); setSaving(false); return }

    // Save profile fields via Supabase client (anon key — no secrets here)
    const { error } = await supabase
      .from('rep_profiles')
      .upsert({
        user_id:         user.id,
        rep_background:  repBackground,
        voice_samples:   voiceSamples,
        icp_description: icp,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) { setSaving(false); toast.error(t('toastProfileFailed')); return }

    // Save API key via server route — encrypted before DB write, never touches client
    if (apiKey.trim()) {
      const keyRes = await fetch('/api/profile/api-key', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const keyData = await keyRes.json()
      if (!keyRes.ok) { setSaving(false); toast.error(keyData.error ?? t('toastApiKeyFailed')); return }
      setApiKey('')
    }

    setSaving(false)
    toast.success(t('toastProfileSaved'))
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── Products — mandatory, per-user ── */}
      <div className="flex flex-col gap-3">
        {products.length === 0 && (
          <div
            className="rounded-[10px] px-5 py-4 text-[12px] leading-relaxed"
            style={{ background: 'var(--sl-amber-bg)', color: 'var(--sl-amber-t)', border: '1px solid var(--sl-amber-t)' }}
          >
            <span className="font-semibold">{t('onboardingBannerTitle')}</span>{' '}
            {t('onboardingBannerBody')}
          </div>
        )}
        <Section
          title={t('productsTitle')}
          hint={t('productsHint')}
          required
        >
          <ProductsManager initialProducts={products} userId={userId} />
        </Section>
      </div>

      <form onSubmit={save} className="flex flex-col gap-8">

      {/* Voice calibration badge */}
      <div>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={status === 'calibrated'
            ? { background: 'var(--sl-green-bg)', color: 'var(--sl-green-t)' }
            : { background: 'var(--sl-amber-bg)', color: 'var(--sl-amber-t)' }}
        >
          <span className="rounded-full inline-block" style={{
            width: 6, height: 6,
            background: status === 'calibrated' ? 'var(--sl-green-t)' : 'var(--sl-amber-t)',
          }} />
          {status === 'calibrated' ? t('voiceCalibrated') : t('voiceUncalibrated')}
        </span>
      </div>

      {/* ── 1. Background ── */}
      <Section title={t('backgroundTitle')} hint={t('backgroundHint')}>
        <Textarea
          rows={3}
          placeholder={t('backgroundPlaceholder')}
          value={repBackground}
          onChange={e => setBackground(e.target.value)}
          className="text-[12px] resize-y"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-surface)' }}
        />
      </Section>

      {/* ── 2. Voice samples ── */}
      <Section
        title={t('voiceTitle')}
        hint={t('voiceHint')}
        required
      >
        <Textarea
          rows={8}
          placeholder={t('voicePlaceholder')}
          value={voiceSamples}
          onChange={e => setVoice(e.target.value)}
          className="text-[12px] resize-y"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-surface)' }}
        />
      </Section>

      {/* ── 3. ICP ── */}
      <Section title={t('icpTitle')} hint={t('icpHint')}>
        <Textarea
          rows={3}
          placeholder={t('icpPlaceholder')}
          value={icp}
          onChange={e => setIcp(e.target.value)}
          className="text-[12px] resize-y"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-surface)' }}
        />
      </Section>

      {/* ── Language ── (saved immediately via its own route — outside the profile form submit) */}
      <Section title={t('languageTitle')} hint={t('languageHint')}>
        <select
          value={locale}
          onChange={e => saveLocale(e.target.value)}
          disabled={savingLocale}
          className="rounded-[6px] px-3 py-2 text-[12px] outline-none disabled:opacity-50 self-start"
          style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
        >
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </Section>

      {/* ── 4. Targeting ── */}
      <div className="flex flex-col gap-4 rounded-[10px] px-5 py-5" style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>{t('targetingTitle')}</h2>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--sl-text3)' }}>
              {t('targetingHint')}{' '}
              {!profile?.is_admin && <span style={{ color: 'var(--sl-amber-t)' }}>{t('adminOnlyToEdit')}</span>}
            </p>
          </div>
          {profile?.is_admin && (
            <button
              type="button"
              onClick={saveTargeting}
              disabled={savingTargeting}
              className="flex-shrink-0 rounded-[6px] px-3 py-1.5 text-[11px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              style={{ background: 'var(--sl-text)', color: '#F0EDE6', border: 'none' }}
            >
              {savingTargeting ? tc('saving') : t('saveTargeting')}
            </button>
          )}
        </div>

        {/* Seniority bands */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--sl-text2)' }}>{t('targetSeniorityBands')}</p>
          <div className="flex flex-wrap gap-1.5">
            {allBands.map(band => {
              const selected = seniorityBands.includes(band)
              return (
                <button
                  key={band}
                  type="button"
                  disabled={!profile?.is_admin}
                  onClick={() => profile?.is_admin && toggleChip(seniorityBands, setSeniorityBands, band)}
                  className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
                  style={selected
                    ? { background: 'var(--sl-blue-bg)', color: 'var(--sl-blue-t)', border: '1px solid var(--sl-blue-t)', fontWeight: 600 }
                    : { background: 'var(--sl-surface2)', color: 'var(--sl-text3)', border: '1px solid var(--sl-border)', cursor: profile?.is_admin ? 'pointer' : 'default' }
                  }
                >
                  {band}
                </button>
              )
            })}
          </div>
          {profile?.is_admin && (
            <form
              className="flex items-center gap-2 mt-1"
              onSubmit={e => { e.preventDefault(); addCustomChip(seniorityBands, setSeniorityBands, customBandInput, setCustomBandInput, allBands) }}
            >
              <input
                type="search"
                value={customBandInput}
                onChange={e => setCustomBandInput(e.target.value)}
                placeholder={t('addCustomBand')}
                className="rounded-[6px] px-2.5 py-1 text-[11px] outline-none flex-1"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
              />
              <button
                type="submit"
                className="text-[11px] px-2.5 py-1 rounded-[6px]"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface2)', color: 'var(--sl-text2)' }}
              >
                {tc('add')}
              </button>
            </form>
          )}
        </div>

        {/* Target functions */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--sl-text2)' }}>{t('targetFunctions')}</p>
          <div className="flex flex-wrap gap-1.5">
            {allFuncs.map(fn => {
              const selected = targetFunctions.includes(fn)
              return (
                <button
                  key={fn}
                  type="button"
                  disabled={!profile?.is_admin}
                  onClick={() => profile?.is_admin && toggleChip(targetFunctions, setTargetFunctions, fn)}
                  className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
                  style={selected
                    ? { background: 'var(--sl-teal-bg)', color: 'var(--sl-teal-t)', border: '1px solid var(--sl-teal-t)', fontWeight: 600 }
                    : { background: 'var(--sl-surface2)', color: 'var(--sl-text3)', border: '1px solid var(--sl-border)', cursor: profile?.is_admin ? 'pointer' : 'default' }
                  }
                >
                  {fn}
                </button>
              )
            })}
          </div>
          {profile?.is_admin && (
            <form
              className="flex items-center gap-2 mt-1"
              onSubmit={e => { e.preventDefault(); addCustomChip(targetFunctions, setTargetFunctions, customFuncInput, setCustomFuncInput, allFuncs) }}
            >
              <input
                type="search"
                value={customFuncInput}
                onChange={e => setCustomFuncInput(e.target.value)}
                placeholder={t('addCustomFunction')}
                className="rounded-[6px] px-2.5 py-1 text-[11px] outline-none flex-1"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
              />
              <button
                type="submit"
                className="text-[11px] px-2.5 py-1 rounded-[6px]"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface2)', color: 'var(--sl-text2)' }}
              >
                {tc('add')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── 5. Anthropic API key ── */}
      <Section
        title={t('apiKeyTitle')}
        hint={t('apiKeyHint')}
        required
      >
        <div className="flex flex-col gap-2">
          {hasApiKey && !apiKey && (
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full self-start"
              style={{ background: 'var(--sl-green-bg)', color: 'var(--sl-green-t)' }}
            >
              <span className="rounded-full inline-block" style={{ width: 6, height: 6, background: 'var(--sl-green-t)' }} />
              {t('apiKeyConfigured')}
            </div>
          )}
          <input
            type="password"
            autoComplete="off"
            placeholder={hasApiKey ? t('apiKeyPlaceholderReplace') : t('apiKeyPlaceholderEmpty')}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="rounded-[6px] px-3 py-2 text-[12px] outline-none font-mono"
            style={{ borderColor: 'var(--sl-border)', border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
          />
          <p className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
            {t('apiKeyNote')}
          </p>
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <p className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
          {t('changesNote')}
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[6px] px-4 py-2 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--sl-text)', color: '#F0EDE6', border: 'none' }}
        >
          {saving ? tc('saving') : t('saveProfile')}
        </button>
      </div>
      </form>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────
function Section({ title, hint, required, children }: {
  title: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>
          {title}
          {required && <span style={{ color: 'var(--sl-coral-t)' }} className="ml-0.5">*</span>}
        </h2>
        {hint && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--sl-text3)' }}>{hint}</p>}
      </div>
      {children}
    </div>
  )
}
