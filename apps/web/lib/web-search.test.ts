// Tests for the pause_turn continuation loop.
//
//   pnpm test
//
// WHY THIS EXISTS
//
// The 2026-09-11 SDK upgrade (0.81 → 0.125) was verified with four live harness
// runs costing ~$3. Not one of them exercised this loop: the server-side search
// finished inside a single API call every time, so stop_reason was never
// 'pause_turn' and the continuation code never ran. Four real runs, $3 spent,
// zero coverage of the most fragile code in the app.
//
// Hunting for a prospect heavy enough to peg Anthropic's internal search ceiling
// is guesswork — the ceiling is undocumented and search volume varies per
// company. But the loop is OUR control flow, and control flow is deterministic.
// A stub client reproduces pause_turn on demand, for free, every time.
//
// What this does NOT cover: whether a live pause_turn response body still has
// the content shape we append. That needs one targeted live run. The API
// contract itself is stable — StopReason carried 'pause_turn' identically in
// both 0.81 and 0.125 (0.125 only adds 'model_context_window_exceeded').

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSearchLoop, findingsFromAllTurns, findingsForEmit, type SearchLoopClient } from './web-search'

// ─────────────────────────────────────────────────────────────────────────────
// Stub client
// ─────────────────────────────────────────────────────────────────────────────

const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 }

function reply(stopReason: string, text: string) {
  return { stop_reason: stopReason, content: [{ type: 'text', text }], usage }
}

// A call still streaming when the deadline arrives. `snapshot` is what the
// stream had accumulated — its finalMessage() never resolves on its own, only
// rejects once the loop aborts it, exactly like the SDK's MessageStream.
class Hang {
  constructor(public snapshot: unknown) {}
}

// One completed search: the call, its result, and the model's note after it.
function search(id: string, note?: string) {
  return [
    { type: 'server_tool_use', id, name: 'web_search', input: { query: `q ${id}` } },
    { type: 'web_search_tool_result', tool_use_id: id, content: [{ type: 'web_search_result', title: `r ${id}`, url: `https://x/${id}` }] },
    ...(note ? [{ type: 'text', text: note }] : []),
  ]
}

const startUsage = { input_tokens: 7, output_tokens: 1 }

// Returns the scripted replies in order. Anything past the end throws, which is
// itself the assertion that the loop did not call more times than expected.
//
// Bodies are SNAPSHOT at call time, not stored by reference. The loop reuses one
// `messages` array and mutates it between calls, so a stored reference would show
// every call holding the final conversation. (Harmless in production — the SDK
// serializes the body synchronously inside stream() — but it makes "what was sent
// on call 1" unassertable unless copied here.)
function stubClient(replies: unknown[]) {
  const bodies: any[] = []
  const client: SearchLoopClient = {
    messages: {
      stream(body: any) {
        bodies.push(structuredClone(body))
        if (bodies.length > replies.length) {
          throw new Error(`loop called ${bodies.length}x, only ${replies.length} replies scripted`)
        }
        const r = replies[bodies.length - 1]
        let abort = () => {}
        const final = r instanceof Hang
          ? new Promise((_, reject) => { abort = () => reject(new Error('Request was aborted.')) })
          : r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
        return {
          finalMessage: () => final,
          abort: () => abort(),
          currentMessage: r instanceof Hang ? r.snapshot : undefined,
        }
      },
    },
  }
  return { client, bodies }
}

const base = {
  model: 'claude-sonnet-4-6',
  system: 'SYSTEM',
  userTurn: 'Research Acme',
  maxTokens: 4096,
  maxContinuations: 6,
  deadlineMs: 200_000,
}

// ─────────────────────────────────────────────────────────────────────────────

test('stops after one call when the model finishes in one turn', async () => {
  // This is what all four live runs on 2026-09-11 actually did.
  const { client, bodies } = stubClient([reply('end_turn', 'done')])
  const r = await runSearchLoop({ ...base, client })

  assert.equal(r.continuations, 0)
  assert.equal(bodies.length, 1)
  assert.equal(findingsFromAllTurns(r), 'done')
})

