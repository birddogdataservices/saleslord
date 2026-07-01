// POST /api/refresh-email
// Regenerates the email draft for an existing prospect brief.
// Uses the already-researched brief as context — no web search, no re-research.
// Cheap call: ~1–2k tokens vs ~20–30k for full research.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost, extractJsonObject } from '@/lib/utils'
import { EMAIL_RULES } from '@/lib/prompts'
import { withJob } from '@/lib/jobs'
import { languageDirective, JSON_LANGUAGE_RULE, resolveProspectLanguage } from '@/lib/i18n/languages'
import { reEmitAsStructuredJson } from '@/lib/structured-output'
import {
  loadProspectContext,
  getUserAnthropicKey,
  resolveProducts,
  buildProductsBlock,
} from '@/lib/prospect-context'

// Haiku is sufficient for email drafting — the context is already structured,
// the output is short and constrained. 4× cheaper than Sonnet, noticeably faster.
// Email refresh is excluded from the daily call limit (it doesn't count against research budget).
const MODEL = 'claude-haiku-4-5'

// Job-tracked: withJob records this run in the jobs table (sidebar Jobs section).
export async function POST(request: Request) {
  return withJob(request, run, {
    kind: 'email_draft',
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

  // 2. No rate limit check — email refresh runs on Haiku and is intentionally excluded
  // from the daily call limit so reps can iterate freely without burning research budget.

  // 3. Parse body
  const { prospect_id, product_id, languageSelection } = await request.json() as {
    prospect_id?: string
    product_id?: string         // optional — if provided, focus email on this product only
    languageSelection?: string  // optional — a supported code, or the "Profile default" sentinel
  }
  if (!prospect_id) return Response.json({ error: 'prospect_id is required' }, { status: 400 })

  // 4. Load prospect + brief + profile + products (shared loader, ownership-checked),
  // plus the most recent update blurb (refresh-email only — freshens the context).
  const [loaded, latestUpdateRes] = await Promise.all([
    loadProspectContext(adminClient, prospect_id, user.id),
    adminClient.from('prospect_updates').select('summary, news_items, created_at')
      .eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status })

  const { prospect, brief, profile, allProducts } = loaded.value
  const latestUpdate = latestUpdateRes.data ?? null

  // BYOK hard gate — decrypt stored key; no platform fallback
  const key = getUserAnthropicKey(profile)
  if (!key.ok) return Response.json({ error: key.error }, { status: key.status })
  const userApiKey = key.value

  // 5. Build a focused prompt — brief context + email rules only, no web search.
  // If a specific product_id was requested, focus on it; else let the model pick.
  const { active: activeProducts, focused } = resolveProducts(allProducts, product_id)
  const productsBlock = buildProductsBlock(activeProducts, focused)

  // Prospect-facing (the email is read by the prospect) → an explicit selection
  // wins and sticks; else the prospect's stored override; else the rep's locale.
  const { lang, overrideWrite } = resolveProspectLanguage({
    selection:      languageSelection,
    storedOverride: prospect.output_language_override,
    profileLocale:  profile?.locale,
  })

  const systemPrompt = `You are a B2B sales email writer. Your only job is to write one cold outreach email.

Rep context:
${productsBlock}
- Rep background: ${profile?.rep_background ?? 'not provided'}
${profile?.voice_samples
  ? `- Rep voice samples — match this style exactly:\n${profile.voice_samples}`
  : '- Voice samples: not provided. Write in a clear, direct, human voice.'}

${EMAIL_RULES}

${languageDirective(lang)}
${JSON_LANGUAGE_RULE}

Return ONLY valid JSON, no markdown, no preamble:
{"subject": "string", "body": "string"}`

  // Include most recent update blurb if available — this is the freshest intel on the prospect
  const latestUpdateContext = latestUpdate
    ? `\nLatest update (${new Date(latestUpdate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}): ${latestUpdate.summary}`
    : ''

  const companyContext = `Company: ${prospect.name}
Snapshot: ${brief.snapshot ?? 'not available'}
Strategic initiatives: ${(brief.initiatives ?? []).join('; ') || 'none'}
Pain signals: ${(brief.pain_signals ?? []).join('; ') || 'none'}
Outreach angle: ${brief.outreach_angle ?? 'not available'}
Recent news: ${(brief.news ?? []).slice(0, 3).map((n: any) => `${n.date}: ${n.text}`).join(' | ') || 'none'}
Tech signals: ${(brief.tech_signals ?? []).join(', ') || 'none'}${latestUpdateContext}`

  // 6. Generate — no tools, text only
  const client   = new Anthropic({ apiKey: userApiKey })
  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 512,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: `Write a cold outreach email for this prospect:\n\n${companyContext}` }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No response from AI' }, { status: 500 })
  }

  let inputTokens  = response.usage.input_tokens
  let outputTokens = response.usage.output_tokens

  // 7. Parse JSON
  let email: { subject: string; body: string }
  try {
    const json = extractJsonObject(textBlock.text)
    if (!json) throw new Error('No JSON found')
    email = JSON.parse(json)
  } catch {
    // Fallback: re-emit via tool use when multi-language output is malformed JSON.
    try {
      const r = await reEmitAsStructuredJson(client, MODEL, systemPrompt, textBlock.text, 512)
      email = r.value as typeof email
      inputTokens  += r.inputTokens
      outputTokens += r.outputTokens
    } catch {
      console.error('[refresh-email] Failed to parse JSON (incl. structured retry):', textBlock.text.slice(0, 300))
      return Response.json({ error: 'Failed to parse email response' }, { status: 500 })
    }
  }

  // 8. Update brief with new email
  await adminClient
    .from('prospect_briefs')
    .update({ email })
    .eq('id', brief.id)

  // Sticky language: persist an explicit choice (or clear it on "Profile default").
  // undefined = no concrete selection → leave the column untouched.
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
    endpoint:      'email',
    model:         MODEL,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    cost_usd:      cost,
  })

  return Response.json({ email, cost_usd: cost })
}
