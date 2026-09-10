// The Anthropic server-side web search tool, defined once.
//
// This declaration was copy-pasted into four call sites across the research and
// check-updates routes. Bumping the tool version meant finding all four, which
// is precisely the drift docs/prospectlord/MODEL-UPGRADES.md exists to prevent.
//
// Version history:
//   web_search_20250305 — basic search. What ProspectLord shipped on.
//   web_search_20260209 — adds dynamic result filtering. Requires Sonnet 4.6 or
//     later (also Opus 4.6+ / Sonnet 5). Result quality is upstream of citation
//     quality, which is the metric the 2026-09-08 model comparison turned on.
//
// Server-side only: imported by API route handlers.

// 2026-09-09: reverted from web_search_20260209 back to the basic variant.
// The 2026 tool runs code execution internally for its dynamic result
// filtering, so each search does materially more work. Combined with a raised
// max_uses and prompt rules demanding exhaustive search, a single call ran past
// 15 minutes and returned nothing. Three variables changed at once, none
// measured. Back to what the 2026-09-08 baseline actually ran on.
//
// The 2026 variant may well be better — it is the reason citation quality was
// worth testing at all — but it goes back in one change at a time, with a
// harness run behind it. See docs/prospectlord/MODEL-UPGRADES.md.
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305'

// MODEL CONSTRAINT: web_search_20260209 requires Opus 4.6+ or Sonnet 4.6+.
// Haiku 4.5 supports only the basic web_search_20250305. So the search routes
// (research, decision-makers, check-updates) cannot be moved to Haiku without
// also reverting the tool version here — which forfeits dynamic result
// filtering, and result quality is upstream of citation quality. The cheap
// Haiku routes (email, pitch-opener, resolve) do not search at all, which is
// why they can be Haiku.

// Ceiling on searches per API call, not a floor — the model stops when it judges
// it has enough, and the prompt's research rules are what push it to look harder.
//
// Set deliberately high. The point is that the budget is an explicit decision
// with a known value rather than whatever the API defaults to; it is NOT meant to
// throttle below the behaviour that produced good briefs. If a re-baseline run
// shows fewer searches than before, this is the first thing to suspect.
// 2026-09-09: these were 15 / 8, set "deliberately high" as a ceiling rather
// than a throttle. That was wrong. Combined with the Phase 0 rules telling the
// model to keep searching until every section is sourced, a single API call ran
// past 15 minutes in local testing and returned nothing — on Vercel it would
// have been killed at 300s. max_uses is not a harmless ceiling: the model will
// use the budget it is given.
//
// Back to values near the API default, which is what produced the 180-200s runs
// measured on 2026-09-08. Raise only with a harness run to justify it.

// Per-call timeout. The SDK default is 10 minutes with 2 retries, so a slow call
// can block for ~30 minutes — far past any Vercel function limit, and the rep
// just watches a spinner. Fail fast and visibly instead.
export const ANTHROPIC_TIMEOUT_MS = 90_000
export const ANTHROPIC_MAX_RETRIES = 1

// Wall-clock budget for a whole multi-call route, checked between continuations.
// Counting continuations does not bound time; only time bounds time. Sits under
// the route's vercel.json maxDuration with headroom for the phase-2 emit call
// and the database writes that follow.
export const RESEARCH_DEADLINE_MS = 240_000        // route maxDuration 300s
export const CHECK_UPDATES_DEADLINE_MS = 240_000   // route maxDuration 300s
export const DECISION_MAKERS_DEADLINE_MS = 90_000  // route maxDuration 120s

// Finding named people is search-hungry in a different way than company
// research: many narrow lookups (leadership page, press release, speaker list,
// then verification) rather than a few broad ones. In the monolith this work
// had no budget of its own at all — it competed with company research inside
// one call, which is the leading suspect for the confabulation measured on
// 2026-09-08. Sized generously on purpose; verification costs searches.

// max_uses is deliberately NOT set. The 2026-09-08 baseline — 180-200s runs
// producing good briefs — ran with the API default. Setting it to 15 was an
// unforced change that helped cause a 15-minute call; setting it to 6 was a
// guess at the default. The real bound is time, not search count: see the
// per-call timeout and the route deadlines below.
export function webSearchTool() {
  return { type: WEB_SEARCH_TOOL_TYPE, name: 'web_search' }
}
