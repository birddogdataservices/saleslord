// POST /api/refresh-email
// Regenerates the email draft for an existing prospect brief.
// Uses the already-researched brief as context — no web search, no re-research.
// Cheap call: ~1–2k tokens vs ~20–30k for full research.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils'
import { EMAIL_RULES } from '@/lib/prompts'
import { withJob } from '@/lib/jobs'
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
  const { prospect_id, product_id } = await request.json() as {
    prospect_id?: string
    product_id?: string   // optional — if provided, focus email on this product only
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

  const systemPrompt = `You are a B2B sales email writer. Your only job is to write one cold outreach email.

Rep context:
${productsBlock}
- Rep background: ${profile?.rep_background ?? 'not provided'}
${profile?.voice_samples
  ? `- Rep voice samples — match this style exactly:\n${profile.voice_samples}`
  : '- Voice samples: not provided. Write in a clear, direct, human voice.'}

${EMAIL_RULES}

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

  // 7. Parse JSON
  let email: { subject: string; body: string }
  try {
    const raw   = textBlock.text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON found')
    email = JSON.parse(raw.slice(start, end + 1))
  } catch {
    console.error('[refresh-email] Failed to parse JSON:', textBlock.text.slice(0, 300))
    return Response.json({ error: 'Failed to parse email response' }, { status: 500 })
  }

  // 8. Update brief with new email
  await adminClient
    .from('prospect_briefs')
    .update({ email })
    .eq('id', brief.id)

  // 9. Log cost
  const cost = calculateCost(MODEL, response.usage.input_tokens, response.usage.output_tokens)
  await adminClient.from('api_usage').insert({
    user_id:       user.id,
    prospect_id,
    endpoint:      'email',
    model:         MODEL,
    input_tokens:  response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd:      cost,
  })

  return Response.json({ email, cost_usd: cost })
}
