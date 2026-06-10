import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { decryptApiKey } from '@/lib/crypto'
import type { OrgCandidate } from '@/lib/types'

const MODEL = 'claude-haiku-4-5-20251001'

// Territory boost added to confidence score for candidates whose HQ is in the
// rep's territory. Enough to float a territory match above a same-confidence
// non-territory match, but not enough to eclipse a clearly stronger candidate.
const TERRITORY_BOOST = 0.15

const SYSTEM_PROMPT = `You are a company identification assistant. Given a search query, identify the most likely matching organizations.

Return ONLY valid JSON, no markdown fencing, no preamble:
{
  "candidates": [
    {
      "name": "string — canonical company name",
      "hq_region": "string | null — ISO 3166-2 subdivision code, e.g. 'US-CA', 'CA-ON', 'GB-ENG'. null if non-regional or unknown",
      "hq_display": "string | null — human readable HQ, e.g. 'Austin, TX' or 'London, UK'. null if unknown",
      "description": "string — one line: what the company does plus any identifying detail (ticker, industry, size)",
      "disambiguated_query": "string — enriched search query for a research tool, e.g. 'Salesforce Inc (NYSE: CRM, San Francisco CA)'",
      "confidence": number  — 0.0 to 1.0: how likely this candidate matches the query
    }
  ]
}

Rules:
- Return 1–4 candidates ordered by confidence descending.
- confidence 0.95–1.0: query unambiguously identifies this entity (includes ticker, full legal name, or globally unique name).
- confidence 0.7–0.94: strong match — well-known entity, query clearly refers to it but minor ambiguity remains.
- confidence 0.4–0.69: plausible match — reasonable interpretation but other candidates are similarly likely.
- confidence below 0.4: weak match — include only if no stronger candidates exist.
- Return an empty candidates array only when no real company matches the query at all.
- Prefer well-known standalone entities over subsidiaries unless the query specifically implies a subsidiary.
- Do not fabricate organizations. Only include companies you are confident exist.`

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // 2. Parse body
  const { query } = await request.json() as { query?: string }
  if (!query?.trim()) {
    return Response.json({ error: 'query is required' }, { status: 400 })
  }

  // 3. Fetch rep profile — need id for territory lookup + BYOK key
  const { data: profile } = await adminClient
    .from('rep_profiles')
    .select('id, anthropic_api_key')
    .eq('user_id', user.id)
    .single()

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

  // 4. Fetch rep's territory region codes for confidence boost
  const { data: territoryRows } = await adminClient
    .from('territories')
    .select('region_code')
    .eq('rep_id', profile!.id)

  const territoryCodes = new Set((territoryRows ?? []).map((t: { region_code: string }) => t.region_code))

  // 5. Call Haiku to identify candidate organizations
  const client = new Anthropic({ apiKey: userApiKey })

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Identify organizations matching: ${query.trim()}` },
    ],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'No response from AI' }, { status: 500 })
  }

  let parsed: { candidates: OrgCandidate[] }
  try {
    const raw   = textBlock.text
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('No JSON found')
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return Response.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 6. Apply territory boost then sort by confidence descending
  const candidates: OrgCandidate[] = (parsed.candidates ?? [])
    .map(c => ({
      ...c,
      confidence: Math.min(
        1.0,
        (c.confidence ?? 0.5) +
          (c.hq_region && territoryCodes.has(c.hq_region) ? TERRITORY_BOOST : 0)
      ),
    }))
    .sort((a, b) => b.confidence - a.confidence)

  return Response.json({ candidates })
}
