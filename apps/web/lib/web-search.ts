// The Anthropic server-side web search tool and the time budgets that bound the
// routes using it. Defined once — the tool declaration was previously
// copy-pasted to four call sites, which is the drift
// docs/prospectlord/MODEL-UPGRADES.md exists to prevent.
//
// Server-side only: imported by API route handlers.

// ─────────────────────────────────────────────────────────────────────────────
// Tool version
// ─────────────────────────────────────────────────────────────────────────────
// web_search_20250305 — basic search. What ProspectLord has always shipped on,
//   and what the 2026-09-08 baseline (180-200s runs, good briefs) measured.
// web_search_20260209 — adds dynamic result filtering, but runs code execution
//   internally to do it, so every search does materially more work. Briefly
//   adopted on 2026-09-09 alongside a raised max_uses and prompt rules demanding
//   exhaustive search; a single call then ran past 15 minutes and returned
//   nothing. Three variables, none measured, all reverted.
//
// The 2026 variant may well be better — result quality is upstream of citation
// quality, which is what the model comparison turned on. It goes back in ONE
// CHANGE AT A TIME with a harness run behind it.
//
// MODEL CONSTRAINT: web_search_20260209 needs Opus 4.6+ or Sonnet 4.6+. Haiku
// 4.5 supports only the basic variant, so the search routes cannot move to
// Haiku without also reverting the version here. The cheap Haiku routes (email,
// pitch-opener, resolve) do no searching, which is why they can be Haiku.
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305'

// max_uses is deliberately NOT set. The baseline ran on the API default.
// Setting it to 15 helped cause the 15-minute call; setting it to 6 was a guess
// at the default. The model spends whatever budget it is given, so the real
// bound is time — see below — not search count.
export function webSearchTool() {
  return { type: WEB_SEARCH_TOOL_TYPE, name: 'web_search' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Time budgets
// ─────────────────────────────────────────────────────────────────────────────
// Two independent guards, because they fail differently:
//
//   timeout   — caps ONE call. Stops a single slow call hanging the route.
//   deadline  — caps the WHOLE route. Stops many acceptable calls adding up
//               past the Vercel function limit.
//
// Neither alone is enough. Counting continuations bounds neither.

// Per-call ceiling for the search calls. The SDK default is 10 minutes, which
// is far past any Vercel limit — a rep would just watch a spinner.
//
// History: 90s with 1 retry produced a production failure at exactly 3:03 —
// 90s attempt + 90s retry + setup. The first search call does the bulk of the
// work and crossed 90s on Vercel, which is slower than a laptop.
export const ANTHROPIC_TIMEOUT_MS = 120_000

// Zero retries, deliberately. The SDK retries timeouts, and retrying a call
// that failed for being TOO SLOW just spends the budget twice for the same
// result — it turns one slow call into a guaranteed double-length failure.
// Retries earn their keep on fast failures (429, 5xx), not on these.
export const ANTHROPIC_MAX_RETRIES = 0

// The phase-2 emit call does no searching — it reformats findings the model
// already holds — so it gets a much shorter leash. Keeping it separate is what
// lets the search budget stay generous without risking the ceiling.
export const EMIT_TIMEOUT_MS = 60_000

// Whole-route wall clock, checked between continuations. Each sits under its
// route's vercel.json maxDuration with room for the emit call and the writes
// that follow it.
//
// Worst case for research: first call 120s, deadline stops continuations at
// 200s, emit 60s → ~260s against a 300s limit.
export const RESEARCH_DEADLINE_MS = 200_000        // maxDuration 300s
export const CHECK_UPDATES_DEADLINE_MS = 200_000   // maxDuration 300s
export const DECISION_MAKERS_DEADLINE_MS = 150_000 // maxDuration 300s
