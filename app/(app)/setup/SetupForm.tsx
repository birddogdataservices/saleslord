'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import type { RepProfile, Product } from '@/lib/types'

type Props = {
  profile: RepProfile | null
  products: Product[]
}

function voiceStatus(samples: string) {
  if (!samples || samples.trim().length < 80) return 'uncalibrated'
  return 'calibrated'
}

export default function SetupForm({ profile, products }: Props) {
  const supabase = createClient()

  const [repBackground, setBackground] = useState(profile?.rep_background ?? '')
  const [voiceSamples,  setVoice]      = useState(profile?.voice_samples  ?? '')
  const [icp,           setIcp]        = useState(profile?.icp_description ?? '')
  const [saving, setSaving] = useState(false)

  const status = voiceStatus(voiceSamples)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Not authenticated.'); setSaving(false); return }

    const { error } = await supabase
      .from('rep_profiles')
      .upsert({
        user_id:         user.id,
        rep_background:  repBackground,
        voice_samples:   voiceSamples,
        icp_description: icp,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id' })

    setSaving(false)
    if (error) toast.error('Failed to save profile.')
    else       toast.success('Profile saved.')
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

      {/* ── 4. Products (read-only — managed by admin) ── */}
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
