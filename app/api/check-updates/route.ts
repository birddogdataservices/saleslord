// POST /api/check-updates
// Searches for recent news about a prospect and appends a blurb if relevant changes are found.
// Does NOT overwrite the existing brief — only appends to prospect_updates.
// Returns { found: false } if no relevant new intel is found (blurb is not written).
// Cheaper than full research: narrower output, same web search budget.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils'
import { decryptApiKey } from '@/lib/crypto'
import type { ProductPromptContext, NewsItem } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────
// System prompt — narrowly scoped to "what changed"
// ─────────────────────────────────────────
function buildSystemPrompt(
  products: ProductPromptContext[],
  repBackground: string,
  voiceSamples: string,
): string {
  const productsBlock = products.length === 0
    ? '- Products: not specified'
    : products.length === 1
      ? `- Product: ${products[0].name}\n- Value props: ${products[0].value_props}`
      : `- Products (rep carries multiple):\n${
          products.map((p, i) => `  ${i + 1}. ${p.name}: ${p.value_props}`).join('\n')
        }`

  return `You are a B2B sales intelligence assistant scanning for recent developments about a company.

Rep context:
${productsBlock}
- Rep background: ${repBackground}

Your job is ONLY to surface new, relevant intelligence — not to re-research what's already known.
You will be given the company's existing brief and a list of news items already captured.
Search for developments that occurred AFTER the last-checked date provided.

Relevance criteria (all must apply):
- The event happened after the last-checked date
- It is not already in the existing news list (check URLs and event descriptions)
- It is directly relevant to the rep's product and ICP — leadership changes, funding rounds, layoffs, new product launches, earnings reports, regulatory changes, or major partnerships

If no relevant new developments are found, return exactly: {"found": false}

If relevant developments exist, return:
{
  "found": true,
  "summary": "2–3 sentences: what changed and why it matters to this rep right now",
  "news_items": [
    {
      "date": "Mon DD, YYYY",
      "text": "what happened and why it matters to this rep",
      "source": "Publication name",
      "url": "https://real-url-only — omit item if no real URL"
    }
  ]
}

Return ONLY valid JSON. No markdown fencing, no preamble, no trailing text.`
}

