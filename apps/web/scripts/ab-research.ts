// A/B harness for the staged research flow.
//
//   pnpm ab:research "Snowflake"                      # stage 1 + stage 2, production config
//   pnpm ab:research "Snowflake" --stages 1           # stage 1 only
//   pnpm ab:research "Snowflake" --stages 2           # stage 2 only, grounded on the stored brief
//   pnpm ab:research "Snowflake" --repeat 2           # runs per config
//   pnpm ab:research "Snowflake" --configs a,d        # model comparison (see CONFIGS)
//
// WHAT THIS MEASURES
//
// Research was split in v1.7.0 into two rep-triggered stages, and this harness
// measures them the way the app runs them — separately:
//
//   stage 1  POST /api/research         company, news, fit
//   stage 2  POST /api/decision-makers  named people, grounded on the stage 1 brief
//
// Each stage is timed and priced on its own. A combined number hides which half
// moved, and the two stages have different search budgets, different deadlines
// and different continuation caps — averaging them measures nothing the app does.
//
// Stage 2 needs a stage 1 brief to ground on. Running both stages feeds stage 1's
// in-memory brief straight into stage 2, exactly as production reads the row it
// just wrote. Running `--stages 2` alone reads the prospect's latest stored brief
// instead, so stage 2 can be measured without paying for stage 1 again.
//
// FIDELITY
//
// This runs the REAL prompts (lib/research-prompt.ts, lib/decision-makers-prompt.ts),
// the REAL emit path (lib/structured-output.ts), the REAL tool declaration and time
// budgets (lib/web-search.ts), and the REAL rep context (your profile, products and
// team targeting config, read from Supabase). Anything copied or invented here would
// measure a flow that does not ship. When you change a route, change this too.
//
// Writes nothing. No prospect, no brief, no decision makers, no api_usage row, no
// rate-limit consumption — this is an experiment, not a research run. Output goes to
// ./ab-results/<timestamp>/ as one JSON per run plus a summary table.
//
// THIS SPENDS REAL MONEY on the key in ANTHROPIC_API_KEY. The script prints the
// plan and waits for confirmation before making a single call.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { buildSystemPrompt } from '../lib/research-prompt'
import { buildDecisionMakersPrompt, type RawDecisionMaker } from '../lib/decision-makers-prompt'
import { buildProductsBlock, type ProductForPrompt } from '../lib/prospect-context'
import { generateStructured } from '../lib/structured-output'
import { languageDirective, JSON_LANGUAGE_RULE } from '../lib/i18n/languages'
import {
  webSearchTool, ANTHROPIC_TIMEOUT_MS, ANTHROPIC_MAX_RETRIES, EMIT_TIMEOUT_MS,
  RESEARCH_DEADLINE_MS, DECISION_MAKERS_DEADLINE_MS,
} from '../lib/web-search'
import { calculateCost } from '../lib/utils'
import type { ProductPromptContext } from '../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// The configurations under test
// ─────────────────────────────────────────────────────────────────────────────
// Config `a` is production and is the DEFAULT — a bare invocation re-baselines
// what ships rather than quietly spending on models nobody has decided to adopt.
// The rest are opt-in via --configs, for the model evaluation in MODEL-UPGRADES.md.
//
// Sonnet 5 is not a drop-in: it runs adaptive thinking by default, and thinking
// bills as output. Each config therefore states its thinking posture explicitly
// rather than inheriting a default nobody checked.

type Config = {
  id: string
  label: string
  model: string
  thinking?: { type: 'disabled' } | { type: 'adaptive' }
  effort?: 'low' | 'medium' | 'high' | 'xhigh'
  // Search-loop cap. Both routes ship 4096; a thinking model needs headroom,
  // because thinking bills against the same ceiling as the visible answer.
  searchMaxTokens: number
  note: string
}

