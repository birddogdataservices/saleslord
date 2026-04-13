'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
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
}

function voiceStatus(samples: string) {
  if (!samples || samples.trim().length < 80) return 'uncalibrated'
  return 'calibrated'
}

export default function SetupForm({ profile, products, hasApiKey, teamConfig }: Props) {
  const supabase = createClient()

  const [repBackground, setBackground] = useState(profile?.rep_background ?? '')
  const [voiceSamples,  setVoice]      = useState(profile?.voice_samples  ?? '')
  const [icp,           setIcp]        = useState(profile?.icp_description ?? '')
  const [apiKey,        setApiKey]     = useState('')
  const [saving, setSaving] = useState(false)

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
    if (!res.ok) { toast.error(data.error ?? 'Failed to save targeting config.'); return }
    toast.success('Targeting config saved.')
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
    if (!user) { toast.error('Not authenticated.'); setSaving(false); return }

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

    if (error) { setSaving(false); toast.error('Failed to save profile.'); return }

    // Save API key via server route — encrypted before DB write, never touches client
    if (apiKey.trim()) {
      const keyRes = await fetch('/api/profile/api-key', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ api_key: apiKey.trim() }),
      })
      const keyData = await keyRes.json()
      if (!keyRes.ok) { setSaving(false); toast.error(keyData.error ?? 'Failed to save API key.'); return }
      setApiKey('')
    }

    setSaving(false)
    toast.success('Profile saved.')
  }

  return (
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
          {status === 'calibrated' ? 'Voice calibrated' : 'Add voice samples for best results'}
        </span>
      </div>

      {/* ── 1. Background ── */}
      <Section title="Your background" hint="Relevant experience, past companies, or expertise the model can reference naturally in outreach.">
        <Textarea
          rows={3}
          placeholder="e.g. 8 years in data engineering before moving to sales. Built pipelines at Stripe and Plaid. Sold to CTOs and VPs of Engineering at Series B–public companies."
          value={repBackground}
          onChange={e => setBackground(e.target.value)}
          className="text-[12px] resize-y"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-surface)' }}
        />
      </Section>

      {/* ── 2. Voice samples ── */}
      <Section
        title="Voice samples"
        hint="Paste 2–5 of your best-performing emails or LinkedIn messages. The assistant will match your sentence length, how you open, how you close, and what you don't say. More samples = better calibration. These are never shared or used for training."
        required
      >
        <Textarea
          rows={8}
          placeholder="Paste your best emails or LinkedIn messages here…"
          value={voiceSamples}
          onChange={e => setVoice(e.target.value)}
          className="text-[12px] resize-y"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-surface)' }}
        />
      </Section>

      {/* ── 3. ICP ── */}
      <Section title="Ideal customer profile" hint="Who you're trying to reach. Used to filter and prioritize research.">
        <Textarea
          rows={3}
          placeholder="e.g. Series B+ data infrastructure companies, 200–2,000 employees, VP or above economic buyer, Snowflake or dbt in the stack, US-based."
          value={icp}
          onChange={e => setIcp(e.target.value)}
          className="text-[12px] resize-y"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-surface)' }}
        />
      </Section>

      {/* ── 4. Targeting ── */}
      <div className="flex flex-col gap-4 rounded-[10px] px-5 py-5" style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>Targeting</h2>
            <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--sl-text3)' }}>
              Seniority and function rules used to tier decision makers on every research run.
              Shared across the team.{' '}
              {!profile?.is_admin && <span style={{ color: 'var(--sl-amber-t)' }}>Admin-only to edit.</span>}
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
              {savingTargeting ? 'Saving…' : 'Save targeting'}
            </button>
          )}
        </div>

        {/* Seniority bands */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--sl-text2)' }}>Target seniority bands</p>
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
                placeholder="Add custom band…"
                className="rounded-[6px] px-2.5 py-1 text-[11px] outline-none flex-1"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
              />
              <button
                type="submit"
                className="text-[11px] px-2.5 py-1 rounded-[6px]"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface2)', color: 'var(--sl-text2)' }}
              >
                Add
              </button>
            </form>
          )}
        </div>

        {/* Target functions */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--sl-text2)' }}>Target functions</p>
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
                placeholder="Add custom function…"
                className="rounded-[6px] px-2.5 py-1 text-[11px] outline-none flex-1"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
              />
              <button
                type="submit"
                className="text-[11px] px-2.5 py-1 rounded-[6px]"
                style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface2)', color: 'var(--sl-text2)' }}
              >
                Add
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── 5. Anthropic API key ── */}
      <Section
        title="Anthropic API key"
        hint="Required to run research and email generation. Get yours at console.anthropic.com. Stored securely — never shown again after saving."
        required
      >
        <div className="flex flex-col gap-2">
          {hasApiKey && !apiKey && (
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full self-start"
              style={{ background: 'var(--sl-green-bg)', color: 'var(--sl-green-t)' }}
            >
              <span className="rounded-full inline-block" style={{ width: 6, height: 6, background: 'var(--sl-green-t)' }} />
              API key configured
            </div>
          )}
          <input
            type="password"
            autoComplete="off"
            placeholder={hasApiKey ? 'Enter new key to replace existing…' : 'sk-ant-…'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="rounded-[6px] px-3 py-2 text-[12px] outline-none font-mono"
            style={{ borderColor: 'var(--sl-border)', border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
          />
          <p className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
            Leave blank to keep your current key. Your key is used only server-side and never logged.
          </p>
        </div>
      </Section>

      {/* ── 6. Products (read-only — managed by admin) ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>Products</h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--sl-text3)' }}>
              All products are used in every research call. Managed by your admin.
            </p>
          </div>
          {profile?.is_admin && (
            <Link
              href="/admin/products"
              className="text-[11px] px-3 py-1.5 rounded-[6px] font-medium"
              style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-surface)', color: 'var(--sl-text)' }}
            >
              Manage products →
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <div
            className="rounded-[10px] px-5 py-4 text-[12px]"
            style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)', color: 'var(--sl-text3)' }}
          >
            No products configured yet.{' '}
            {profile?.is_admin
              ? <Link href="/admin/products" style={{ color: 'var(--sl-text2)' }}>Add one →</Link>
              : 'Ask your admin to add products before running research.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {products.map(product => (
              <div
                key={product.id}
                className="rounded-[10px] px-5 py-4 flex flex-col gap-1"
                style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
              >
                <div className="text-[12px] font-semibold" style={{ color: 'var(--sl-text)' }}>
                  {product.name}
                </div>
                {product.description && (
                  <div className="text-[11px] leading-relaxed" style={{ color: 'var(--sl-text3)' }}>
                    {product.description}
                  </div>
                )}
                <div className="flex gap-4 mt-1">
                  {product.value_props && (
                    <div className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
                      <span style={{ color: 'var(--sl-text2)' }}>Value props:</span> {product.value_props}
                    </div>
                  )}
                  {product.competitors && (
                    <div className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
                      <span style={{ color: 'var(--sl-text2)' }}>Competes with:</span> {product.competitors}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <p className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
          Changes take effect on the next research or follow-up generation.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-[6px] px-4 py-2 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          style={{ background: 'var(--sl-text)', color: '#F0EDE6', border: 'none' }}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
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
