// Composite scoring for CELord prospects — @saleslord/signals.
// Pure function, no I/O, no Supabase imports.

import type { SignalSource } from '@saleslord/core'
import type { RawSignal } from './collectors/types'

export type ScoredOrg = {
  orgHint: string
  domain: string | null
  country: string | null
  stateProvince: string | null
  signals: RawSignal[]
  score: number     // 0–100
  dimensions: {
    usageConfidence: number   // 0–1: how certain is CE usage
    scale: number             // 0–1: proxy for org size/impact
    riskPosture: number       // 0–1: security/compliance pressure
    reachability: number      // 0–1: signals suggest warm entry points
  }
  topSource: SignalSource
}

// Base confidence by signal source.
const SOURCE_CONFIDENCE: Record<SignalSource, number> = {
  github:        0.85,  // committed .ktr/.kjb = strong
  docker:        0.85,  // published Pentaho image with real pulls = strong
  forum:         0.80,  // community post = strong
  jobs:          0.70,  // job posting = probable
  stackoverflow: 0.60,  // question = possible
  conference:    0.50,  // talk mention = possible
}

// Keywords that raise the risk posture score.
const HIGH_RISK_KEYWORDS = [
  'health', 'hospital', 'medical', 'clinic', 'insurance', 'bank',
  'federal', 'county', 'state', 'city', 'government', 'energy',
  'electric', 'utility', 'hydro', 'authority',
]

// Keywords that raise the scale score (large org indicators).
const LARGE_ORG_KEYWORDS = [
  'county', 'city', 'state', 'federal', 'health', 'hospital',
  'insurance', 'energy', 'electric', 'hydro', 'university',
]

function usageConfidence(signals: RawSignal[]): number {
  if (signals.length === 0) return 0
  const max = Math.max(...signals.map(s => SOURCE_CONFIDENCE[s.source]))
  // Each additional signal beyond the first adds a small boost (capped at 1.0).
  const multiSignalBoost = Math.min(0.1, (signals.length - 1) * 0.03)
  return Math.min(1.0, max + multiSignalBoost)
}

function scaleScore(orgHint: string, signals: RawSignal[]): number {
  const hint = orgHint.toLowerCase()
  const hasLargeOrgKeyword = LARGE_ORG_KEYWORDS.some(k => hint.includes(k))
  if (hasLargeOrgKeyword) return 0.85
  // Use signal count as a weak size proxy — more signals → more likely a real org.
  if (signals.length >= 3) return 0.65
  if (signals.length === 2) return 0.55
  return 0.45
}

function riskPostureScore(orgHint: string): number {
  const hint = orgHint.toLowerCase()
  const isHighRisk = HIGH_RISK_KEYWORDS.some(k => hint.includes(k))
  return isHighRisk ? 0.85 : 0.50
}

function reachabilityScore(signals: RawSignal[]): number {
  const sources = new Set(signals.map(s => s.source))
  // Job postings: org is actively hiring, someone specific can be targeted.
  if (sources.has('jobs')) return 0.85
  // Forum/conference: named individuals available as warm contacts.
  if (sources.has('forum') || sources.has('conference')) return 0.70
  // GitHub: repo owner(s) are identifiable.
  if (sources.has('github')) return 0.60
  return 0.35
}

export function scoreOrg(orgHint: string, signals: RawSignal[]): ScoredOrg {
  const domain = signals.find(s => s.org_domain)?.org_domain ?? null
  const country = signals.find(s => s.country)?.country ?? null
  const stateProvince = signals.find(s => s.state_province)?.state_province ?? null
  const topSource = signals.sort(
    (a, b) => SOURCE_CONFIDENCE[b.source] - SOURCE_CONFIDENCE[a.source]
  )[0].source

  const dims = {
    usageConfidence: usageConfidence(signals),
    scale:           scaleScore(orgHint, signals),
    riskPosture:     riskPostureScore(orgHint),
    reachability:    reachabilityScore(signals),
  }

  const raw =
    dims.usageConfidence * 0.35 +
    dims.scale           * 0.25 +
    dims.riskPosture     * 0.25 +
    dims.reachability    * 0.15

  return {
    orgHint,
    domain,
    country,
    stateProvince,
    signals,
    score: Math.round(raw * 100),
    dimensions: dims,
    topSource,
  }
}

// Group raw signals by org_hint (stub entity resolution — real resolution in Session 3).
export function groupAndScore(signals: RawSignal[]): ScoredOrg[] {
  const groups = new Map<string, RawSignal[]>()

  for (const signal of signals) {
    // Normalize org_hint: trim, lowercase for grouping key, keep original for display.
    const key = signal.org_hint.trim().toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(signal)
  }

  const scored = Array.from(groups.entries()).map(([, sigs]) =>
    scoreOrg(sigs[0].org_hint, sigs)
  )

  return scored.sort((a, b) => b.score - a.score)
}
