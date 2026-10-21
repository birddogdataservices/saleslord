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
// The search calls STREAM, and the route deadline is the one bound on them:
// each call runs until the model finishes or the deadline arrives, whichever is
// first. At the deadline the call is cut short and keeps every search result it
// has already received — see runSearchLoop.
//
// History: until 2026-10-21 the search calls were non-streaming with a 120s
// per-call timeout. A non-streaming call that times out returns NOTHING, so a
// heavy prospect (Lockheed Martin, twice) whose first call ran past 120s lost
// every search it had paid for and failed with a 504. Before that, 90s with 1
// retry failed at exactly 3:03 — 90s attempt + 90s retry + setup. A per-call
// cap also never bounded the route: a continuation starting at 199s could run
// another 120s past a 200s deadline.

// Client-level timeout. On a STREAMED call the SDK arms this around the fetch
// only — it bounds the wait for response headers, not the stream — so for the
// search calls it is a connection guard and the deadline does the real work.
// On non-streamed calls it is the whole-call ceiling (generateStructured
// overrides it with EMIT_TIMEOUT_MS). The SDK default is 10 minutes.
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

// Search-phase wall clock: no continuation starts past it, and a call still
// streaming when it arrives is cut short. Each sits under its route's
// vercel.json maxDuration with room for the emit call and the writes after it.
//
// Worst case for research: search phase ends at 200s, emit 60s → ~260s against
// a 300s limit.
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
// Each call STREAMS, so it can be cut short at the deadline without losing what
// it gathered. A cut-short call keeps its complete content blocks — text so far
// and every search result already received — and the loop stops there. Only a
// call with nothing usable at all fails.
//
// All three search routes (research, decision-makers, check-updates) and the
// A/B harness run THIS function. That is the point: the harness measures the
// same control flow production executes, and web-search.test.ts covers it
// offline for free. Do not reintroduce a local copy in a route.

// Structurally what the loop needs from a client. Narrower than Anthropic so a
// test can supply a stub without a network call or an API key — the loop is our
// control flow, and control flow should not cost $0.75 to verify.
//
// The SDK's MessageStream satisfies SearchStream: finalMessage() rejects once
// abort() is called, and currentMessage is the snapshot accumulated so far.
export type SearchStream = {
  finalMessage(): Promise<any>                                 // eslint-disable-line @typescript-eslint/no-explicit-any
  abort(): void
  readonly currentMessage: any                                 // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type SearchLoopClient = {
  messages: { stream(body: any, options?: any): SearchStream }  // eslint-disable-line @typescript-eslint/no-explicit-any
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
  // Server-side tool calls. web_search_requests is BILLED SEPARATELY from
  // tokens — $10 per 1,000 searches. Routes sum it through onUsage and pass it
  // to logUsage, which records it in api_usage.web_search_requests and prices
  // it into cost_usd. One search is one use regardless of results.
  server_tool_use?: { web_search_requests?: number | null } | null
}

export type SearchLoopResult = {
  // Every assistant turn appended during the loop, in order. The FINAL turn is
  // not in here — it is `final` — because the loop appends a turn only when it
  // is about to continue past it. findingsFromAllTurns reads both.
  messages: { role: 'user' | 'assistant'; content: unknown }[]
  final: any                                                    // eslint-disable-line @typescript-eslint/no-explicit-any
  continuations: number
  // False when the model never finished its turn: a call was cut short at the
  // deadline, or the loop stopped on a pause_turn. Its closing write-up — the
  // text findings are normally read from — was never produced, so the emit call
  // needs the raw search results instead. See findingsForEmit.
  complete: boolean
}

// What a call that was cut short at the deadline leaves behind.
type CallOutcome =
  | { kind: 'done'; message: any }                              // eslint-disable-line @typescript-eslint/no-explicit-any
  | { kind: 'cut'; message: any; error: unknown }               // eslint-disable-line @typescript-eslint/no-explicit-any

// One streamed call, aborted at the deadline. A deadline abort returns the
// snapshot instead of throwing; any other failure (429, 5xx, network) throws as
// before, because there is no partial result to speak of.
async function streamCall(client: SearchLoopClient, body: unknown, budgetMs: number): Promise<CallOutcome> {
  const stream = client.messages.stream(body)
  let cut = false
  const timer = setTimeout(() => { cut = true; stream.abort() }, Math.max(budgetMs, 0))
  try {
    return { kind: 'done', message: await stream.finalMessage() }
  } catch (error) {
    if (!cut) throw error
    return { kind: 'cut', message: stream.currentMessage ?? null, error }
  } finally {
    clearTimeout(timer)
  }
}

// The content blocks of a turn that are safe to hand back to the API.
//
// A streamed snapshot can end mid-block. Text is kept even if partial — it is
// still text. A server_tool_use is kept only once its web_search_tool_result has
// arrived (results arrive whole), because a search with no result is an
// incomplete exchange the API rejects. Anything else — thinking blocks without
// their signature, unknown types — is dropped.
export function usableBlocks(content: unknown[]): any[] {      // eslint-disable-line @typescript-eslint/no-explicit-any
  const blocks = (content ?? []) as any[]                      // eslint-disable-line @typescript-eslint/no-explicit-any
  const answered = new Set(
    blocks.filter(b => b?.type === 'web_search_tool_result').map(b => b.tool_use_id),
  )
  return blocks.filter(b =>
    (b?.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '') ||
    (b?.type === 'server_tool_use' && answered.has(b.id)) ||
    b?.type === 'web_search_tool_result',
  )
}

