// ─────────────────────────────────────────────────────────────────────────────
// Shared prompt fragments — imported by research and refresh-email routes
// to keep email rules in sync across all generation endpoints.
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_RULES = `Email writing rules (hard constraints — not suggestions, not guidelines, requirements):
- BOTTOM LINE UP FRONT: The first sentence is the point. Not an observation, not a setup — the reason you are writing and why it matters to them, in one sentence. Everything else supports it.
- 75 WORDS MAX in the body. Count every word. If it's over, cut — do not summarize, cut.
- STRUCTURE: 3–5 short sentences + one ask. No paragraphs. If referencing multiple data points (signals, metrics, context), use a short bullet list instead of prose.
- TONE: Professional, direct, confident. No hedging, no throat-clearing, no setup sentences.
- ASK: One low-friction close — a question they can answer in one sentence. Not a calendar link. Not "would love to connect."
- NEVER start with "I" as the first word.
- NEVER use: "hope this finds you", "just wanted to", "reaching out", "touch base", "circle back", "synergies", "low-hanging fruit", "game changer", "thought leader", "excited to share", "quick call", "15 minutes", "pick your brain", "would love to", "I wanted to", "I came across", "I noticed", "I saw that"
- NO FLATTERY. No compliments about their company, their work, or their time. Executives delete flattery. Skip it entirely.
- Write in the rep's voice from their samples — match sentence length, rhythm, and especially what they leave out.
- Rep background: reference only if it directly earns credibility for this specific prospect — one clause max.`

// ─────────────────────────────────────────────────────────────────────────────
// Pitch opener — a single paragraph the rep drops into the top of their own
// email. NOT a full email: no subject, no greeting, no sign-off, no ask. The
// rep writes everything around it; this just nails the observation → relevance
// hook. Anchored on ONE specific compelling event and ONE specific product,
// addressed to ONE specific persona.
// ─────────────────────────────────────────────────────────────────────────────

export const PITCH_OPENER_RULES = `Pitch opener writing rules (hard constraints — not suggestions, requirements):
- OUTPUT IS ONE PARAGRAPH ONLY. No subject line. No greeting. No sign-off. No call to action or ask. The rep supplies all of that themselves — you write only the opening hook.
- 2–4 sentences. 60 WORDS MAX. Count every word. If it's over, cut.
- ANCHOR ON THE GIVEN EVENT: The paragraph must be built around the one compelling event provided — name it concretely (the migration, the modernization, the retirement of legacy systems, etc.). Do not invent a different trigger.
- CONNECT EVENT → PRODUCT: One sentence on how the specified product makes that specific event go better. Be concrete about the mechanism, not generic about value.
- ADDRESS THE PERSONA: Pitch it at the priorities of the named role/persona — what that person owns and is measured on.
- TONE: Professional, direct, confident. No hedging, no throat-clearing, no setup sentences.
- NEVER start with "I" as the first word.
- NEVER use: "hope this finds you", "just wanted to", "reaching out", "touch base", "circle back", "synergies", "low-hanging fruit", "game changer", "thought leader", "excited to share", "quick call", "15 minutes", "pick your brain", "would love to", "I wanted to", "I came across", "I noticed", "I saw that"
- NO FLATTERY. No compliments about their company, their work, or their time. Skip it entirely.
- Write in the rep's voice from their samples — match sentence length, rhythm, and especially what they leave out.`
