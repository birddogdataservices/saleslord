// POST /api/pitch-opener
// Generates a single opener paragraph the rep drops into the top of their own
// email — NOT a full email. Anchored on one rep-chosen compelling event, one
// product, and one persona. Uses the already-researched brief as context — no
// web search, no re-research. Result is NOT persisted to the brief: it's a
// composable building block the rep copies, not the canonical first touch.
// Cheap call: ~1k tokens.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils'
import { PITCH_OPENER_RULES } from '@/lib/prompts'
import { withJob } from '@/lib/jobs'
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
  const { prospect_id, product_id, persona, compelling_event } = await request.json() as {
    prospect_id?: string
    product_id?: string        // optional — focus the opener on this product
    persona?: string           // required — the role/persona to address (DM or free text)
    compelling_event?: string  // required — the one trigger to anchor on (brief signal or free text)
  }
  if (!prospect_id)                  return Response.json({ error: 'prospect_id is required' }, { status: 400 })
  if (!persona?.trim())             return Response.json({ error: 'A persona is required' }, { status: 400 })
  if (!compelling_event?.trim())    return Response.json({ error: 'A compelling event is required' }, { status: 400 })

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

  const systemPrompt = `You are a B2B sales writer. Your only job is to write one opening paragraph the rep will paste into the top of an email they finish themselves.

Rep context:
${productsBlock}
- Rep background: ${profile?.rep_background ?? 'not provided'}
${profile?.voice_samples
  ? `- Rep voice samples — match this style exactly:\n${profile.voice_samples}`
  : '- Voice samples: not provided. Write in a clear, direct, human voice.'}

${PITCH_OPENER_RULES}

Return ONLY valid JSON, no markdown, no preamble:
{"paragraph": "string"}`

  // Background brief context — for grounding only. The rep's chosen event is the
  // anchor; the rest helps the model be concrete and accurate.
  const companyContext = `Company: ${prospect.name}
Persona to address: ${persona!.trim()}
Compelling event to anchor on (build the paragraph around THIS): ${compelling_event!.trim()}

Background (for grounding — do not introduce other triggers):
Snapshot: ${brief.snapshot ?? 'not available'}
Strategic initiatives: ${(brief.initiatives ?? []).join('; ') || 'none'}
Pain signals: ${(brief.pain_signals ?? []).join('; ') || 'none'}
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

  // 7. Parse JSON
  let paragraph: string
  try {
    const raw   = textBlock.text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON found')
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { paragraph?: string }
    if (!parsed.paragraph?.trim()) throw new Error('No paragraph in response')
    paragraph = parsed.paragraph.trim()
  } catch {
    console.error('[pitch-opener] Failed to parse JSON:', textBlock.text.slice(0, 300))
    return Response.json({ error: 'Failed to parse opener response' }, { status: 500 })
  }

  // 8. NOT persisted — the opener is a composable draft, not the brief's first touch.

  // 9. Log cost
  const cost = calculateCost(MODEL, response.usage.input_tokens, response.usage.output_tokens)
  await adminClient.from('api_usage').insert({
    user_id:       user.id,
    prospect_id,
    endpoint:      'pitch-opener',
    model:         MODEL,
    input_tokens:  response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd:      cost,
  })

  return Response.json({ paragraph, cost_usd: cost })
}