// Usage for a call cut short. The snapshot's usage is what message_start
// reported; the totals arrive in message_delta at the very end, which a cut
// call never reaches. So input/output tokens here are a LOWER BOUND. The search
// count is exact — one web_search_tool_result per billed search.
function cutShortUsage(snapshot: any): AnthropicUsage {         // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    ...(snapshot?.usage ?? { input_tokens: 0, output_tokens: 0 }),
    server_tool_use: {
      web_search_requests: (snapshot?.content ?? []).filter((b: any) => b?.type === 'web_search_tool_result').length,  // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  }
}

export async function runSearchLoop(opts: SearchLoopOptions): Promise<SearchLoopResult> {
  const now = opts.now ?? Date.now
  const startedAt = opts.startedAt ?? now()
  const deadlineAt = startedAt + opts.deadlineMs

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

  // The FIRST call is the one that cannot fail safely. A non-deadline failure
  // propagates, and so does a deadline cut that gathered nothing usable — but
  // its usage is reported first, because a cut call was still billed.
  const first = await streamCall(opts.client, { ...body, messages }, deadlineAt - now())
  let response: any                                             // eslint-disable-line @typescript-eslint/no-explicit-any
  if (first.kind === 'cut') {
    if (first.message) opts.onUsage?.(cutShortUsage(first.message))
    const kept = usableBlocks(first.message?.content)
    if (kept.length === 0) throw first.error
    return {
      messages,
      final: { ...first.message, content: kept },
      continuations: 0,
      complete: false,
    }
  }
  response = first.message
  opts.onUsage?.(response.usage)

  let continuations = 0
  let complete = true
  while (
    response.stop_reason === 'pause_turn' &&
    continuations < opts.maxContinuations &&
    now() < deadlineAt
  ) {
    continuations++
    messages.push({ role: 'assistant', content: response.content })

    // Continuations are best-effort enrichment, not all-or-nothing. A rep who
    // waited two minutes deserves a thinner brief, not an error — so a failed
    // or cut-short continuation keeps what was gathered and stops.
    //
    // When it yields nothing new, the turn just pushed is un-pushed: it stays
    // `final`, and leaving it in `messages` too would compose it twice.
    let next: CallOutcome
    try {
      next = await streamCall(opts.client, { ...body, messages }, deadlineAt - now())
    } catch {
      messages.pop()
      break
    }
    if (next.kind === 'cut') {
      complete = false
      if (next.message) opts.onUsage?.(cutShortUsage(next.message))
      const kept = usableBlocks(next.message?.content)
      if (kept.length > 0) response = { ...next.message, content: kept }
      else messages.pop()
      break
    }
    response = next.message
    opts.onUsage?.(response.usage)
  }

  // Stopped while the model still wanted to continue — capped by count or by
  // the deadline check above. Its write-up was never produced either.
  if (response.stop_reason === 'pause_turn') complete = false

  return { messages, final: response, continuations, complete }
}

// Text from every assistant turn, in order — the ONE way findings are composed.
//
// decision-makers and check-updates used to read only the final turn. That was
// never a decision, and it was a bug: when a continuation is cut short by the
// deadline or a timeout, the earlier turns are all there is, and reading the
// last one silently discarded every search paid for before it — producing a
// thin answer that looks like a normal one. The rep cannot tell.
//
// At zero continuations this returns exactly the final turn's text, so the two
// old behaviours coincide on the path live runs actually take (all four runs of
// the 2026-09-11 baseline made a single search call). The difference only
// appears once pause_turn fires, which is where the old behaviour lost data.
export function findingsFromAllTurns(result: SearchLoopResult): string {
  const earlier = result.messages
    .filter(m => m.role === 'assistant')
    .flatMap(m => (Array.isArray(m.content) ? m.content : []))
    .map(b => (typeof b === 'object' && b !== null && 'type' in b && (b as any).type === 'text' ? (b as { text: string }).text : ''))  // eslint-disable-line @typescript-eslint/no-explicit-any
  const last = (result.final.content ?? []).map((b: any) => (b.type === 'text' ? b.text : ''))  // eslint-disable-line @typescript-eslint/no-explicit-any
  return [...earlier, ...last].filter(Boolean).join('\n').trim()
}

// The assistant turn handed to the emit call, plus any tool declarations that
// turn needs.
//
// Complete run: the findings TEXT, exactly as before. The model's closing
// write-up already distils every search, and re-sending raw results would
// multiply the emit call's input for nothing.
//
// Incomplete run: the write-up was never produced. Between searches the model
// writes little more than "Let me look for X", so the text alone is close to
// empty — composing from it would produce a brief that looks normal and says
// nothing. The search results themselves are what was paid for, so the emit
// call gets the usable content blocks of every turn. Those include
// server_tool_use blocks, which is why web_search is declared alongside them;
// the emit call's forced tool_choice means it cannot actually search.
export function findingsForEmit(
  result: SearchLoopResult,
  fallback: string,
): { content: string | any[]; tools: object[] } {             // eslint-disable-line @typescript-eslint/no-explicit-any
  if (result.complete) {
    return { content: findingsFromAllTurns(result) || fallback, tools: [] }
  }
  const blocks = usableBlocks([
    ...result.messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => (Array.isArray(m.content) ? m.content : [])),
    ...(result.final.content ?? []),
  ])
  return blocks.length > 0
    ? { content: blocks, tools: [webSearchTool()] }
    : { content: fallback, tools: [] }
}
