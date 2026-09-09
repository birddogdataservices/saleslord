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

export const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209'

// Ceiling on searches per API call, not a floor — the model stops when it judges
// it has enough, and the prompt's research rules are what push it to look harder.
//
// Set deliberately high. The point is that the budget is an explicit decision
// with a known value rather than whatever the API defaults to; it is NOT meant to
// throttle below the behaviour that produced good briefs. If a re-baseline run
// shows fewer searches than before, this is the first thing to suspect.
export const RESEARCH_MAX_USES = 15
export const CHECK_UPDATES_MAX_USES = 8

// Finding named people is search-hungry in a different way than company
// research: many narrow lookups (leadership page, press release, speaker list,
// then verification) rather than a few broad ones. In the monolith this work
// had no budget of its own at all — it competed with company research inside
// one call, which is the leading suspect for the confabulation measured on
// 2026-09-08. Sized generously on purpose; verification costs searches.
export const DECISION_MAKERS_MAX_USES = 12

export function webSearchTool(maxUses: number) {
  return { type: WEB_SEARCH_TOOL_TYPE, name: 'web_search', max_uses: maxUses }
}