test('continues on pause_turn until the model ends the turn', async () => {
  const { client, bodies } = stubClient([
    reply('pause_turn', 'first'),
    reply('pause_turn', 'second'),
    reply('end_turn', 'third'),
  ])
  const r = await runSearchLoop({ ...base, client })

  assert.equal(r.continuations, 2)
  assert.equal(bodies.length, 3)
  // The whole point of the loop: findings from every turn, not just the last.
  assert.equal(findingsFromAllTurns(r), 'first\nsecond\nthird')
})

test('re-sends the accumulated conversation, not just the latest turn', async () => {
  // A continuation that dropped prior turns would make the model start over.
  const { client, bodies } = stubClient([
    reply('pause_turn', 'first'),
    reply('end_turn', 'second'),
  ])
  await runSearchLoop({ ...base, client })

  assert.equal(bodies[0].messages.length, 1)
  assert.equal(bodies[1].messages.length, 2)
  assert.equal(bodies[1].messages[1].role, 'assistant')
  // No tool_results and no synthetic user turn — server-side tools take neither.
  assert.ok(!bodies[1].messages.some((m: any) => m.role === 'user' && Array.isArray(m.content)))
})

test('sends cache_control and the web search tool on every call', async () => {
  // If cache_control stopped being sent, cost would multiply silently — the
  // failure mode that has no error and no visible symptom.
  const { client, bodies } = stubClient([
    reply('pause_turn', 'first'),
    reply('end_turn', 'second'),
  ])
  await runSearchLoop({ ...base, client })

  for (const b of bodies) {
    assert.deepEqual(b.cache_control, { type: 'ephemeral' })
    assert.equal(b.tools[0].name, 'web_search')
    assert.equal(b.system, 'SYSTEM')
  }
})

test('honours maxContinuations', async () => {
  const { client, bodies } = stubClient([
    reply('pause_turn', 'a'),
    reply('pause_turn', 'b'),
    reply('pause_turn', 'c'),
  ])
  const r = await runSearchLoop({ ...base, client, maxContinuations: 2 })

  assert.equal(r.continuations, 2)
  assert.equal(bodies.length, 3)   // initial + 2 continuations, then the cap bites
})

test('honours the wall-clock deadline even when continuations remain', async () => {
  // Counting continuations does not bound time. This is the guard that keeps the
  // route inside vercel.json's maxDuration.
  let clock = 0
  const { client, bodies } = stubClient([
    reply('pause_turn', 'a'),
    reply('pause_turn', 'b'),
  ])
  // Each now() advances 100ms: start 100 (deadline 450), call 1 budgeted at
  // 200, check at 300 passes, call 2 budgeted at 400, check at 500 fails.
  const r = await runSearchLoop({
    ...base, client,
    maxContinuations: 6,
    deadlineMs: 350,
    now: () => (clock += 100),
  })

  assert.equal(r.continuations, 1)
  assert.equal(bodies.length, 2)
})

