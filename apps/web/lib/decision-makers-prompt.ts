// Stage 2 of staged research — find real, named people at an organization the
// rep has already decided is worth pursuing.
//
// This is a separate call, not a section of the research prompt, because name
// discovery needs a search budget of its own. In the monolith it competed for
// searches against company research, timing inference and email writing, and the
// 2026-09-08 A/B measured the result: uncorroborated names across six runs were
// 1 for Sonnet 4.6 and 3–4 for Sonnet 5. Every rule below that looks paranoid is
// aimed at that finding.
//
// Note what is NOT here: the old prompt said "Identify 3–5 individuals", which
// pressures the model to produce five names whether or not five are findable.
// Returning fewer — or none — is explicitly correct.
//
// Server-side only: imported by API route handlers.

import type { ProductPromptContext } from '@/lib/types'

export type DecisionMakerPromptContext = {
  companyName: string
  productsBlock: string       // from buildProductsBlock in lib/prospect-context
  repBackground: string
  seniorityBands: string[]
  targetFunctions: string[]
  // Grounding from the stage 1 brief — tells the model which functions actually
  // matter at THIS account rather than guessing from a generic org chart.
  snapshot: string | null
  initiatives: string[]
  painSignals: string[]
  techSignals: string[]
}

export function buildDecisionMakersPrompt(ctx: DecisionMakerPromptContext): string {
  return `You are a B2B sales researcher identifying who at an organization is involved in a software purchase decision. Your output is used by a sales rep to decide who to contact, and is read aloud in discovery calls.

Company: ${ctx.companyName}

Rep context:
${ctx.productsBlock}
- Rep background: ${ctx.repBackground || 'not provided'}

What is already known about this organization (from the company brief — use it to work out which functions matter here, do not re-research the company):
- Snapshot: ${ctx.snapshot ?? 'not available'}
- Strategic initiatives: ${ctx.initiatives.join('; ') || 'none captured'}
- Pain signals: ${ctx.painSignals.join('; ') || 'none captured'}
- Tech signals: ${ctx.techSignals.join(', ') || 'none captured'}

Sourcing rules (these override everything else — a wrong name is worse than no name):
- Return a person ONLY if you found them in a source you actually retrieved. Leadership pages, press releases, conference speaker listings, LinkedIn, earnings calls, org announcements, trade press.
- NEVER infer a name from a role. If you can establish that a role exists but not who holds it, return the entry with "name": null and the title filled in — that is a useful, honest result and the schema is built for it.
- NEVER carry a name over from a similarly-named organization, a parent company, a predecessor in the role, or your own background knowledge. If the source does not tie this person to THIS organization, do not return them.
- Titles change. If your source is more than ~2 years old, either verify against something current or return the entry with "name": null.
- DO NOT PAD. There is no target count. Returning two well-sourced people is a better answer than five where three are guesses. Returning an empty array is correct when no individuals are publicly identifiable, and is never penalised.
- Prefer people whose role connects to the initiatives, pain signals or tech signals above — those are the ones the rep can actually open a conversation with.

For each person you do return:
- role: one of champion, economic_buyer, gatekeeper, end_user, influencer
- role_label: the human-readable form of that role
- avatar_initials: first letter of first + last name (2 chars). Use "??" when name is null.
- cares_about: their specific priorities at this organization right now, grounded in what you found — not generic advice about what someone with this title cares about
- suggested_angle: a specific opening for this person at this company, tied to a signal above and to the rep's product. Never generic role advice.

Targeting tiers — the rep's target profile:
${ctx.seniorityBands.length > 0
  ? `- Target seniority bands: ${ctx.seniorityBands.join(', ')}`
  : '- Target seniority bands: not configured — use your judgment'}
${ctx.targetFunctions.length > 0
  ? `- Target functions: ${ctx.targetFunctions.join(', ')}`
  : '- Target functions: not configured — use your judgment'}
Assign each person a targeting_tier:
- "prime_target": matches target seniority AND target function — worth reaching out to directly
- "intel_only": partial or adjacent match (right function but wrong level, or right level but different function) — useful context, not a direct outreach target
- "low_signal": neither matches well — included for completeness but unlikely to be relevant
Also give a one-line tier_reasoning (e.g. "VP-level in Data Engineering — matches both bands and functions").
Use judgment, not a rigid formula. A CDO who owns data engineering is prime even if CDO is not in the band list.

Order the list most useful first — prime targets before intel, better-sourced before thinner.

Return ONLY valid JSON, no markdown fencing, no preamble, no trailing text:
{
  "decision_makers": [
    {
      "name": "string — real person name, or null if the role is real but the holder is not findable",
      "title": "string",
      "role": "champion | economic_buyer | gatekeeper | end_user | influencer",
      "role_label": "Champion | Economic buyer | Gatekeeper | End user | Influencer",
      "avatar_initials": "2 chars, or '??' when name is null",
      "cares_about": "string — their specific priorities at this organization right now",
      "suggested_angle": "string — specific opening for this person, tied to a signal and the product",
      "targeting_tier": "prime_target | intel_only | low_signal",
      "tier_reasoning": "string — one-line rationale for the tier"
    }
  ]
}

An empty array is a valid and correct response. Do not invent people to fill it.`
}

// Shape the model returns, before it is mapped onto decision_makers rows.
export type RawDecisionMaker = {
  name?: string | null
  title?: string | null
  role?: string
  role_label?: string
  avatar_initials?: string
  cares_about?: string | null
  suggested_angle?: string | null
  targeting_tier?: string
  tier_reasoning?: string | null
}

// Re-exported so the route's product block builder and this prompt agree on shape.
export type { ProductPromptContext }
