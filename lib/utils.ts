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
    input:  3.00  / 1_000_000,
    output: 15.00 / 1_000_000,
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
export function windowStatusLabel(status: 'open' | 'approaching' | 'closed' | null): string {
  if (!status) return 'Unknown'
  return { open: 'Buy window open', approaching: 'Approaching', closed: 'Monitoring' }[status]
}

export function windowStatusColor(status: 'open' | 'approaching' | 'closed' | null) {
  if (status === 'open')        return { dot: '#52A830', pill: 'bg-[#E8F4DE] text-[#2A6010]' }
  if (status === 'approaching') return { dot: '#D99520', pill: 'bg-[#FDF3DC] text-[#7A4E08]' }
  return                               { dot: '#C04028', pill: 'bg-[#FAECE7] text-[#7A2E14]' }
}
