// Signal persistence — writes RawSignals to the CELord DB tables.
// Called by cron routes; receives admin Supabase client as a dependency
// (no Supabase imports here — package-in-waiting discipline).
//
// Entity resolution strategy:
//   1. org_domain present → domain exact match → create if new
//   2. No domain → normalized name exact match (strip legal suffixes, lowercase)
//   3. Normalized name match score ≥ 0.80 → fuzzy match
//   4. Ambiguous (0.50–0.79) → Haiku 4.5 LLM decision
//   5. No match → create new org row

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawSignal } from './collectors/types'

export type PersistResult = {
  inserted: number    // new signals written
  skipped: number     // signals already in DB (deduped by source_url)
  orgsCreated: number
}

// ─────────────────────────────────────────
// Org name normalization
// ─────────────────────────────────────────

const LEGAL_SUFFIXES = /\b(inc\.?|incorporated|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|gmbh|ag|sa|s\.a\.|plc|pty|pvt|group|holdings|international|intl|solutions|services|technologies|tech|systems|global)\b\.?/gi
const WHITESPACE_RE = /\s+/g

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(WHITESPACE_RE, ' ')
    .trim()
}

// Jaro-Winkler-like similarity (good enough for org name matching without a dep).
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return 1.0
  if (na.length === 0 || nb.length === 0) return 0.0

  // Token overlap — covers "City of Springfield" vs "Springfield City"
  const tokensA = new Set(na.split(' ').filter(t => t.length > 2))
  const tokensB = new Set(nb.split(' ').filter(t => t.length > 2))
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length
  const union = new Set([...tokensA, ...tokensB]).size
  if (union === 0) return 0.0
  const jaccard = intersection / union

  // Prefix bonus — "Acme" vs "Acme Corp" should score very high
  const shorter = na.length < nb.length ? na : nb
  const longer  = na.length < nb.length ? nb : na
  const prefixBonus = longer.startsWith(shorter) ? 0.15 : 0

  return Math.min(1.0, jaccard + prefixBonus)
}

// ─────────────────────────────────────────
// LLM-assisted disambiguation
// ─────────────────────────────────────────

let anthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

async function llmIsSameOrg(candidateName: string, signalHint: string): Promise<boolean> {
  try {
    const client = getAnthropicClient()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{
        role: 'user',
        content: `Are "${candidateName}" and "${signalHint}" the same organization? Reply only YES or NO.`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim().toUpperCase() : 'NO'
    return text.startsWith('YES')
  } catch {
    // Credit exhaustion or API error — safe fallback: treat as different org (creates a new row).
    // Worse than a duplicate, but the persist loop continues rather than crashing.
    return false
  }
}

// ─────────────────────────────────────────
// Main export
// ─────────────────────────────────────────

export async function persistSignals(
  signals: RawSignal[],
  client: SupabaseClient,
): Promise<PersistResult> {
  let inserted = 0
  let skipped = 0
  let orgsCreated = 0

  // Fetch all existing org names once for fuzzy matching.
  const { data: existingOrgs } = await client
    .from('organizations')
    .select('id, name, domain')

  const orgs: { id: string; name: string; domain: string | null }[] = existingOrgs ?? []

  for (const signal of signals) {
    // ── 1. Dedupe by source_url ──────────────────────────────────
    const { data: existing } = await client
      .from('signals')
      .select('id')
      .eq('source_url', signal.source_url)
      .maybeSingle()

    let signalId: string

    if (existing) {
      skipped++
      signalId = existing.id
    } else {
      const { data: inserted_, error } = await client
        .from('signals')
        .insert({
          source:         signal.source,
          source_url:     signal.source_url,
          snippet:        signal.snippet,
          org_hint:       signal.org_hint,
          org_domain:     signal.org_domain,
          country:        signal.country,
          state_province: signal.state_province,
          signal_date:    signal.signal_date,
          collected_at:   signal.collected_at,
        })
        .select('id')
        .single()

      if (error || !inserted_) continue
      signalId = inserted_.id
      inserted++
    }

    // ── 2. Resolve or create organization ────────────────────────
    const { orgId, created, method } = await resolveOrg(signal, client, orgs)
    if (!orgId) continue
    if (created) {
      orgsCreated++
      orgs.push({ id: orgId, name: signal.org_hint, domain: signal.org_domain ?? null })
    }

    // ── 3. Upsert signal_link ─────────────────────────────────────
    const confidence =
      method === 'domain_exact' ? 0.90 :
      method === 'fuzzy_name'   ? 0.70 :
      method === 'llm_assisted' ? 0.75 : 0.60

    await client
      .from('signal_links')
      .upsert(
        { org_id: orgId, signal_id: signalId, confidence, method },
        { onConflict: 'org_id,signal_id' },
      )
  }

  return { inserted, skipped, orgsCreated }
}

// ─────────────────────────────────────────
// Org resolution
// ─────────────────────────────────────────

type ResolveResult = { orgId: string | null; created: boolean; method: string }

async function resolveOrg(
  signal: RawSignal,
  client: SupabaseClient,
  orgs: { id: string; name: string; domain: string | null }[],
): Promise<ResolveResult> {
  // 1. Domain exact match
  if (signal.org_domain) {
    const domainMatch = orgs.find(o => o.domain === signal.org_domain)
    if (domainMatch) return { orgId: domainMatch.id, created: false, method: 'domain_exact' }

    // New org with domain
    const { data } = await client
      .from('organizations')
      .insert({ name: signal.org_hint, domain: signal.org_domain })
      .select('id')
      .single()
    return { orgId: data?.id ?? null, created: true, method: 'domain_exact' }
  }

  // 2. Normalized name matching against existing orgs
  let bestMatch: { id: string; name: string; score: number } | null = null

  for (const org of orgs) {
    const score = nameSimilarity(org.name, signal.org_hint)
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: org.id, name: org.name, score }
    }
  }

  if (bestMatch) {
    // High confidence fuzzy match
    if (bestMatch.score >= 0.80) {
      return { orgId: bestMatch.id, created: false, method: 'fuzzy_name' }
    }

    // Ambiguous — ask Haiku
    if (bestMatch.score >= 0.50 && process.env.ANTHROPIC_API_KEY) {
      const same = await llmIsSameOrg(bestMatch.name, signal.org_hint)
      if (same) return { orgId: bestMatch.id, created: false, method: 'llm_assisted' }
    }
  }

  // 3. No match — create new org
  const { data } = await client
    .from('organizations')
    .insert({ name: signal.org_hint })
    .select('id')
    .single()
  return { orgId: data?.id ?? null, created: true, method: 'fuzzy_name' }
}
