// Tests for calculateCost — the arithmetic behind every cost figure a rep sees.
//
//   pnpm test
//
// It had no tests, and it has been wrong twice in ways nothing flagged: dated
// model IDs silently fell through to Sonnet pricing (~3x on Haiku), and web
// search — billed per search on top of tokens — was never counted at all. Both
// are plain arithmetic, so both are free to pin down.
//
// Expected figures are Anthropic's published rates: Sonnet 4.6 at $3 / $15 per
// million tokens, cache reads at 0.1x input, 5-minute cache writes at 1.25x,
// and web search at $10 per 1,000 searches.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateCost, WEB_SEARCH_COST_PER_REQUEST } from './utils'

const M = 1_000_000

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`)
}

test('web search is priced at $10 per 1,000 searches', () => {
  close(WEB_SEARCH_COST_PER_REQUEST * 1000, 10)
})

test('searches are added on top of token cost, not instead of it', () => {
  close(calculateCost('claude-sonnet-4-6', M, M), 3 + 15)
  close(calculateCost('claude-sonnet-4-6', M, M, 0, 0, 9), 3 + 15 + 0.09)
})

test('omitting the search count leaves token pricing exactly as it was', () => {
  // CELord calls calculateCost positionally with tokens only. It must not move.
  close(
    calculateCost('claude-sonnet-4-6', 1_000, 2_000, 3_000, 4_000),
    calculateCost('claude-sonnet-4-6', 1_000, 2_000, 3_000, 4_000, 0),
  )
})

test('search cost does not depend on the model', () => {
  close(calculateCost('claude-haiku-4-5', 0, 0, 0, 0, 100), 1)
  close(calculateCost('claude-sonnet-4-6', 0, 0, 0, 0, 100), 1)
})

test('cache reads cost 0.1x input and 5-minute cache writes cost 1.25x', () => {
  close(calculateCost('claude-sonnet-4-6', 0, 0, M, 0), 0.30)
  close(calculateCost('claude-sonnet-4-6', 0, 0, 0, M), 3.75)
})

test('a dated model ID prices at its family rate', () => {
  close(calculateCost('claude-haiku-4-5-20251001', M, 0), calculateCost('claude-haiku-4-5', M, 0))
})