// ─────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────
export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. Rate limit — shared 24h bucket across all endpoints
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

  // 4. Fetch everything in parallel
  const [prospectRes, briefRes, profileRes, productRes, lastUpdateRes] = await Promise.all([
    adminClient.from('prospects').select('*').eq('id', prospect_id).single(),
    adminClient.from('prospect_briefs').select('*').eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false }).limit(1).single(),
    adminClient.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    adminClient.from('products').select('name, description, value_props, competitors')
      .order('created_at', { ascending: true }),
    // Most recent update blurb — used to determine "last checked" date
    adminClient.from('prospect_updates').select('created_at').eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!prospectRes.data) return Response.json({ error: 'Prospect not found' }, { status: 404 })
  if (!briefRes.data)    return Response.json({ error: 'No brief found — run research first' }, { status: 404 })

  const prospect    = prospectRes.data
  const brief       = briefRes.data
  const profile     = profileRes.data
  const products: ProductPromptContext[] = productRes.data ?? []

  // BYOK hard gate
  const storedKey = profile?.anthropic_api_key?.trim()
  if (!storedKey) {
    return Response.json(
      { error: 'No Anthropic API key configured. Add your key in Profile & Settings.' },
      { status: 402 }
    )
  }
  let userApiKey: string
  try {
    userApiKey = decryptApiKey(storedKey)
  } catch {
    return Response.json(
      { error: 'Failed to decrypt your API key. Please re-enter it in Profile & Settings.' },
      { status: 500 }
    )
  }

  // 5. Determine "last checked" date — use most recent blurb date, or original research date
  const lastCheckedAt =
    lastUpdateRes.data?.created_at ??
    prospect.last_refreshed_at ??
    brief.created_at

  const lastCheckedLabel = new Date(lastCheckedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  // 6. Build context — existing news for dedup, brief snapshot for relevance grounding
  const existingNewsText = (brief.news as NewsItem[] ?? [])
    .map(n => `- ${n.date}: ${n.text} (${n.url ?? 'no url'})`)
    .join('\n') || 'None yet'

  const userMessage = `Company: ${prospect.name}
Last checked: ${lastCheckedLabel}

Existing brief snapshot:
${brief.snapshot ?? 'not available'}

Strategic initiatives already captured:
${(brief.initiatives as string[] ?? []).join('; ') || 'none'}

Pain signals already captured:
${(brief.pain_signals as string[] ?? []).join('; ') || 'none'}

News items already in the brief (do NOT re-surface these):
${existingNewsText}

Search for developments at ${prospect.name} that occurred after ${lastCheckedLabel} and are relevant to the rep's product. Return {"found": false} if nothing meaningful is new.`

  // 7. Run agentic web search loop
  const client = new Anthropic({ apiKey: userApiKey })
  const systemPrompt = buildSystemPrompt(
    products,
    profile?.rep_background ?? '',
    profile?.voice_samples ?? '',
  )

  type AntMessage = Anthropic.MessageParam
  const messages: AntMessage[] = [{ role: 'user', content: userMessage }]

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }] as any,
    messages,
  })

  const MAX_SEARCH_ITERATIONS = 3  // check-updates is narrower — fewer searches needed
  let iterations = 0
  while (response.stop_reason === 'tool_use' && iterations < MAX_SEARCH_ITERATIONS) {
    iterations++
    messages.push({ role: 'assistant', content: response.content })
    const toolResults = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({
        type: 'tool_result' as const,
        tool_use_id: b.id,
        content: (b as any).output ?? '',
      }))
    messages.push({ role: 'user', content: toolResults })
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }] as any,
      messages,
    })
  }

  // Nudge if no JSON in response
  let textBlock = response.content.find(b => b.type === 'text')
  let totalInputTokens  = response.usage.input_tokens
  let totalOutputTokens = response.usage.output_tokens

  if (!textBlock || !textBlock.text.includes('{')) {
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: 'Output the JSON object now. Begin with { and end with }. No other text.',
    })
    const jsonResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })
    textBlock = jsonResponse.content.find(b => b.type === 'text')
    totalInputTokens  += jsonResponse.usage.input_tokens
    totalOutputTokens += jsonResponse.usage.output_tokens
  }

  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No text response from AI' }, { status: 500 })
  }

  // 8. Parse JSON
  let parsed: { found: boolean; summary?: string; news_items?: NewsItem[] }
  try {
    const raw   = textBlock.text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON found')
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    console.error('[check-updates] Failed to parse AI JSON:', textBlock.text.slice(0, 300))
    return Response.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 9. Log cost regardless of whether updates were found (we used compute either way)
  const cost = calculateCost(MODEL, totalInputTokens, totalOutputTokens)
  await adminClient.from('api_usage').insert({
    user_id:       user.id,
    prospect_id,
    endpoint:      'check-updates',
    model:         MODEL,
    input_tokens:  totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd:      cost,
  })

  // 10. If no relevant updates, return early — no blurb written
  if (!parsed.found || !parsed.summary) {
    await adminClient
      .from('prospects')
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq('id', prospect_id)
    return Response.json({ found: false, cost_usd: cost })
  }

  // 11. Sort news descending and write blurb
  const newsItems: NewsItem[] = (parsed.news_items ?? []).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const { data: update, error: updateError } = await adminClient
    .from('prospect_updates')
    .insert({
      prospect_id,
      user_id:    user.id,
      summary:    parsed.summary,
      news_items: newsItems,
    })
    .select()
    .single()

  if (updateError || !update) {
    console.error('[check-updates] Insert error:', updateError)
    return Response.json({ error: 'Failed to save update' }, { status: 500 })
  }

  // Update last_refreshed_at
  await adminClient
    .from('prospects')
    .update({ last_refreshed_at: new Date().toISOString() })
    .eq('id', prospect_id)

  return Response.json({ found: true, update, cost_usd: cost })
}
