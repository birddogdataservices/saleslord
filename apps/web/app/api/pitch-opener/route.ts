// POST /api/pitch-opener
// Generates a single opener paragraph the rep drops into the top of their own
// email — NOT a full email. Driven by ONE rep-chosen product: the model selects
// the best-fit, non-vacuous signal from the brief and maps the product's
// value-prop to the pain it implies. Persona and compelling event are optional
// overrides — supply an event to force the anchor, a persona to target a role.
// Uses the already-researched brief as context — no web search, no re-research.
// Result is NOT persisted to the brief: it's a composable building block the rep
// copies, not the canonical first touch. Cheap call: ~1k tokens.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost, extractJsonObject } from '@/lib/utils'
import { PITCH_OPENER_RULES } from '@/lib/prompts'
import { withJob } from '@/lib/jobs'
import { languageDirective, JSON_LANGUAGE_RULE, resolveProspectLanguage } from '@/lib/i18n/languages'
import { reEmitAsStructuredJson } from '@/lib/structured-output'
import {
  loadProspectContext,
  getUserAnthropicKey,
  resolveProducts,
  buildProductsBlock,
} from '@/lib/prospect-context'

// Haiku is sufficient — context is structured, output is short and constrained.
// Like email refresh, the opener is excluded from the daily call limit so reps
// can iterate freely across personas/events without burning research budget.
const MODEL = 'claude-haiku-4-5'

// Job-tracked: withJob records this run in the jobs table (sidebar Jobs section).
export async function POST(request: Request) {
  return withJob(request, run, {
    kind: 'pitch_opener',
    adminClient: createAdminClient(),
    getContext: body => ({ prospectId: body?.prospect_id ?? null }),
  })
}

async function run(request: Request): Promise<Response> {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. No rate limit check — same rationale as email refresh (Haiku, cheap, iterative).

  // 3. Parse body
  const { prospect_id, product_id, persona, compelling_event, languageSelection } = await request.json() as {
    prospect_id?: string
    product_id?: string        // the product to pitch — drives signal selection
    persona?: string           // optional — the role/persona to address (DM or free text)
    compelling_event?: string  // optional — a specific trigger to anchor on; if absent the model picks the best-fit brief signal
    languageSelection?: string // optional — a supported code, or the "Profile default" sentinel
  }
  if (!prospect_id) return Response.json({ error: 'prospect_id is required' }, { status: 400 })

  // 4. Load prospect + brief + profile + products (shared loader, ownership-checked)
  const loaded = await loadProspectContext(adminClient, prospect_id, user.id)
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status })
  const { prospect, brief, profile, allProducts } = loaded.value

  // BYOK hard gate — decrypt stored key; no platform fallback
  const key = getUserAnthropicKey(profile)
  if (!key.ok) return Response.json({ error: key.error }, { status: key.status })
  const userApiKey = key.value

  // 5. Build the prompt — brief context for grounding + the rep's explicit choices
  const { active: activeProducts, focused } = resolveProducts(allProducts, product_id)
  const productsBlock = buildProductsBlock(activeProducts, focused)

  // Prospect-facing (the opener goes into an email to the prospect) → explicit
  // selection wins and sticks; else stored override; else the rep's locale.
  const { lang, overrideWrite } = resolveProspectLanguage({
    selection:      languageSelection,
    storedOverride: prospect.output_language_override,
    profileLocale:  profile?.locale,
  })

  const systemPrompt = `You are a B2B sales writer. Your only job is to write one opening paragraph the rep will paste into the top of an email they finish themselves.

Rep context:
${productsBlock}
- Rep background: ${profile?.rep_background ?? 'not provided'}
${profile?.voice_samples
  ? `- Rep voice samples — match this style exactly:\n${profile.voice_samples}`
  : '- Voice samples: not provided. Write in a clear, direct, human voice.'}

${PITCH_OPENER_RULES}

${languageDirective(lang)}
${JSON_LANGUAGE_RULE}

Return ONLY valid JSON, no markdown, no preamble:
{"paragraph": "string"}`

  // Brief context. When the rep names an event, it is the anchor. When they
  // don't, the candidate signals below are the model's menu — it picks the one
  // that best fits the chosen product (per PITCH_OPENER_RULES).
  const trimmedPersona = persona?.trim()
  const trimmedEvent   = compelling_event?.trim()
  const newsText       = (brief.news ?? []).map((n: { text: string }) => n.text)

  const companyContext = `Company: ${prospect.name}
${trimmedPersona
  ? `Persona to address: ${trimmedPersona}`
  : 'Persona: none specified — speak to the company\'s need, do not invent a role.'}
${trimmedEvent
  ? `Compelling event to anchor on (build the paragraph around THIS): ${trimmedEvent}`
  : 'No specific event chosen — select the single best-fit signal for the product from the candidate signals below.'}

Candidate signals from the brief (choose the most product-relevant, concrete one; ignore vacuous ones):
Strategic initiatives: ${(brief.initiatives ?? []).join('; ') || 'none'}
Pain signals: ${(brief.pain_signals ?? []).join('; ') || 'none'}
Recent news: ${newsText.join('; ') || 'none'}

Grounding (do not introduce triggers not present above):
Snapshot: ${brief.snapshot ?? 'not available'}
Tech signals: ${(brief.tech_signals ?? []).join(', ') || 'none'}`

  // 6. Generate — no tools, text only
  const client   = new Anthropic({ apiKey: userApiKey })
  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 400,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: `Write the opener paragraph:\n\n${companyContext}` }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No response from AI' }, { status: 500 })
  }

  let inputTokens  = response.usage.input_tokens
  let outputTokens = response.usage.output_tokens

  // 7. Parse JSON
  let paragraph: string
  try {
    const json = extractJsonObject(textBlock.text)
    if (!json) throw new Error('No JSON found')
    const parsed = JSON.parse(json) as { paragraph?: string }
    if (!parsed.paragraph?.trim()) throw new Error('No paragraph in response')
    paragraph = parsed.paragraph.trim()
  } catch {
    // Fallback: re-emit via tool use when multi-language output is malformed JSON.
    try {
      const r = await reEmitAsStructuredJson(client, MODEL, systemPrompt, textBlock.text, 400)
      const p = (r.value as { paragraph?: string }).paragraph?.trim()
      if (!p) throw new Error('No paragraph in structured response')
      paragraph = p
      inputTokens  += r.inputTokens
      outputTokens += r.outputTokens
    } catch {
      console.error('[pitch-opener] Failed to parse JSON (incl. structured retry):', textBlock.text.slice(0, 300))
      return Response.json({ error: 'Failed to parse opener response' }, { status: 500 })
    }
  }

  // 8. The opener itself is NOT persisted — it's a composable draft, not the
  // brief's first touch. The LANGUAGE choice IS sticky to the prospect, though:
  // persist an explicit choice (or clear it on "Profile default").
  if (overrideWrite !== undefined) {
    await adminClient
      .from('prospects')
      .update({ output_language_override: overrideWrite })
      .eq('id', prospect_id)
  }

  // 9. Log cost
  const cost = calculateCost(MODEL, inputTokens, outputTokens)
  await adminClient.from('api_usage').insert({
    user_id:       user.id,
    prospect_id,
    endpoint:      'pitch-opener',
    model:         MODEL,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    cost_usd:      cost,
  })

  return Response.json({ paragraph, cost_usd: cost })
}
