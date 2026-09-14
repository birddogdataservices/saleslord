// Tests for logUsage — the one place a cost reaches api_usage.
//
//   pnpm test
//
// logUsage is where web search went missing: the API reported a search count on
// every call and nothing wrote it down. These pin the row that gets written, the
// cost that gets returned (routes hand it back, and withJob puts it on the job
// the rep sees), and that a failed insert is surfaced rather than swallowed — a
// lost row also drops out of checkDailyLimit, which counts these rows.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logUsage, USAGE_ENDPOINT } from './api-usage'
import { calculateCost } from './utils'

type Row = Record<string, unknown>

function stubClient(error: { message: string } | null = null) {
  const inserts: { table: string; row: Row }[] = []
  const client = {
    from(table: string) {
      return {
        async insert(row: Row) {
          inserts.push({ table, row })
          return { error }
        },
      }
    },
  } as unknown as SupabaseClient
  return { client, inserts }
}

const searchRun = {
  userId:            'user-1',
  prospectId:        'prospect-1',
  endpoint:          USAGE_ENDPOINT.CHECK_UPDATES,
  model:             'claude-sonnet-4-6',
  inputTokens:       1_000,
  outputTokens:      2_000,
  cacheReadTokens:   50_000,
  cacheWriteTokens:  4_000,
  webSearchRequests: 9,
}

test('records the search count and prices it into cost_usd', async () => {
  const { client, inserts } = stubClient()
  const cost = await logUsage(client, searchRun)

  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].table, 'api_usage')
  assert.equal(inserts[0].row.web_search_requests, 9)
  assert.equal(inserts[0].row.cost_usd, cost)

  const tokensOnly = calculateCost('claude-sonnet-4-6', 1_000, 2_000, 50_000, 4_000)
  assert.ok(Math.abs(cost - tokensOnly - 0.09) < 1e-9, `9 searches should add $0.09, added ${cost - tokensOnly}`)
})

test('writes an explicit 0 for a route that does not search — never null', async () => {
  // NULL in this column means "not recorded" (pre-migration rows, CELord's direct
  // inserts). A ProspectLord route always knows its count, so it must say so.
  const { client, inserts } = stubClient()
  await logUsage(client, { ...searchRun, endpoint: USAGE_ENDPOINT.RESOLVE, webSearchRequests: 0 })
  assert.equal(inserts[0].row.web_search_requests, 0)
})

test('input_tokens stays a volume figure: uncached + cache read + cache write', async () => {
  const { client, inserts } = stubClient()
  await logUsage(client, searchRun)
  assert.equal(inserts[0].row.input_tokens, 1_000 + 50_000 + 4_000)
})

test('a failed insert is surfaced, not thrown, and still returns the cost', async () => {
  // The Anthropic call already happened and was paid for. Throwing would lose the
  // rep's result as well; staying silent is how rows used to vanish from both the
  // ledger and the runaway guard.
  const { client } = stubClient({ message: 'column "web_search_requests" does not exist' })
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => { logged.push(args) }
  let cost = 0
  try {
    cost = await logUsage(client, searchRun)
  } finally {
    console.error = original
  }
  assert.ok(cost > 0)
  assert.equal(logged.length, 1)
  assert.match(String(logged[0][0]), /check-updates.*NOT recorded/)
  assert.match(String(logged[0][1]), /does not exist/)
})
