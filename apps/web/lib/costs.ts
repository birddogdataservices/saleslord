// ─────────────────────────────────────────
// Cost hints — shown at natural workflow pause points (dialogs, confirms).
// These are intentionally imprecise ranges, not exact figures.
// Update when model pricing or typical token volumes change materially.
// Never show these for operations under ~$0.01 — passive display or nothing.
// ─────────────────────────────────────────

export const COST_HINTS = {
  // Sonnet 4.6 agentic loop, 1–6 web searches, typical 20k–100k input tokens
  research: 'roughly $0.10–$0.40 from your Anthropic key',

  // Sonnet 4.6 single call, email only — no web search
  refreshEmail: 'roughly $0.01–$0.02 from your Anthropic key',

  // Sonnet 4.6 single call, re-research with diff — similar to research
  refresh: 'roughly $0.10–$0.40 from your Anthropic key',

  // Sonnet 4.6 single call, note history + brief context
  followUp: 'roughly $0.02–$0.06 from your Anthropic key',
} as const

export type CostHintKey = keyof typeof COST_HINTS