const CONFIGS: Config[] = [
  {
    id: 'a',
    label: 'Sonnet 4.6 (production)',
    model: 'claude-sonnet-4-6',
    searchMaxTokens: 4096,
    note: 'Baseline — exactly what both routes run today.',
  },
  {
    id: 'b',
    label: 'Sonnet 5, thinking off',
    model: 'claude-sonnet-5',
    thinking: { type: 'disabled' },
    searchMaxTokens: 4096,
    note: 'Closest match to current behaviour. Sonnet 5 is built around adaptive thinking, so this runs it below its defaults — read the number with that in mind.',
  },
  {
    id: 'c',
    label: 'Sonnet 5, adaptive thinking, effort medium',
    model: 'claude-sonnet-5',
    thinking: { type: 'adaptive' },
    effort: 'medium',
    searchMaxTokens: 16000,
    note: 'NOTE: effort medium is BELOW Sonnet 5\'s default of high. Kept only to reproduce the 2026-09-08 baseline run — prefer config d for a fair read of the model.',
  },
  {
    id: 'd',
    label: 'Sonnet 5 at documented defaults',
    model: 'claude-sonnet-5',
    searchMaxTokens: 16000,
    note: 'Thinking and effort deliberately UNSET, so the model runs adaptive thinking at effort high — its actual defaults. Configs b and c both ran below default and understated the model. Always test a new model here first.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Per-stage accounting
// ─────────────────────────────────────────────────────────────────────────────

type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

type StageResult = Usage & {
  stage: 1 | 2
  label: string
  ok: boolean
  error?: string
  elapsedMs: number
  searchCalls: number       // 1 + continuations
  continuations: number
  costUsd: number
  shape: Record<string, unknown>
  value: unknown
}

type RunResult = {
  config: string
  model: string
  company: string
  stages: StageResult[]
  totalElapsedMs: number
  totalCostUsd: number
  ok: boolean
}

function newUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

function addMessageUsage(acc: Usage, u: Anthropic.Usage) {
  acc.inputTokens      += u.input_tokens
  acc.outputTokens     += u.output_tokens
  acc.cacheReadTokens  += u.cache_read_input_tokens ?? 0
  acc.cacheWriteTokens += u.cache_creation_input_tokens ?? 0
}

function addStructuredUsage(acc: Usage, s: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }) {
  acc.inputTokens      += s.inputTokens
  acc.outputTokens     += s.outputTokens
  acc.cacheReadTokens  += s.cacheReadTokens
  acc.cacheWriteTokens += s.cacheWriteTokens
}

// ─────────────────────────────────────────────────────────────────────────────
// The search loop — identical handling in both routes, so it lives here once
// ─────────────────────────────────────────────────────────────────────────────
// web_search is a SERVER-side tool: searches execute inside a single API call,
// so stop_reason is never 'tool_use'. When the server-side loop hits its
// iteration limit the response comes back 'pause_turn'; continue by appending
// the assistant content and re-sending — no tool_results, no extra user message.
//
// Bounded by BOTH a continuation count and a wall-clock deadline, because
// counting continuations does not bound time: one call can run for minutes.

async function searchLoop(args: {
  client: Anthropic
  cfg: Config
  system: string
  userTurn: string
  maxContinuations: number
  deadlineMs: number
  startedAt: number
  usage: Usage
}): Promise<{ messages: Anthropic.MessageParam[]; final: Anthropic.Message; continuations: number }> {
  const { client, cfg, system, userTurn, maxContinuations, deadlineMs, startedAt, usage } = args
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn }]

  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: cfg.searchMaxTokens,
    system,
    // Top-level cache_control marks the last cacheable block automatically, so
    // the prefix is re-read at ~0.1x on every continuation and by the emit call.
    cache_control: { type: 'ephemeral' },
    tools: [webSearchTool()],
  }
  if (cfg.thinking) body.thinking = cfg.thinking
  if (cfg.effort) body.output_config = { effort: cfg.effort }

  let response = await client.messages.create({ ...body, messages } as never)
  addMessageUsage(usage, response.usage)

  let continuations = 0
  while (
    response.stop_reason === 'pause_turn' &&
    continuations < maxContinuations &&
    Date.now() - startedAt < deadlineMs
  ) {
    continuations++
    messages.push({ role: 'assistant', content: response.content })
    // Mirrors the routes: a failed continuation keeps what was gathered rather
    // than throwing the whole run away.
    try {
      response = await client.messages.create({ ...body, messages } as never)
    } catch { break }
    addMessageUsage(usage, response.usage)
  }

  return { messages, final: response, continuations }
}