test('keeps findings gathered so far when a continuation throws', async () => {
  // The regression that matters most: a timeout on continuation 3 must not throw
  // away turns 1 and 2. A rep who waited deserves a thinner brief, not an error.
  const { client } = stubClient([
    reply('pause_turn', 'kept one'),
    reply('pause_turn', 'kept two'),
    new Error('Request timed out'),
  ])
  const r = await runSearchLoop({ ...base, client })

  assert.equal(r.continuations, 2)
  // Exact, not a match: the last good turn is `final`, and must not also be
  // left in `messages` where it would be composed twice.
  assert.equal(findingsFromAllTurns(r), 'kept one\nkept two')
  assert.equal(r.complete, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Streaming: cut short at the deadline
// ─────────────────────────────────────────────────────────────────────────────
// The Lockheed Martin failure, 2026-10-21: the first search call ran past the
// old 120s non-streaming timeout and returned nothing, so every search it had
// done was paid for and lost. These pin that a call cut short keeps them.

test('a first call cut short at the deadline keeps the searches it completed', async () => {
  const { client, bodies } = stubClient([
    new Hang({
      usage: startUsage,
      content: [
        { type: 'text', text: 'Researching Lockheed.' },
        ...search('a', 'Found the 10-K.'),
        ...search('b'),
        // In flight when the deadline hit: a call with no result yet.
        { type: 'server_tool_use', id: 'c', name: 'web_search', input: {} },
      ],
    }),
  ])
  const seen: any[] = []
  const r = await runSearchLoop({ ...base, client, deadlineMs: 20, onUsage: u => seen.push(u) })

  assert.equal(bodies.length, 1)
  assert.equal(r.complete, false)
  assert.equal(r.continuations, 0)
  const types = r.final.content.map((b: any) => b.type)
  assert.deepEqual(types, ['text', 'server_tool_use', 'web_search_tool_result', 'text', 'server_tool_use', 'web_search_tool_result'])
  // Billed searches counted exactly; tokens are message_start's lower bound.
  assert.equal(seen.length, 1)
  assert.equal(seen[0].server_tool_use.web_search_requests, 2)
  assert.equal(seen[0].input_tokens, 7)
})

test('a first call cut short with nothing usable still propagates', async () => {
  const { client } = stubClient([
    new Hang({ usage: startUsage, content: [{ type: 'server_tool_use', id: 'a', name: 'web_search', input: {} }] }),
  ])
  const seen: any[] = []
  await assert.rejects(
    () => runSearchLoop({ ...base, client, deadlineMs: 20, onUsage: u => seen.push(u) }),
    /aborted/,
  )
  // Still reported: the call was billed even though it produced nothing.
  assert.equal(seen.length, 1)
})

test('a continuation cut short keeps earlier turns and its own results, once each', async () => {
  const { client } = stubClient([
    reply('pause_turn', 'turn one'),
    new Hang({ usage: startUsage, content: [...search('a', 'partial note')] }),
  ])
  const r = await runSearchLoop({ ...base, client, deadlineMs: 20 })

  assert.equal(r.continuations, 1)
  assert.equal(r.complete, false)
  assert.equal(findingsFromAllTurns(r), 'turn one\npartial note')
})

test('a continuation cut short with nothing usable leaves the last good turn as final', async () => {
  const { client } = stubClient([
    reply('pause_turn', 'turn one'),
    new Hang({ usage: startUsage, content: [] }),
  ])
  const r = await runSearchLoop({ ...base, client, deadlineMs: 20 })

  assert.equal(findingsFromAllTurns(r), 'turn one')
  assert.equal(r.complete, false)
})

test('a call that finishes before the deadline is complete and not cut', async () => {
  const { client } = stubClient([reply('end_turn', 'done')])
  const r = await runSearchLoop({ ...base, client, deadlineMs: 5_000 })
  assert.equal(r.complete, true)
})

// ─────────────────────────────────────────────────────────────────────────────
// What the emit call receives
// ─────────────────────────────────────────────────────────────────────────────

test('a complete run hands the emit call its findings text, with no extra tools', async () => {
  const { client } = stubClient([reply('end_turn', 'the write-up')])
  const f = findingsForEmit(await runSearchLoop({ ...base, client }), 'FALLBACK')
  assert.equal(f.content, 'the write-up')
  assert.deepEqual(f.tools, [])
})

test('an incomplete run hands the emit call the raw search results, and declares web_search', async () => {
  // The write-up never happened, so the text is just "Let me look" — composing
  // from that alone would be a brief that looks normal and says nothing.
  const { client } = stubClient([
    new Hang({ usage: startUsage, content: [{ type: 'text', text: 'Let me look.' }, ...search('a'), { type: 'text', text: '' }] }),
  ])
  const f = findingsForEmit(await runSearchLoop({ ...base, client, deadlineMs: 20 }), 'FALLBACK')

  assert.ok(Array.isArray(f.content))
  const content = f.content as any[]
  assert.ok(content.some(b => b.type === 'web_search_tool_result'))
  // Empty text blocks are dropped — the API rejects them.
  assert.ok(!content.some(b => b.type === 'text' && b.text === ''))
  assert.equal((f.tools[0] as any).name, 'web_search')
})

test('an incomplete run stopped on pause_turn also hands over results from every turn', async () => {
  const { client } = stubClient([
    { stop_reason: 'pause_turn', content: [...search('a', 'one')], usage },
    { stop_reason: 'pause_turn', content: [...search('b', 'two')], usage },
  ])
  const r = await runSearchLoop({ ...base, client, maxContinuations: 1 })
  assert.equal(r.complete, false)

  const content = findingsForEmit(r, 'FALLBACK').content as any[]
  const results = content.filter(b => b.type === 'web_search_tool_result').map(b => b.tool_use_id)
  assert.deepEqual(results, ['a', 'b'])
})

test('a failed FIRST call still propagates — there is nothing to salvage', async () => {
  const { client } = stubClient([new Error('Request timed out')])
  await assert.rejects(() => runSearchLoop({ ...base, client }), /timed out/)
})

test('tallies usage once per successful call, and not for the failed one', async () => {
  const seen: number[] = []
  const { client } = stubClient([
    reply('pause_turn', 'a'),
    reply('pause_turn', 'b'),
    new Error('boom'),
  ])
  await runSearchLoop({ ...base, client, onUsage: u => seen.push(u.input_tokens) })

  assert.deepEqual(seen, [10, 10])
})

test('at zero continuations, all-turn findings ARE the final turn', async () => {
  // This is what made the decision-makers / check-updates switch to all-turn
  // findings safe to land without its own live measurement. Both routes used to
  // read only response.content; when the loop makes a single call — which is
  // what every stage of all four 2026-09-11 baseline runs did — the composed
  // string is byte-identical to that. The behaviour only diverges once
  // pause_turn fires, and that is the case the old code got wrong.
  const { client } = stubClient([reply('end_turn', 'only turn')])
  const r = await runSearchLoop({ ...base, client })

  assert.equal(r.continuations, 0)
  assert.deepEqual(r.messages.filter(m => m.role === 'assistant'), [])
  assert.equal(findingsFromAllTurns(r), 'only turn')
})

test('a cut-short run keeps the turns the old final-turn read discarded', async () => {
  // The bug this replaced: three search calls paid for, two of them thrown away
  // because the deadline stopped the loop and only the last turn was read.
  const { client } = stubClient([
    reply('pause_turn', 'turn one'),
    reply('pause_turn', 'turn two'),
    reply('pause_turn', 'turn three'),
  ])
  const r = await runSearchLoop({ ...base, client, maxContinuations: 2 })

  const composed = findingsFromAllTurns(r)
  assert.match(composed, /turn one/)
  assert.match(composed, /turn two/)
  assert.match(composed, /turn three/)
})

test('passes thinking and effort through when set, and omits them when not', async () => {
  // The harness sets these. A config that silently drops them measures something
  // nobody would ship — see MODEL-UPGRADES.md, "how to invalidate your own A/B".
  const a = stubClient([reply('end_turn', 'x')])
  await runSearchLoop({ ...base, client: a.client, thinking: { type: 'adaptive' }, effort: 'high' })
  assert.deepEqual(a.bodies[0].thinking, { type: 'adaptive' })
  assert.deepEqual(a.bodies[0].output_config, { effort: 'high' })

  const b = stubClient([reply('end_turn', 'x')])
  await runSearchLoop({ ...base, client: b.client })
  assert.ok(!('thinking' in b.bodies[0]))
  assert.ok(!('output_config' in b.bodies[0]))
})
