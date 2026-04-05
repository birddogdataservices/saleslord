import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils'
import { EMAIL_RULES } from '@/lib/prompts'
import type { DmRole, CompanyStats, ProductPromptContext } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────
function buildSystemPrompt(profile: {
  products: ProductPromptContext[]
  icp_description: string
  rep_background: string
  voice_samples: string
}, todayISO: string, currentMonth: number): string {
  // Format products section — supports 1 or many
  const productsBlock = profile.products.length === 0
    ? '- Products: not specified'
    : profile.products.length === 1
      ? `- Product: ${profile.products[0].name}
- Description: ${profile.products[0].description}
- Value props: ${profile.products[0].value_props}
- Competitors: ${profile.products[0].competitors}`
      : `- Products (rep carries multiple — match the most relevant to this prospect):\n${
          profile.products.map((p, i) =>
            `  ${i + 1}. ${p.name}: ${p.description}. Value props: ${p.value_props}. Competes with: ${p.competitors}`
          ).join('\n')
        }`

  return `You are a B2B sales intelligence assistant. Research a company and return a structured JSON brief personalized to this specific rep.

Today: ${todayISO} (month ${currentMonth})

Rep context:
${productsBlock}
- ICP: ${profile.icp_description}
- Rep background: ${profile.rep_background}
${profile.voice_samples
  ? `- Rep voice samples — write the email in this exact style, matching sentence length, tone, and structure:\n${profile.voice_samples}`
  : '- Voice samples: not provided. Write in a clear, direct, human voice.'}

${EMAIL_RULES}

Timing rules:
- Infer the company's fiscal year end from public filings, Wikipedia, or industry norms
- Ideal outreach window = 3–5 months before FY end (budget planning period)
- window_status: "open" if today falls in that window, "approaching" if within 60 days of it, "closed" otherwise

Decision maker rules:
- Identify 3–5 individuals likely involved in a software purchase decision for this product
- Use web search to find named individuals where publicly available (LinkedIn, press releases, company blog, earnings calls)
- For each person: infer their likely priorities based on their role, public statements, and company context
- Assign one of: champion, economic_buyer, gatekeeper, end_user, influencer
- suggested_angle must be specific to this person at this company — never generic role advice
- avatar_initials: first letter of first + last name (2 chars)

Return ONLY valid JSON, no markdown fencing, no preamble, no trailing text:
{
  "company": {
    "name": "string",
    "tagline": "one-line description",
    "tags": ["industry tag", "size tag"]
  },
  "stats": {
    "revenue":    { "value": "e.g. $3.4B or Unknown", "context": "e.g. +33% YoY" },
    "headcount":  { "value": "e.g. ~7,000 or Unknown", "context": "e.g. +8% past 12 mo" },
    "open_roles": { "value": "e.g. 47 or Unknown", "context": "e.g. 14 in engineering" },
    "stage":      { "value": "e.g. Public · SNOW or Series B", "context": "e.g. IPO Sept 2020" }
  },
  "snapshot": "2-3 sentence overview relevant to the rep's ICP and product",
  "initiatives": ["string — strategic initiative relevant to the rep's product"],
  "pain_signals": ["string — pain or pressure tied specifically to the rep's product"],
  "tech_signals": ["tool or platform name only"],
  "news": [
    {
      "date": "Mon DD, YYYY",
      "text": "string — what happened and why it matters to this rep",
      "source": "Publication name",
      "url": "https://real-url-only — omit item if no real URL found"
    }
  ],
  "outreach_angle": "2-3 sentences connecting their situation to the rep's product and background",
  "timing": {
    "fy_end": "e.g. January 31",
    "recommended_outreach_window": "e.g. August–October",
    "window_status": "open | approaching | closed",
    "reasoning": "1 sentence"
  },
  "decision_makers": [
    {
      "name": "string — real person name or null if not findable",
      "title": "string",
      "role": "champion | economic_buyer | gatekeeper | end_user | influencer",
      "role_label": "Champion | Economic buyer | Gatekeeper | End user | Influencer",
      "avatar_initials": "2 chars",
      "cares_about": "string — their specific priorities at this company right now",
      "suggested_angle": "string — specific angle for this person, not generic role advice"
    }
  ],
  "email": {
    "subject": "string",
    "body": "string — under 120 words, in rep's voice"
  }
}`
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

  // 2. Rate limit — 25 calls per rolling 24h (configurable via DAILY_CALL_LIMIT)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await adminClient
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)

  const limit = Number(process.env.DAILY_CALL_LIMIT ?? '25')
  if ((count ?? 0) >= limit) {
    return Response.json({ error: 'Daily limit reached. Resets in 24 hours.' }, { status: 429 })
  }

  // 3. Parse body
  const { query } = await request.json() as { query?: string }
  if (!query?.trim()) {
    return Response.json({ error: 'query is required' }, { status: 400 })
  }

  // 4. Fetch rep profile + shared products
  const [{ data: profile }, { data: productRows }] = await Promise.all([
    adminClient.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    adminClient.from('products').select('name, description, value_props, competitors').order('created_at', { ascending: true }),
  ])

  const products: ProductPromptContext[] = productRows ?? []
  if (products.length === 0) {
    return Response.json({ error: 'No products have been configured yet. Ask your admin to add at least one product.' }, { status: 400 })
  }

  // 5. Build and run the AI research call with agentic tool-use loop
  const today  = new Date()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = buildSystemPrompt(
    {
      products,
      icp_description: profile.icp_description ?? '',
      rep_background:  profile.rep_background  ?? '',
      voice_samples:   profile.voice_samples   ?? '',
    },
    today.toISOString().split('T')[0],
    today.getMonth() + 1
  )

  type AntMessage = Anthropic.MessageParam
  const messages: AntMessage[] = [
    { role: 'user', content: `Research this company for my B2B sales pipeline: ${query.trim()}` }
  ]

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }] as any,
    messages,
  })

  // Agentic loop — handle multiple web search tool calls
  while (response.stop_reason === 'tool_use') {
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
      max_tokens: 4096,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }] as any,
      messages,
    })
  }

  // 6. Extract and parse JSON.
  // If the model produced a planning/summary message without JSON (common when it
  // narrates its findings before outputting), nudge it with one tool-free follow-up
  // so it can only output the JSON object and nothing else.
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
      max_tokens: 4096,
      system: systemPrompt,
      // No tools — we only want the JSON, no more searching
      messages,
    })
    textBlock = jsonResponse.content.find(b => b.type === 'text')
    totalInputTokens  += jsonResponse.usage.input_tokens
    totalOutputTokens += jsonResponse.usage.output_tokens
  }

  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No text response from AI' }, { status: 500 })
  }

  let parsed: any
  try {
    // Extract JSON robustly — slice from first { to last } to tolerate preambles,
    // prose suffixes, and markdown fencing the model may add despite instructions.
    const raw   = textBlock.text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found')
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    console.error('[research] Failed to parse AI JSON:', textBlock.text.slice(0, 500))
    return Response.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 7. Sort news descending (source of truth is DB order — never re-sort client-side)
  const news: { date: string; text: string; source: string; url: string }[] =
    (parsed.news ?? []).sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )

  // 8. Write to database
  // Upsert prospect
  const { data: prospect, error: prospectError } = await adminClient
    .from('prospects')
    .upsert(
      { user_id: user.id, name: parsed.company?.name ?? query.trim(), query: query.trim() },
      { onConflict: 'user_id,query' }
    )
    .select()
    .single()

  if (prospectError || !prospect) {
    console.error('[research] Prospect upsert error:', prospectError)
    return Response.json({ error: 'Failed to save prospect' }, { status: 500 })
  }

  // Delete existing brief (one active brief per prospect)
  await adminClient.from('prospect_briefs').delete().eq('prospect_id', prospect.id)

  // Insert new brief
  const stats: CompanyStats = parsed.stats ?? { revenue: null, headcount: null, open_roles: null, stage: null }
  const { data: brief, error: briefError } = await adminClient
    .from('prospect_briefs')
    .insert({
      prospect_id:    prospect.id,
      snapshot:       parsed.snapshot ?? null,
      initiatives:    parsed.initiatives ?? [],
      pain_signals:   parsed.pain_signals ?? [],
      tech_signals:   parsed.tech_signals ?? [],
      news,
      outreach_angle: parsed.outreach_angle ?? null,
      stats,
      timing:         parsed.timing ?? null,
      email:          parsed.email ?? null,
    })
    .select()
    .single()

  if (briefError || !brief) {
    console.error('[research] Brief insert error:', briefError)
    return Response.json({ error: 'Failed to save brief' }, { status: 500 })
  }

  // Delete existing decision makers and insert fresh
  await adminClient.from('decision_makers').delete().eq('prospect_id', prospect.id)

  const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
    champion:       { bg: '#E1F5EE', text: '#085041' },
    economic_buyer: { bg: '#E6F1FB', text: '#0C447C' },
    gatekeeper:     { bg: '#FAECE7', text: '#712B13' },
    end_user:       { bg: '#EEEDFE', text: '#3C3489' },
    influencer:     { bg: '#FAEEDA', text: '#633806' },
    custom:         { bg: '#F0EEE9', text: '#6B6A64' },
  }

  const decisionMakers = (parsed.decision_makers ?? []).map((dm: any, i: number) => {
    const role: DmRole = dm.role ?? 'custom'
    const colors = ROLE_COLORS[role] ?? ROLE_COLORS.custom
    return {
      prospect_id:      prospect.id,
      name:             dm.name ?? null,
      title:            dm.title ?? null,
      role,
      role_label:       dm.role_label ?? role,
      avatar_initials:  dm.avatar_initials ?? '??',
      avatar_color_bg:  colors.bg,
      avatar_color_text: colors.text,
      cares_about:      dm.cares_about ?? null,
      suggested_angle:  dm.suggested_angle ?? null,
      sort_order:       i,
    }
  })

  if (decisionMakers.length > 0) {
    const { error: dmError } = await adminClient.from('decision_makers').insert(decisionMakers)
    if (dmError) console.error('[research] Decision maker insert error:', dmError)
  }

  // Update last_refreshed_at on prospect
  await adminClient
    .from('prospects')
    .update({ last_refreshed_at: new Date().toISOString() })
    .eq('id', prospect.id)

  // 9. Log cost
  const cost = calculateCost(MODEL, totalInputTokens, totalOutputTokens)

  await adminClient.from('api_usage').insert({
    user_id:       user.id,
    prospect_id:   prospect.id,
    endpoint:      'research',
    model:         MODEL,
    input_tokens:  totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd:      cost,
  })

  // 10. Return
  return Response.json({
    prospect_id: prospect.id,
    prospect,
    brief,
    decision_makers: decisionMakers,
    cost_usd: cost,
  })
}
