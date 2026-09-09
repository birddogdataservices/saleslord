import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DmRole, TargetingTier } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─────────────────────────────────────────
// Email validation
// ─────────────────────────────────────────
// Deliberately permissive — the goal is catching typos and garbage before we
// write them to the allowlist and fire mail at them, not implementing RFC 5322.
// The matching CHECK constraint on allowed_emails.email uses the same shape.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed)
}

// ─────────────────────────────────────────
// Anthropic pricing — update when model pricing changes
// Prices in USD per token
// ─────────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': {
    input:  3.00 / 1_000_000,
    output: 15.00 / 1_000_000,
  },
  // Not yet used by any route — listed so that switching a route's MODEL is a
  // one-word change that prices correctly, instead of silently falling through
  // to the fallback below and over-reporting by 50%.
  'claude-sonnet-5': {
    input:  2.00 / 1_000_000,
    output: 10.00 / 1_000_000,
  },
  'claude-haiku-4-5': {
    input:  1.00 / 1_000_000,
    output: 5.00 / 1_000_000,
  },
  // Retired Feb 2026 — kept so historical api_usage cost lookups still resolve.
  'claude-haiku-3-5': {
    input:  0.80 / 1_000_000,
    output: 4.00 / 1_000_000,
  },
}

// Pricing is per model family, but callers sometimes pass a dated snapshot ID
// (e.g. 'claude-haiku-4-5-20251001'). Strip a trailing -YYYYMMDD so every
// snapshot resolves to its family's rate. Without this, dated IDs missed the
// map entirely and fell through to the fallback below — logging Haiku calls at
// Sonnet prices, ~3x the real cost.
function normalizeModelId(model: string): string {
  return model.replace(/-\d{8}$/, '')
}

// Most expensive known model — an unknown ID should over-report, never
// under-report, so cost surprises surface instead of hiding.
const FALLBACK_MODEL = 'claude-sonnet-4-6'

// Prompt-caching multipliers against the model's base input rate. Writing a
// 5-minute ephemeral cache entry costs a premium; reading one is nearly free.
const CACHE_WRITE_MULTIPLIER = 1.25
const CACHE_READ_MULTIPLIER  = 0.10

// inputTokens is the uncached input only — usage.input_tokens already excludes
// whatever was served from or written to cache, so the three are added
// separately at their own rates. Cache args default to 0, so uncached callers
// are unaffected.
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens  = 0,
  cacheWriteTokens = 0,
): number {
  let prices = PRICING[normalizeModelId(model)]
  if (!prices) {
    console.warn(`[calculateCost] Unknown model "${model}" — billing at ${FALLBACK_MODEL} rates. Add it to PRICING.`)
    prices = PRICING[FALLBACK_MODEL]
  }
  return (
    prices.input  * inputTokens +
    prices.output * outputTokens +
    prices.input  * CACHE_READ_MULTIPLIER  * cacheReadTokens +
    prices.input  * CACHE_WRITE_MULTIPLIER * cacheWriteTokens
  )
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

// ─────────────────────────────────────────
// Decision maker role colors
// ─────────────────────────────────────────
export const ROLE_COLORS: Record<DmRole, { bg: string; text: string }> = {
  champion:       { bg: '#E1F5EE', text: '#085041' },
  economic_buyer: { bg: '#E6F1FB', text: '#0C447C' },
  gatekeeper:     { bg: '#FAECE7', text: '#712B13' },
  end_user:       { bg: '#EEEDFE', text: '#3C3489' },
  influencer:     { bg: '#FAEEDA', text: '#633806' },
  custom:         { bg: '#F0EEE9', text: '#6B6A64' },
}

export const ROLE_LABELS: Record<DmRole, string> = {
  champion:       'Champion',
  economic_buyer: 'Economic buyer',
  gatekeeper:     'Gatekeeper',
  end_user:       'End user',
  influencer:     'Influencer',
  custom:         'Custom',
}

// ─────────────────────────────────────────
// Targeting tiers
// ─────────────────────────────────────────
// The research prompt assigns each decision maker a tier by matching them
// against the team's seniority bands and target functions (team_config), and
// explains the call in tier_reasoning. This is the rep's answer to "who do I
// actually contact here" — surface it, don't just sort by it.

export const TIER_LABELS: Record<TargetingTier, string> = {
  prime_target: 'Prime target',
  intel_only:   'Intel only',
  low_signal:   'Low signal',
}

// Literal hex, not CSS variables: BriefPdf renders through @react-pdf/renderer,
// which cannot resolve var(). Same reason ROLE_COLORS above is literal — one
// definition serving both the screen and the PDF beats two that drift.
// Values mirror the tokens in globals.css: green / blue / surface2 + text2.
export const TIER_COLORS: Record<TargetingTier, { bg: string; text: string }> = {
  prime_target: { bg: '#E8F4DE', text: '#2A6010' },
  intel_only:   { bg: '#E6F1FB', text: '#0C447C' },
  low_signal:   { bg: '#F0EEE9', text: '#6B6A64' },
}

// Sort order: prime targets first, low signal last.
export const TIER_RANK: Record<TargetingTier, number> = {
  prime_target: 0,
  intel_only:   1,
  low_signal:   2,
}

// Rows written before targeting tiers shipped have no value — treat them as
// prime targets rather than burying them at the bottom of the list.
export function tierOf(dm: { targeting_tier: TargetingTier | null }): TargetingTier {
  return dm.targeting_tier ?? 'prime_target'
}

// Prime targets first, then the model's own ordering within each tier. Shared
// by the decision-maker list and the PDF: the export used to order by
// sort_order alone, so a printed brief listed people in a different order than
// the screen the rep was reading it from.
export function sortByTier<T extends { targeting_tier: TargetingTier | null; sort_order: number }>(
  dms: T[],
): T[] {
  return [...dms].sort((a, b) => {
    const diff = TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)]
    return diff !== 0 ? diff : a.sort_order - b.sort_order
  })
}

// ─────────────────────────────────────────
// Timing window helpers
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// Compute window_status live from fy_end string (e.g. "January 31")
// Rather than reading the stored value (which goes stale), we derive it fresh on each render.
// open:       90–150 days before FY end  (budget planning window)
// approaching: 150–210 days before FY end (get on the radar)
// closed:     everything else
// ─────────────────────────────────────────
export function computeWindowStatus(fyEnd: string): 'open' | 'approaching' | 'closed' {
  try {
    const now  = new Date()
    const year = now.getFullYear()
    const target = new Date(`${fyEnd} ${year}`)
    if (isNaN(target.getTime())) return 'closed'
    if (target <= now) target.setFullYear(year + 1)
    const days = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (days >= 90 && days <= 150) return 'open'
    if (days > 150 && days <= 210) return 'approaching'
    return 'closed'
  } catch { return 'closed' }
}

export function windowStatusLabel(status: 'open' | 'approaching' | 'closed' | null): string {
  if (!status) return 'Unknown'
  return { open: 'Buy window open', approaching: 'Approaching', closed: 'Monitoring' }[status]
}

export function windowStatusColor(status: 'open' | 'approaching' | 'closed' | null) {
  if (status === 'open')        return { dot: '#52A830', pill: 'bg-[#E8F4DE] text-[#2A6010]' }
  if (status === 'approaching') return { dot: '#D99520', pill: 'bg-[#FDF3DC] text-[#7A4E08]' }
  return                               { dot: '#C04028', pill: 'bg-[#FAECE7] text-[#7A2E14]' }
}
