// CELord enrichment — Haiku 4.5 pass per org.
// Determines: billing_hq, org_type, industry, approx_size, confidence.
// Writes results to enrichment_runs + upserts billing_hq location row.
//
// No Supabase imports — client passed as dependency (package-in-waiting discipline).

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrgType } from '@/core/types'

const MODEL = 'claude-haiku-4-5-20251001'

type SignalContext = {
  source: string
  snippet: string
  country: string | null
  state_province: string | null
}

export type EnrichmentInput = {
  orgId: string
  orgName: string
  domain: string | null
  signals: SignalContext[]
}

type EnrichmentOutput = {
  billing_hq_country: string | null
  billing_hq_state: string | null
  billing_hq_city: string | null
  org_type: OrgType
  industry: string | null
  approx_size: 'Enterprise' | 'Mid-market' | 'SMB' | 'unknown' | null
  parent_org_name: string | null
  confidence: number
}

// ─────────────────────────────────────────
// Anthropic client (singleton)
// ─────────────────────────────────────────

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

// ─────────────────────────────────────────
// LLM call
// ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at identifying organizations that use Pentaho Data Integration Community Edition.

Given an organization name, optional domain, and signals, determine:
1. billing_hq_country — ISO 3166-1 alpha-2 code (e.g. "US", "CA", "GB"). null if unknown.
2. billing_hq_state — state or province abbreviation (e.g. "IL", "ON"). null if unknown or not applicable.
3. billing_hq_city — city name. null if unknown.
4. org_type — one of: "end_user" (uses Pentaho internally), "integrator" (builds solutions for clients), "vendor" (sells data products), "training_provider" (teaches Pentaho), "unknown".
5. industry — short industry label, e.g. "Healthcare", "Financial Services", "Government", "Energy", "Education", "Retail", "Manufacturing", "Telecommunications", "Insurance", "Transportation", "Non-profit". null if unknown.
6. approx_size — one of: "Enterprise" (>1000 employees or >$250M revenue), "Mid-market" (100–1000 employees or $10M–$250M revenue), "SMB" (<100 employees or <$10M revenue), "unknown".
7. parent_org_name — parent org name if this is a subsidiary. null otherwise.
8. confidence — float 0.00–1.00 for billing_hq confidence.

Rules:
- Prefer legal/registered HQ over signal origin locations.
- Government/public sector orgs are almost always "end_user".
- Consulting firms that implement Pentaho for clients are "integrator".
- County/city/state government orgs are typically "Mid-market" to "Enterprise".
- Universities are typically "Enterprise".
- For industry, prefer specificity over generality (e.g. "Healthcare" over "Services").
- approx_size is a best guess — use org name, domain, and signal context as clues.
- Return ONLY valid JSON, no explanation.`

function buildUserPrompt(input: EnrichmentInput): string {
  const signalLines = input.signals
    .slice(0, 8)
    .map((s, i) =>
      `Signal ${i + 1} [${s.source}]: ${s.snippet.slice(0, 200)}` +
      (s.country ? ` | location: ${[s.state_province, s.country].filter(Boolean).join(', ')}` : '')
    )
    .join('\n')

  return `Organization: ${input.orgName}
Domain: ${input.domain ?? 'unknown'}

Signals:
${signalLines}

Respond with JSON only:
{
  "billing_hq_country": string | null,
  "billing_hq_state": string | null,
  "billing_hq_city": string | null,
  "org_type": "end_user" | "integrator" | "vendor" | "training_provider" | "unknown",
  "industry": string | null,
  "approx_size": "Enterprise" | "Mid-market" | "SMB" | "unknown",
  "parent_org_name": string | null,
  "confidence": number
}`
}

const VALID_SIZES = new Set(['Enterprise', 'Mid-market', 'SMB', 'unknown'])

function parseResponse(text: string): EnrichmentOutput {
  try {
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    if (!json) throw new Error('no JSON found')
    const parsed = JSON.parse(json)
    return {
      billing_hq_country: parsed.billing_hq_country ?? null,
      billing_hq_state:   parsed.billing_hq_state ?? null,
      billing_hq_city:    parsed.billing_hq_city ?? null,
      org_type:           parsed.org_type ?? 'unknown',
      industry:           parsed.industry ?? null,
      approx_size:        VALID_SIZES.has(parsed.approx_size) ? parsed.approx_size : 'unknown',
      parent_org_name:    parsed.parent_org_name ?? null,
      confidence:         typeof parsed.confidence === 'number' ? parsed.confidence : 0.50,
    }
  } catch {
    return {
      billing_hq_country: null,
      billing_hq_state:   null,
      billing_hq_city:    null,
      org_type:           'unknown',
      industry:           null,
      approx_size:        'unknown',
      parent_org_name:    null,
      confidence:         0.10,
    }
  }
}

// ─────────────────────────────────────────
// Enrich one org — returns token usage
// ─────────────────────────────────────────

export type EnrichOneResult = {
  output: EnrichmentOutput
  inputTokens: number
  outputTokens: number
}

export async function enrichOrg(input: EnrichmentInput): Promise<EnrichOneResult> {
  const anthropic = getClient()
  const MAX_ATTEMPTS = 3

  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(input) }],
      })

      const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
      return {
        output: parseResponse(text),
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      }
    } catch (err: unknown) {
      lastErr = err
      const status = (err as { status?: number })?.status
      const retryable = status === 429 || status === 529 || status === 402
      if (!retryable || attempt === MAX_ATTEMPTS - 1) throw err
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1))) // 2s, 4s
    }
  }

  throw lastErr
}

// ─────────────────────────────────────────
// Persist enrichment result to DB
// ─────────────────────────────────────────

export async function persistEnrichment(
  orgId: string,
  result: EnrichmentOutput,
  dbClient: SupabaseClient,
): Promise<void> {
  await dbClient.from('enrichment_runs').insert({
    org_id:             orgId,
    model:              MODEL,
    billing_hq_country: result.billing_hq_country,
    billing_hq_state:   result.billing_hq_state,
    billing_hq_city:    result.billing_hq_city,
    org_type:           result.org_type,
    industry:           result.industry,
    approx_size:        result.approx_size,
    parent_org_name:    result.parent_org_name,
    confidence:         result.confidence,
  })

  // Update org row with enriched fields
  await dbClient
    .from('organizations')
    .update({
      org_type:    result.org_type,
      industry:    result.industry,
      approx_size: result.approx_size,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', orgId)

  if (result.billing_hq_country) {
    await dbClient.from('locations').delete().eq('org_id', orgId).eq('label', 'billing_hq')
    await dbClient.from('locations').insert({
      org_id:         orgId,
      label:          'billing_hq',
      country:        result.billing_hq_country,
      state_province: result.billing_hq_state ?? null,
      city:           result.billing_hq_city ?? null,
    })
  }
}
