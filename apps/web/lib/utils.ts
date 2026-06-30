import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { DmRole } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = PRICING[model] ?? PRICING['claude-sonnet-4-6']
  return prices.input * inputTokens + prices.output * outputTokens
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

// ─────────────────────────────────────────
// Robust JSON extraction from an LLM text response
// ─────────────────────────────────────────
// Returns the first COMPLETE, balanced JSON object in `text` (or null if none).
// Scans from the first '{' tracking brace depth while respecting string literals
// and escapes, so it tolerates anything the model wraps around the object:
// markdown fences, a leading preamble, and — crucially — trailing commentary that
// itself contains braces. The old `slice(indexOf('{'), lastIndexOf('}'))` approach
// broke exactly there: a translated closing remark with a '}' extended the slice
// past the real object and JSON.parse threw. This surfaced once generation went
// multi-language (the language directive invites such commentary).
export function extractJsonObject(text: string | null | undefined): string | null {
  if (!text) return null
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null // unbalanced — no complete object found
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
    let target = new Date(`${fyEnd} ${year}`)
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