// Text from every assistant turn, in order. The research route composes from all
// of them — when a continuation is cut short the earlier turns are all there is.
function findingsFromAllTurns(messages: Anthropic.MessageParam[], final: Anthropic.Message): string {
  const earlier = messages
    .filter(m => m.role === 'assistant')
    .flatMap(m => (Array.isArray(m.content) ? m.content : []))
    .map(b => (typeof b === 'object' && b !== null && 'type' in b && b.type === 'text' ? (b as { text: string }).text : ''))
  const last = final.content.map(b => (b.type === 'text' ? b.text : ''))
  return [...earlier, ...last].filter(Boolean).join('\n').trim()
}

// Text from the final turn only. This is what the decision-makers route does —
// mirrored, not corrected, because the harness exists to measure what ships.
function findingsFromFinalTurn(final: Anthropic.Message): string {
  return final.content.map(b => (b.type === 'text' ? b.text : '')).join('\n').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality at a glance
// ─────────────────────────────────────────────────────────────────────────────
// Not a scorecard — MODEL-UPGRADES.md Phase 1 defines that, and it needs several
// runs to compute corroboration. These are the cheap per-run counts that make an
// obvious regression visible in the summary table without opening the JSON. The
// judgement still comes from reading the brief.

// A news citation should open the article. A section index, a landing page or a
// paginated listing gives a rep nothing to click during a call.
function looksLikeArticleUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '')
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) return false
    const last = segments[segments.length - 1]
    // A slug or a dated path — not "/news", not "/press/page/3".
    return segments.length >= 2 || /[-_]/.test(last) || /\d{4}/.test(path)
  } catch { return false }
}

function briefShape(parsed: any): Record<string, unknown> {
  const news: any[] = Array.isArray(parsed?.news) ? parsed.news : []
  const urls = news.map(n => n?.url)
  const stats = parsed?.stats ?? {}
  const snapshot = [parsed?.snapshot_business, parsed?.snapshot_current].filter(Boolean).join('\n\n') || parsed?.snapshot || ''
  return {
    news: news.length,
    newsArticleUrls: urls.filter(looksLikeArticleUrl).length,
    newsDistinctUrls: new Set(urls.filter(u => typeof u === 'string')).size,
    initiatives: (parsed?.initiatives ?? []).length,
    painSignals: (parsed?.pain_signals ?? []).length,
    techSignals: (parsed?.tech_signals ?? []).length,
    statsFilled: ['revenue', 'headcount', 'open_roles', 'stage'].filter(k => stats?.[k] != null).length,
    snapshotChars: String(snapshot).length,
    hasFit: parsed?.fit != null,
    hasTiming: parsed?.timing != null,
    hasOutreachAngle: parsed?.outreach_angle != null,
  }
}

