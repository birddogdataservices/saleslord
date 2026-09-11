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

// ─────────────────────────────────────────────────────────────────────────────
// The continuation loop
// ─────────────────────────────────────────────────────────────────────────────
// web_search is a SERVER-side tool: the searches run inside a single API call,
// so stop_reason is never 'tool_use'. When Anthropic's internal search loop hits
// its ceiling mid-turn the call returns early with stop_reason 'pause_turn',
// meaning "not finished — send this back and I will carry on". Continue by
// appending the assistant content and re-sending: no tool_results, no extra user
// message.
//
// If nothing handles that flag, a paused run simply stops and the brief gets
// composed from half the research — silently, looking like a normal brief.
//
// Bounded by BOTH a continuation count and a wall clock, because counting
// continuations does not bound time: a single call can run for minutes.
//
// STATUS: the routes still inline their own copies of this. This is the shared
// version, currently used by the A/B harness and covered by web-search.test.ts.
// Migrating research/decision-makers/check-updates onto it is a follow-up that
// needs its own measured harness run — see docs/prospectlord/HANDOFF.md.

// Structurally what the loop needs from a client. Narrower than Anthropic so a
// test can supply a stub without a network call or an API key — the loop is our
// control flow, and control flow should not cost $0.75 to verify.
export type SearchLoopClient = {
  messages: { create(body: any, options?: any): Promise<any> }  // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type SearchLoopOptions = {
  client: SearchLoopClient
  model: string
  system: string
  userTurn: string
  maxTokens: number
  maxContinuations: number
  deadlineMs: number
  thinking?: { type: 'disabled' } | { type: 'adaptive' }
  effort?: 'low' | 'medium' | 'high' | 'xhigh'
  // Called once per successful call so the caller can tally tokens.
  onUsage?: (usage: AnthropicUsage) => void
  // Injectable clock. Production leaves it alone; the test drives the deadline
  // without waiting 200 real seconds for it.
  now?: () => number
  startedAt?: number
}

type AnthropicUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export type SearchLoopResult = {
  // Every assistant turn appended during the loop, in order. The FINAL turn is
  // deliberately not in here — it is `final` — so callers choose whether to
  // compose from all turns or only the last.
  messages: { role: 'user' | 'assistant'; content: unknown }[]
  final: any                                                    // eslint-disable-line @typescript-eslint/no-explicit-any
  continuations: number
}

export async function runSearchLoop(opts: SearchLoopOptions): Promise<SearchLoopResult> {
  const now = opts.now ?? Date.now
  const startedAt = opts.startedAt ?? now()

  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [
    { role: 'user', content: opts.userTurn },
  ]

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    // Top-level cache_control marks the last cacheable block automatically, so
    // the prefix is re-read at ~0.1x on every continuation and by the emit call.
    cache_control: { type: 'ephemeral' },
    tools: [webSearchTool()],
  }
  if (opts.thinking) body.thinking = opts.thinking
  if (opts.effort) body.output_config = { effort: opts.effort }

  let response = await opts.client.messages.create({ ...body, messages })
  opts.onUsage?.(response.usage)

  let continuations = 0
  while (
    response.stop_reason === 'pause_turn' &&
    continuations < opts.maxContinuations &&
    now() - startedAt < opts.deadlineMs
  ) {
    continuations++
    messages.push({ role: 'assistant', content: response.content })

    // Continuations are best-effort enrichment, not all-or-nothing. A rep who
    // waited two minutes deserves a thinner brief, not an error — so a failed
    // continuation keeps what was gathered and stops.
    let next
    try {
      next = await opts.client.messages.create({ ...body, messages })
    } catch {
      break
    }
    response = next
    opts.onUsage?.(response.usage)
  }

  return { messages, final: response, continuations }
}

// Text from every assistant turn, in order — what research composes from. When a
// continuation is cut short, the earlier turns are all there is.
export function findingsFromAllTurns(result: SearchLoopResult): string {
  const earlier = result.messages
    .filter(m => m.role === 'assistant')
    .flatMap(m => (Array.isArray(m.content) ? m.content : []))
    .map(b => (typeof b === 'object' && b !== null && 'type' in b && (b as any).type === 'text' ? (b as { text: string }).text : ''))  // eslint-disable-line @typescript-eslint/no-explicit-any
  const last = (result.final.content ?? []).map((b: any) => (b.type === 'text' ? b.text : ''))  // eslint-disable-line @typescript-eslint/no-explicit-any
  return [...earlier, ...last].filter(Boolean).join('\n').trim()
}

// Text from the final turn only — what decision-makers and check-updates do
// today. Kept distinct rather than unified so the harness can mirror each route
// exactly; see the backlog note about the two routes dropping earlier findings.
export function findingsFromFinalTurn(result: SearchLoopResult): string {
  return (result.final.content ?? []).map((b: any) => (b.type === 'text' ? b.text : '')).join('\n').trim()  // eslint-disable-line @typescript-eslint/no-explicit-any
}
