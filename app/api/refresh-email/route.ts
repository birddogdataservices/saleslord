// POST /api/refresh-email
// Regenerates the email draft for an existing prospect brief.
// Uses the already-researched brief as context — no web search, no re-research.
// Cheap call: ~1–2k tokens vs ~20–30k for full research.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils'
import { EMAIL_RULES } from '@/lib/prompts'
import type { ProductPromptContext } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. Rate limit — shared 24h bucket with all other endpoints
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await adminClient
    .from('api_usage').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since)

  const limit = Number(process.env.DAILY_CALL_LIMIT ?? '25')
  if ((count ?? 0) >= limit) {
    return Response.json({ error: 'Daily limit reached. Resets in 24 hours.' }, { status: 429 })
  }

  // 3. Parse body
  const { prospect_id } = await request.json() as { prospect_id?: string }
  if (!prospect_id) return Response.json({ error: 'prospect_id is required' }, { status: 400 })

  // 4. Fetch prospect, brief, rep profile, products in parallel
  const [prospectRes, briefRes, profileRes, productRes] = await Promise.all([
    adminClient.from('prospects').select('*').eq('id', prospect_id).single(),
    adminClient.from('prospect_briefs').select('*').eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false }).limit(1).single(),
    adminClient.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    adminClient.from('products').select('name, description, value_props, competitors')
      .order('created_at', { ascending: true }),
  ])

  if (!prospectRes.data) return Response.json({ error: 'Prospect not found' }, { status: 404 })
  if (!briefRes.data)    return Response.json({ error: 'No brief found — run research first' }, { status: 404 })

  const prospect = prospectRes.data
  const brief    = briefRes.data
  const profile  = profileRes.data
  const products: ProductPromptContext[] = productRes.data ?? []

  // 5. Build a focused prompt — brief context + email rules only, no web search
  const productsBlock = products.length === 0
    ? 'Products: not specified'
    : products.length === 1
      ? `Product: ${products[0].name} — ${products[0].description}. Value props: ${products[0].value_props}. Competes with: ${products[0].competitors}`
      : `Products (match the most relevant):\n${products.map((p, i) =>
          `  ${i + 1}. ${p.name}: ${p.description}. Value props: ${p.value_props}. Competes with: ${p.competitors}`
        ).join('\n')}`

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

  const companyContext = `Company: ${prospect.name}
Snapshot: ${brief.snapshot ?? 'not available'}
Strategic initiatives: ${(brief.initiatives ?? []).join('; ') || 'none'}
Pain signals: ${(brief.pain_signals ?? []).join('; ') || 'none'}
Outreach angle: ${brief.outreach_angle ?? 'not available'}
Recent news: ${(brief.news ?? []).slice(0, 3).map((n: any) => `${n.date}: ${n.text}`).join(' | ') || 'none'}
Tech signals: ${(brief.tech_signals ?? []).join(', ') || 'none'}`

  // 6. Generate — no tools, text only
  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