function decisionMakerShape(dms: RawDecisionMaker[]): Record<string, unknown> {
  const tiers: Record<string, number> = {}
  for (const d of dms) tiers[String((d as any)?.targeting_tier ?? 'unset')] = (tiers[String((d as any)?.targeting_tier ?? 'unset')] ?? 0) + 1
  return {
    people: dms.length,
    named: dms.filter(d => d?.name?.trim()).length,
    // A role established but the holder unknown — a correct, honest outcome.
    roleOnly: dms.filter(d => !d?.name?.trim()).length,
    withAngle: dms.filter(d => (d as any)?.suggested_angle).length,
    tiers,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — POST /api/research
// ─────────────────────────────────────────────────────────────────────────────

const MAX_CONTINUATIONS_RESEARCH = 6        // mirrors app/api/research/route.ts
const MAX_CONTINUATIONS_DM       = 4        // mirrors app/api/decision-makers/route.ts

async function runStage1(client: Anthropic, cfg: Config, ctx: RepContext, query: string): Promise<StageResult> {
  const startedAt = Date.now()
  const usage = newUsage()
  const today = new Date()

  const system = buildSystemPrompt(
    { products: ctx.products, icp_description: ctx.icp_description, rep_background: ctx.rep_background },
    today.toISOString().split('T')[0],
    today.getMonth() + 1,
  ) + `\n\n${languageDirective(ctx.locale)} ${JSON_LANGUAGE_RULE}`

  const userTurn = `Research this company for my B2B sales pipeline: ${query}`

  const base = { stage: 1 as const, label: 'research', continuations: 0, searchCalls: 0 }
  try {
    const { messages, final, continuations } = await searchLoop({
      client, cfg, system, userTurn,
      maxContinuations: MAX_CONTINUATIONS_RESEARCH,
      deadlineMs: RESEARCH_DEADLINE_MS,
      startedAt, usage,
    })

    const findings = findingsFromAllTurns(messages, final)

    const structured = await generateStructured({
      client, model: cfg.model, system,
      messages: [
        { role: 'user', content: userTurn },
        { role: 'assistant', content: findings || '(research gathered)' },
        { role: 'user', content: 'Now output the complete brief exactly as specified above, by calling the emit_result tool with the JSON object.' },
      ],
      maxTokens: 8192,
      cache: true,
      timeoutMs: EMIT_TIMEOUT_MS,
      thinking: cfg.thinking,
      effort: cfg.effort,
    })
    addStructuredUsage(usage, structured)

    return {
      ...base, ...usage, ok: true,
      elapsedMs: Date.now() - startedAt,
      continuations, searchCalls: continuations + 1,
      costUsd: calculateCost(cfg.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens),
      shape: briefShape(structured.value),
      value: structured.value,
    }
  } catch (err) {
    return {
      ...base, ...usage, ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - startedAt,
      costUsd: calculateCost(cfg.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens),
      shape: {}, value: null,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 — POST /api/decision-makers
// ─────────────────────────────────────────────────────────────────────────────

// What stage 2 grounds on. Production reads these four fields off the brief row
// stage 1 wrote; the mapping below is that row's shape (app/api/research/route.ts
// step 8), so a chained run grounds on exactly what a stored brief would give.
type Grounding = {
  companyName: string
  snapshot: string | null
  initiatives: string[]
  painSignals: string[]
  techSignals: string[]
}

function groundingFromParsedBrief(parsed: any, fallbackName: string): Grounding {
  return {
    companyName: parsed?.company?.name ?? fallbackName,
    snapshot: [parsed?.snapshot_business, parsed?.snapshot_current].filter(Boolean).join('\n\n') || parsed?.snapshot || null,
    initiatives: parsed?.initiatives ?? [],
    painSignals: parsed?.pain_signals ?? [],
    techSignals: parsed?.tech_signals ?? [],
  }
}

async function runStage2(client: Anthropic, cfg: Config, ctx: RepContext, g: Grounding): Promise<StageResult> {
  const startedAt = Date.now()
  const usage = newUsage()

  const system = buildDecisionMakersPrompt({
    companyName:     g.companyName,
    productsBlock:   buildProductsBlock(ctx.productsForBlock, false),
    repBackground:   ctx.rep_background,
    seniorityBands:  ctx.seniority_bands,
    targetFunctions: ctx.target_functions,
    snapshot:        g.snapshot,
    initiatives:     g.initiatives,
    painSignals:     g.painSignals,
    techSignals:     g.techSignals,
  }) + `\n\n${languageDirective(ctx.locale)} ${JSON_LANGUAGE_RULE}`

  const userTurn = `Find the people involved in a software purchase decision at ${g.companyName}.`

  const base = { stage: 2 as const, label: 'decision-makers', continuations: 0, searchCalls: 0 }
  try {
    const { final, continuations } = await searchLoop({
      client, cfg, system, userTurn,
      maxContinuations: MAX_CONTINUATIONS_DM,
      deadlineMs: DECISION_MAKERS_DEADLINE_MS,
      startedAt, usage,
    })

    // Final turn only — mirrors the route. See findingsFromFinalTurn.
    const findings = findingsFromFinalTurn(final)

    const structured = await generateStructured({
      client, model: cfg.model, system,
      messages: [
        { role: 'user', content: userTurn },
        { role: 'assistant', content: findings || '(research gathered)' },
        { role: 'user', content: 'Now output the decision makers exactly as specified above, by calling the emit_result tool with the JSON object. Return an empty array if you could not source anyone.' },
      ],
      maxTokens: 4096,
      cache: true,
      timeoutMs: EMIT_TIMEOUT_MS,
      thinking: cfg.thinking,
      effort: cfg.effort,
    })
    addStructuredUsage(usage, structured)

    const dms = (structured.value as { decision_makers?: RawDecisionMaker[] })?.decision_makers ?? []

    return {
      ...base, ...usage, ok: true,
      elapsedMs: Date.now() - startedAt,
      continuations, searchCalls: continuations + 1,
      costUsd: calculateCost(cfg.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens),
      shape: decisionMakerShape(dms),
      value: structured.value,
    }
  } catch (err) {
    return {
      ...base, ...usage, ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - startedAt,
      costUsd: calculateCost(cfg.model, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens),
      shape: {}, value: null,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep context — the same reads the routes perform. All reads, never a write.
// ─────────────────────────────────────────────────────────────────────────────

type RepContext = {
  userId: string
  products: ProductPromptContext[]      // stage 1 prompt shape
  productsForBlock: ProductForPrompt[]  // stage 2 prompt shape (needs id)
  icp_description: string
  rep_background: string
  locale: string | null
  seniority_bands: string[]
  target_functions: string[]
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Run via: pnpm ab:research')
  }
  return createClient(url, key)
}

async function loadRepContext(email?: string): Promise<RepContext> {
  const client = db()

  // Pick the rep whose context to use: the named one, else the first admin.
  const { data: profiles } = await client
    .from('rep_profiles')
    .select('user_id, icp_description, rep_background, voice_samples, locale, is_admin')
    .order('updated_at', { ascending: false })
  if (!profiles?.length) throw new Error('No rep_profiles rows found.')

  let profile = profiles.find(p => p.is_admin) ?? profiles[0]
  if (email) {
    const { data: users } = await client.auth.admin.listUsers()
    const match = users?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!match) throw new Error(`No auth user found for ${email}`)
    const owned = profiles.find(p => p.user_id === match.id)
    if (!owned) throw new Error(`No rep_profiles row for ${email}`)
    profile = owned
  }

  const [{ data: products }, { data: teamConfig }] = await Promise.all([
    client.from('products')
      .select('id, name, description, value_props, competitors')
      .eq('user_id', profile.user_id)
      .order('created_at', { ascending: true }),
    client.from('team_config')
      .select('seniority_bands, target_functions')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!products?.length) throw new Error('That rep has no products configured — the prompt would be unrepresentative.')

  return {
    userId: profile.user_id,
    products: products as ProductPromptContext[],
    productsForBlock: products as ProductForPrompt[],
    icp_description:  profile.icp_description ?? '',
    rep_background:   profile.rep_background  ?? '',
    locale:           profile.locale ?? null,
    seniority_bands:  (teamConfig?.seniority_bands  as string[]) ?? [],
    target_functions: (teamConfig?.target_functions as string[]) ?? [],
  }
}

// Stage 2 on its own needs a brief to ground on. Read the stored one — the same
// row the route would read. Read-only, like everything else here.
async function loadStoredGrounding(userId: string, query: string): Promise<Grounding> {
  const client = db()
  const { data: prospects } = await client
    .from('prospects')
    .select('id, name, query')
    .eq('user_id', userId)
    .or(`name.ilike.${query},query.ilike.${query}`)
    .order('last_refreshed_at', { ascending: false, nullsFirst: false })
    .limit(1)

  const prospect = prospects?.[0]
  if (!prospect) {
    throw new Error(`No stored prospect matching "${query}" for this rep. Run with --stages 1,2 to research it first.`)
  }

  const { data: briefs } = await client
    .from('prospect_briefs')
    .select('snapshot, initiatives, pain_signals, tech_signals')
    .eq('prospect_id', prospect.id)
    .order('created_at', { ascending: false })
    .limit(1)

  const brief = briefs?.[0]
  if (!brief) {
    throw new Error(`"${prospect.name}" has no brief yet — stage 2 grounds on stage 1. Run with --stages 1,2.`)
  }

  return {
    companyName: prospect.name,
    snapshot:    brief.snapshot ?? null,
    initiatives: (brief.initiatives  as string[]) ?? [],
    painSignals: (brief.pain_signals as string[]) ?? [],
    techSignals: (brief.tech_signals as string[]) ?? [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

const secs = (ms: number) => (ms / 1000).toFixed(1) + 's'
const usd  = (n: number) => '$' + n.toFixed(4)

async function main() {
  const query = process.argv[2]
  if (!query || query.startsWith('--')) {
    console.error('Usage: pnpm ab:research "<company>" [--stages 1,2] [--configs a] [--repeat N] [--rep you@company.com]')
    process.exit(1)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. Run via: pnpm ab:research (it loads apps/web/.env.local)')
    process.exit(1)
  }

  const stages = (arg('--stages') ?? '1,2').split(',').map(s => Number(s.trim())).filter(n => n === 1 || n === 2)
  if (!stages.length) { console.error('--stages must list 1, 2 or both.'); process.exit(1) }
  const runStage1Wanted = stages.includes(1)
  const runStage2Wanted = stages.includes(2)

  const wanted = (arg('--configs') ?? 'a').split(',').map(s => s.trim())
  const configs = CONFIGS.filter(c => wanted.includes(c.id))
  if (!configs.length) { console.error(`No configs matched "${wanted.join(',')}".`); process.exit(1) }

  const repeat = Number(arg('--repeat') ?? '1')
  if (!Number.isInteger(repeat) || repeat < 1) { console.error('--repeat must be a positive integer.'); process.exit(1) }

  const ctx = await loadRepContext(arg('--rep'))

  // Stage 2 without stage 1 needs a stored brief. Fail before spending, not after.
  let storedGrounding: Grounding | undefined
  if (runStage2Wanted && !runStage1Wanted) {
    storedGrounding = await loadStoredGrounding(ctx.userId, query.trim())
  }

  // ── The plan, and the money ────────────────────────────────────────────────
  // Ranges are the measured spread of the v1.7.x runs, rounded outward.
  const STAGE_COST = { 1: [0.10, 0.35], 2: [0.05, 0.20] } as const
  const perRun = stages.reduce((acc, s) => [acc[0] + STAGE_COST[s as 1 | 2][0], acc[1] + STAGE_COST[s as 1 | 2][1]], [0, 0])
  const totalRuns = configs.length * repeat

  console.log(`\n  Company:       ${query}`)
  console.log(`  Stages:        ${stages.map(s => (s === 1 ? '1 (research)' : '2 (decision makers)')).join(' + ')}`)
  console.log(`  Rep context:   ${ctx.products.length} product(s), ${ctx.seniority_bands.length} band(s), ${ctx.target_functions.length} function(s), locale ${ctx.locale ?? 'default'}`)
  if (storedGrounding) {
    console.log(`  Grounding:     stored brief for "${storedGrounding.companyName}" (${storedGrounding.initiatives.length} initiatives, ${storedGrounding.painSignals.length} pain, ${storedGrounding.techSignals.length} tech)`)
  } else if (runStage2Wanted) {
    console.log(`  Grounding:     stage 1's own brief, passed straight to stage 2`)
  }
  console.log('')
  for (const c of configs) {
    console.log(`  [${c.id}] ${c.label}`)
    console.log(`      ${c.model} · search max_tokens ${c.searchMaxTokens} · thinking ${c.thinking?.type ?? 'default'}${c.effort ? ` · effort ${c.effort}` : ''}`)
    console.log(`      ${c.note}\n`)
  }
  console.log(`  ${totalRuns} run(s) × ${stages.length} stage(s). Real calls against your live Anthropic key.`)
  console.log(`  Expected cost: $${(perRun[0] * totalRuns).toFixed(2)}–$${(perRun[1] * totalRuns).toFixed(2)}. Nothing is written to the database.\n`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('  Proceed? (y/N) ')).trim().toLowerCase()
  rl.close()
  if (answer !== 'y' && answer !== 'yes') { console.log('\n  Aborted — nothing spent.\n'); return }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = join(process.cwd(), 'ab-results', `${stamp}_${query.replace(/[^a-zA-Z0-9]+/g, '-')}`)
  mkdirSync(outDir, { recursive: true })

  const client = new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS, maxRetries: ANTHROPIC_MAX_RETRIES })
  const results: RunResult[] = []

  for (let pass = 1; pass <= repeat; pass++) {
    for (const cfg of configs) {
      const tag = repeat > 1 ? `${cfg.id}${pass}` : cfg.id
      const runStages: StageResult[] = []
      let grounding = storedGrounding

      if (runStage1Wanted) {
        process.stdout.write(`  [${tag}] stage 1 research… `)
        const s1 = await runStage1(client, cfg, ctx, query.trim())
        runStages.push(s1)
        console.log(s1.ok ? `${secs(s1.elapsedMs)} · ${usd(s1.costUsd)} · ${s1.searchCalls} search call(s)` : `FAILED — ${s1.error}`)
        if (s1.ok) grounding = groundingFromParsedBrief(s1.value, query.trim())
      }

      if (runStage2Wanted) {
        if (!grounding) {
          console.log(`  [${tag}] stage 2 skipped — stage 1 produced no brief to ground on.`)
        } else {
          process.stdout.write(`  [${tag}] stage 2 decision-makers… `)
          const s2 = await runStage2(client, cfg, ctx, grounding)
          runStages.push(s2)
          console.log(s2.ok ? `${secs(s2.elapsedMs)} · ${usd(s2.costUsd)} · ${s2.searchCalls} search call(s)` : `FAILED — ${s2.error}`)
        }
      }

      const run: RunResult = {
        config: tag,
        model: cfg.model,
        company: query.trim(),
        stages: runStages,
        totalElapsedMs: runStages.reduce((n, s) => n + s.elapsedMs, 0),
        totalCostUsd:   runStages.reduce((n, s) => n + s.costUsd, 0),
        ok: runStages.length > 0 && runStages.every(s => s.ok),
      }
      results.push(run)
      writeFileSync(join(outDir, `${tag}.json`), JSON.stringify(run, null, 2), 'utf8')
    }
  }

  // ── Summary: one row per stage, plus the run total ─────────────────────────
  console.log('\n  ┌──────────────────────────────────────────────────────────────────────────────────┐')
  console.log('  │ cfg │ stage           │  time │   in │  out │ cache rd │      cost │ srch │ ok │')
  console.log('  ├──────────────────────────────────────────────────────────────────────────────────┤')
  for (const run of results) {
    for (const s of run.stages) {
      console.log(
        `  │ ${run.config.padEnd(3)} │ ${`${s.stage} ${s.label}`.padEnd(15)} │ ${secs(s.elapsedMs).padStart(5)} │ ` +
        `${String(s.inputTokens).padStart(4)} │ ${String(s.outputTokens).padStart(4)} │ ` +
        `${String(s.cacheReadTokens).padStart(8)} │ ${usd(s.costUsd).padStart(9)} │ ${String(s.searchCalls).padStart(4)} │ ${s.ok ? ' ✓' : ' ✗'} │`
      )
    }
    if (run.stages.length > 1) {
      console.log(
        `  │ ${run.config.padEnd(3)} │ ${'TOTAL'.padEnd(15)} │ ${secs(run.totalElapsedMs).padStart(5)} │ ` +
        `${'—'.padStart(4)} │ ${'—'.padStart(4)} │ ${'—'.padStart(8)} │ ${usd(run.totalCostUsd).padStart(9)} │ ${'—'.padStart(4)} │ ${run.ok ? ' ✓' : ' ✗'} │`
      )
    }
  }
  console.log('  └──────────────────────────────────────────────────────────────────────────────────┘')

  // Shape counts — an obvious regression should be visible without opening JSON.
  console.log('')
  for (const run of results) {
    for (const s of run.stages) {
      if (!s.ok) continue
      const pairs = Object.entries(s.shape).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      console.log(`  [${run.config}] stage ${s.stage}: ${pairs.join('  ')}`)
    }
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ query, stages, configs, results }, null, 2), 'utf8')
  console.log(`\n  Written to ${outDir}`)
  console.log('  The table is the cost and latency. Open the briefs — quality is the part only you can judge.\n')
}

main().catch(err => { console.error('\n', err instanceof Error ? err.message : err, '\n'); process.exit(1) })
