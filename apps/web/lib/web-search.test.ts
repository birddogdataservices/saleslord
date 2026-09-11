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
import { runSearchLoop, findingsFromAllTurns, findingsFromFinalTurn, type SearchLoopClient } from './web-search'

// ─────────────────────────────────────────────────────────────────────────────
// Stub client
// ─────────────────────────────────────────────────────────────────────────────

const usage = { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 }

function reply(stopReason: string, text: string) {
  return { stop_reason: stopReason, content: [{ type: 'text', text }], usage }
}

// Returns the scripted replies in order. Anything past the end throws, which is
// itself the assertion that the loop did not call more times than expected.
//
// Bodies are SNAPSHOT at call time, not stored by reference. The loop reuses one
// `messages` array and mutates it between calls, so a stored reference would show
// every call holding the final conversation. (Harmless in production — the SDK
// serializes the body synchronously inside create() — but it makes "what was sent
// on call 1" unassertable unless copied here.)
function stubClient(replies: unknown[]) {
  const bodies: any[] = []
  const client: SearchLoopClient = {
    messages: {
      async create(body: any) {
        bodies.push(structuredClone(body))
        if (bodies.length > replies.length) {
          throw new Error(`loop called ${bodies.length}x, only ${replies.length} replies scripted`)
        }
        const r = replies[bodies.length - 1]
        if (r instanceof Error) throw r
        return r
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
  const r = await runSearchLoop({
    ...base, client,
    maxContinuations: 6,
    deadlineMs: 150,
    now: () => (clock += 100),   // 100ms per check: passes once, then over budget
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
  assert.match(findingsFromAllTurns(r), /kept one/)
  assert.match(findingsFromAllTurns(r), /kept two/)
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

test('findingsFromFinalTurn reads only the last turn', async () => {
  // Mirrors what decision-makers and check-updates do today. Documented as a
  // backlog item, asserted here so a silent change to either is visible.
  const { client } = stubClient([
    reply('pause_turn', 'dropped'),
    reply('end_turn', 'kept'),
  ])
  const r = await runSearchLoop({ ...base, client })

  assert.equal(findingsFromFinalTurn(r), 'kept')
  assert.equal(findingsFromAllTurns(r), 'dropped\nkept')
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
