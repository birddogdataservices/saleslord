// ─────────────────────────────────────────
// Cost hints — shown at natural workflow pause points (dialogs, confirms).
// These are intentionally imprecise ranges, not exact figures.
// Update when model pricing or typical token volumes change materially.
// Never show these for operations under ~$0.01 — passive display or nothing.
// ─────────────────────────────────────────
//
// CALIBRATION (2026-09-13). Every figure here is what the rep is told they are
// about to spend on their own card, so the ranges err HIGH on purpose —
// under-quoting is the dangerous direction.
//
// A real charge has two parts, and they are measured differently:
//
//   tokens    — measured. Stage 1 $0.32–$0.42, stage 2 $0.30–$0.44, across the
//               2026-09-11 Massachusetts baseline and the 2026-09-12 California
//               runs. These are what api_usage records.
//   searches  — billed at $10 per 1,000 ON TOP of tokens, and NOT in api_usage.
//               Only one live count exists so far: check-updates on California
//               made 9 searches. Research and decision makers are broader, so
//               10–20 (~$0.10–$0.20) is assumed until the "[route] search loop"
//               log lines from real runs confirm it.
//
// The previous figures ($0.10–$0.40 research, $0.10–$0.25 decision makers)
// predated both measurements and quoted decision makers at about half its real
// token cost alone. Revisit these once search counts are in, and again once the
// api_usage ledger records searches — see docs/prospectlord/BACKLOG.md.

export const COST_HINTS = {
  // Sonnet 4.6 search loop (company, news, fit) + emit call
  research: 'roughly $0.40–$0.65 from your Anthropic key',

  // Sonnet 4.6 single call, email only — no web search
  refreshEmail: 'roughly $0.01–$0.02 from your Anthropic key',

  // Same route and cost as research. Not yet shown anywhere — RebuildBriefButton
  // is its natural home; see the backlog item on unpriced generative buttons.
  refresh: 'roughly $0.40–$0.65 from your Anthropic key',

  // Sonnet 4.6 search loop grounded on the stage 1 brief + emit call. Measured
  // token cost is about the same as research — it reads a large cached prefix
  // and searches just as hard.
  decisionMakers: 'roughly $0.40–$0.65 from your Anthropic key',

  // Sonnet 4.6 single call, note history + brief context
  followUp: 'roughly $0.02–$0.06 from your Anthropic key',
} as const

export type CostHintKey = keyof typeof COST_HINTS
