// POST /api/case-studies/match
// Single Claude call (no web search) to rank the top 5 case studies by relevance
// to a given prospect. Returns merged array of case study records + match metadata.
// Logs to api_usage with endpoint 'case-study-match'. Counts against daily limit.

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateCost } from '@/lib/utils'
import { decryptApiKey } from '@/lib/crypto'
import type { CaseStudy, CaseStudyMatch } from '@/lib/types'

const MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────
export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. Rate limit
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

  // 4. Fetch prospect brief + all case studies in parallel
  const [briefRes, caseStudiesRes, profileRes] = await Promise.all([
    adminClient
      .from('prospect_briefs')
      .select('snapshot, initiatives, pain_signals, tech_signals, stats, industry')
      .eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    adminClient
      .from('case_studies')
      .select('id, title, company_name, industry, company_size, pain_solved, product_used, outcome, tags')
      .order('created_at', { ascending: true }),
    adminClient
      .from('rep_profiles')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .single(),
  ])

  if (!briefRes.data) return Response.json({ error: 'No brief found — run research first' }, { status: 404 })

  const caseStudies = (caseStudiesRes.data ?? []) as CaseStudy[]
  if (caseStudies.length === 0) {
    return Response.json({ error: 'No case studies in library. Import a deck first.' }, { status: 404 })
  }

  // BYOK hard gate
  const storedKey = profileRes.data?.anthropic_api_key?.trim()
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

  // 5. Build prompt
  const brief = briefRes.data
  const prospectContext = `Prospect profile:
- Snapshot: ${brief.snapshot ?? 'not available'}
- Pain signals: ${(brief.pain_signals as string[] ?? []).join('; ') || 'none'}
- Strategic initiatives: ${(brief.initiatives as string[] ?? []).join('; ') || 'none'}
- Tech signals: ${(brief.tech_signals as string[] ?? []).join(', ') || 'none'}
- Company size from stats: ${(brief.stats as { stage?: { value?: string } } | null)?.stage?.value ?? 'unknown'}`

  const libraryContext = caseStudies.map((cs, i) =>
    `[${i + 1}] id: ${cs.id}
  title: ${cs.title}
  company: ${cs.company_name ?? 'n/a'} | industry: ${cs.industry ?? 'n/a'} | size: ${cs.company_size ?? 'n/a'}
  pain_solved: ${cs.pain_solved ?? 'n/a'}
  product: ${cs.product_used ?? 'n/a'}
  outcome: ${cs.outcome ?? 'n/a'}
  tags: ${(cs.tags ?? []).join(', ') || 'none'}`
  ).join('\n\n')

  const userMessage = `${prospectContext}

Case study library (${caseStudies.length} records):
${libraryContext}

Return the top 5 most relevant case studies for this prospect. For each, explain WHY it is relevant in 2–4 short reason chips.

Return ONLY this JSON:
{
  "matches": [
    {
      "case_study_id": "uuid",
      "relevance_score": 0.0–1.0,
      "match_reasons": ["reason 1", "reason 2", "reason 3"]
    }
  ]
}

Order matches by relevance_score descending. No markdown, no preamble.`

  // 6. Single Claude call, no web search
  const client = new Anthropic({ apiKey: userApiKey })

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: 'You are matching B2B sales case studies to a prospect profile. Return JSON only.',
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  const totalInput  = response.usage.input_tokens
  const totalOutput = response.usage.output_tokens

  // 7. Log cost
  const cost = calculateCost(MODEL, totalInput, totalOutput)
  await adminClient.from('api_usage').insert({
    user_id:       user.id,
    prospect_id,
    endpoint:      'case-study-match',
    model:         MODEL,
    input_tokens:  totalInput,
    output_tokens: totalOutput,
    cost_usd:      cost,
  })

  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No response from AI' }, { status: 500 })
  }

  // 8. Parse JSON
  let parsed: { matches: { case_study_id: string; relevance_score: number; match_reasons: string[] }[] }
  try {
    const raw   = textBlock.text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON found')
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    console.error('[case-study-match] Failed to parse AI JSON:', textBlock.text.slice(0, 300))
    return Response.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 9. Merge match metadata with full case study records (which include slide_image_path)
  const caseStudiesById = new Map(caseStudies.map(cs => [cs.id, cs]))

  // Also fetch slide_image_path for matched records (wasn't included in match query for conciseness)
  const matchedIds = (parsed.matches ?? []).map(m => m.case_study_id)
  const { data: fullRecords } = await adminClient
    .from('case_studies')
    .select('*')
    .in('id', matchedIds)

  const fullById = new Map((fullRecords ?? []).map(cs => [cs.id, cs as CaseStudy]))

  const matches: CaseStudyMatch[] = (parsed.matches ?? [])
    .slice(0, 5)
    .map(m => {
      const cs = fullById.get(m.case_study_id) ?? caseStudiesById.get(m.case_study_id)
      if (!cs) return null
      return {
        ...cs,
        relevance_score: m.relevance_score,
        match_reasons:   m.match_reasons ?? [],
      }
    })
    .filter((m): m is CaseStudyMatch => m !== null)

  return Response.json({ matches, cost_usd: cost })
}
