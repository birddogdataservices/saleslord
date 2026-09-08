// A/B harness for the research model decision — Sonnet 4.6 vs Sonnet 5.
//
//   pnpm ab:research "Snowflake"
//   pnpm ab:research "Snowflake" --configs a,b        # subset
//   pnpm ab:research "Snowflake" --repeat 2           # runs per config
//
// Runs one company through each configuration using the REAL system prompt
// (lib/research-prompt.ts) and the REAL rep context (your profile, products and
// team targeting config, read from Supabase). A comparison run against a copied
// or invented prompt would tell you nothing about production.
//
// Writes nothing. No prospect, no brief, no api_usage row, no rate-limit
// consumption — this is an experiment, not a research run. Output goes to
// ./ab-results/<timestamp>/ as one JSON per run plus a summary table.
//
// THIS SPENDS REAL MONEY on the key in ANTHROPIC_API_KEY. Each run is a full
// research pass: roughly $0.10–$0.40 on Sonnet 4.6. Three configs x one repeat
// is therefore roughly $0.30–$1.20. The script prints the plan and waits for
// confirmation before making a single call.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { buildSystemPrompt } from '../lib/research-prompt'
import { calculateCost } from '../lib/utils'
import type { ProductPromptContext } from '../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// The configurations under test
// ─────────────────────────────────────────────────────────────────────────────
// Sonnet 5 is not a drop-in: it runs adaptive thinking by default, and thinking
// bills as output. At the route's current max_tokens of 4096 that risks
// truncating the brief, so each config states its thinking posture explicitly
// rather than inheriting a default.

type Config = {
  id: string
  label: string
  model: string
  maxTokens: number
  thinking?: { type: 'disabled' } | { type: 'adaptive' }
  effort?: 'low' | 'medium' | 'high'
  note: string
}

const CONFIGS: Config[] = [
  {
    id: 'a',
    label: 'Sonnet 4.6 (current)',
    model: 'claude-sonnet-4-6',
    maxTokens: 4096,
    note: 'Baseline — exactly what production runs today.',
  },
  {
    id: 'b',
    label: 'Sonnet 5, thinking off',
    model: 'claude-sonnet-5',
    maxTokens: 4096,
    thinking: { type: 'disabled' },
    note: 'Closest match to current behaviour. Straight 33% rate cut, but Sonnet 5 is built around adaptive thinking, so this may read worse than the baseline.',
  },
  {
    id: 'c',
    label: 'Sonnet 5, adaptive thinking',
    model: 'claude-sonnet-5',
    maxTokens: 16000,
    thinking: { type: 'adaptive' },
    effort: 'medium',
    note: 'Takes the model upgrade. Thinking tokens bill as output and may eat the rate saving — max_tokens raised so the brief cannot be truncated by thinking.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// One research pass — mirrors the route's two phases
// ─────────────────────────────────────────────────────────────────────────────

type RunResult = {
  config: string
  model: string
  ok: boolean
  error?: string
  elapsedMs: number
  continuations: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  brief: unknown
}

const EMIT_TOOL = {
  name: 'emit_result',
  description: 'Return the final result strictly as a JSON object matching the requested shape.',
  input_schema: { type: 'object' as const, additionalProperties: true },
}

async function runOnce(
  client: Anthropic,
  cfg: Config,
  systemPrompt: string,
  query: string,
): Promise<RunResult> {
  const started = Date.now()
  const userTurn = `Research this company for my B2B sales pipeline: ${query}`
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userTurn }]

  const base: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: systemPrompt,
    cache_control: { type: 'ephemeral' },
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  }
  if (cfg.thinking) base.thinking = cfg.thinking
  if (cfg.effort) base.output_config = { effort: cfg.effort }

  let inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheWrite = 0
  const tally = (u: Anthropic.Usage) => {
    inputTokens  += u.input_tokens
    outputTokens += u.output_tokens
    cacheRead    += u.cache_read_input_tokens ?? 0
    cacheWrite   += u.cache_creation_input_tokens ?? 0
  }

  try {
    // Phase 1 — the web-search loop, same continuation handling as the route.
    let response = await client.messages.create({ ...base, messages } as never)
    tally(response.usage)

    const MAX_CONTINUATIONS = 6
    let continuations = 0
    while (response.stop_reason === 'pause_turn' && continuations < MAX_CONTINUATIONS) {
      continuations++
      messages.push({ role: 'assistant', content: response.content })
      response = await client.messages.create({ ...base, messages } as never)
      tally(response.usage)
    }

    // Phase 2 — forced tool use for guaranteed-valid JSON, same as the route.
    const findings = response.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim()

    const emit = await client.messages.create({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system: systemPrompt,
      cache_control: { type: 'ephemeral' },
      tools: [EMIT_TOOL],
      tool_choice: { type: 'tool', name: EMIT_TOOL.name },
      ...(cfg.thinking ? { thinking: cfg.thinking } : {}),
      messages: [
        { role: 'user', content: userTurn },
        { role: 'assistant', content: findings || '(research gathered)' },
        { role: 'user', content: 'Now output the complete brief exactly as specified above, by calling the emit_result tool with the JSON object.' },
      ],
    } as never)
    tally(emit.usage)

    const toolUse = emit.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No structured tool output')

    return {
      config: cfg.id, model: cfg.model, ok: true,
      elapsedMs: Date.now() - started, continuations,
      inputTokens, outputTokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
      costUsd: calculateCost(cfg.model, inputTokens, outputTokens, cacheRead, cacheWrite),
      brief: toolUse.input,
    }
  } catch (err) {
    return {
      config: cfg.id, model: cfg.model, ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started, continuations: 0,
      inputTokens, outputTokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
      costUsd: calculateCost(cfg.model, inputTokens, outputTokens, cacheRead, cacheWrite),
      brief: null,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep context — the same three reads the route performs
// ─────────────────────────────────────────────────────────────────────────────

async function loadRepContext(email?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Run with: node --env-file=.env.local')
  }
  const db = createClient(url, key)

  // Pick the rep whose context to use: the named admin, else the first admin.
  const { data: profiles } = await db
    .from('rep_profiles')
    .select('user_id, icp_description, rep_background, voice_samples, locale, is_admin')
    .order('updated_at', { ascending: false })
  if (!profiles?.length) throw new Error('No rep_profiles rows found.')

  let profile = profiles.find(p => p.is_admin) ?? profiles[0]
  if (email) {
    const { data: users } = await db.auth.admin.listUsers()
    const match = users?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!match) throw new Error(`No auth user found for ${email}`)
    const owned = profiles.find(p => p.user_id === match.id)
    if (!owned) throw new Error(`No rep_profiles row for ${email}`)
    profile = owned
  }

  const [{ data: products }, { data: teamConfig }] = await Promise.all([
    db.from('products')
      .select('name, description, value_props, competitors')
      .eq('user_id', profile.user_id)
      .order('created_at', { ascending: true }),
    db.from('team_config')
      .select('seniority_bands, target_functions')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!products?.length) throw new Error('That rep has no products configured — the prompt would be unrepresentative.')

  return {
    userId: profile.user_id,
    products: products as ProductPromptContext[],
    icp_description:  profile.icp_description ?? '',
    rep_background:   profile.rep_background  ?? '',
    voice_samples:    profile.voice_samples   ?? '',
    seniority_bands:  (teamConfig?.seniority_bands  as string[]) ?? [],
    target_functions: (teamConfig?.target_functions as string[]) ?? [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
  const query = process.argv[2]
  if (!query || query.startsWith('--')) {
    console.error('Usage: pnpm ab:research "<company>" [--configs a,b,c] [--repeat N] [--rep you@company.com]')
    process.exit(1)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set. Run with: node --env-file=.env.local')
    process.exit(1)
  }

  const wanted = (arg('--configs') ?? 'a,b,c').split(',').map(s => s.trim())
  const configs = CONFIGS.filter(c => wanted.includes(c.id))
  const repeat = Number(arg('--repeat') ?? '1')
  if (!configs.length) { console.error(`No configs matched "${wanted.join(',')}".`); process.exit(1) }

  const ctx = await loadRepContext(arg('--rep'))
  const today = new Date()
  const systemPrompt = buildSystemPrompt(ctx, today.toISOString().split('T')[0], today.getMonth() + 1)

  const totalRuns = configs.length * repeat
  console.log(`\n  Company:      ${query}`)
  console.log(`  Rep context:  ${ctx.products.length} product(s), ${ctx.seniority_bands.length} band(s), ${ctx.target_functions.length} function(s)`)
  console.log(`  System prompt: ${systemPrompt.length.toLocaleString()} chars\n`)
  for (const c of configs) {
    const thinking = c.thinking ? c.thinking.type : 'default'
    console.log(`  [${c.id}] ${c.label}`)
    console.log(`      ${c.model} · max_tokens ${c.maxTokens} · thinking ${thinking}${c.effort ? ` · effort ${c.effort}` : ''}`)
    console.log(`      ${c.note}\n`)
  }
  console.log(`  ${totalRuns} run(s). Full research passes against your live Anthropic key.`)
  console.log(`  Rough cost: $${(totalRuns * 0.1).toFixed(2)}–$${(totalRuns * 0.4).toFixed(2)}.\n`)

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('  Proceed? (y/N) ')).trim().toLowerCase()
  rl.close()
  if (answer !== 'y' && answer !== 'yes') { console.log('\n  Aborted — nothing spent.\n'); return }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = join(process.cwd(), 'ab-results', `${stamp}_${query.replace(/[^a-zA-Z0-9]+/g, '-')}`)
  mkdirSync(outDir, { recursive: true })

  const client = new Anthropic({ apiKey })
  const results: RunResult[] = []

  for (let pass = 1; pass <= repeat; pass++) {
    for (const cfg of configs) {
      const tag = repeat > 1 ? `${cfg.id}${pass}` : cfg.id
      process.stdout.write(`  Running [${tag}] ${cfg.label}… `)
      const r = await runOnce(client, cfg, systemPrompt, query.trim())
      results.push({ ...r, config: tag })
      console.log(r.ok
        ? `${(r.elapsedMs / 1000).toFixed(1)}s · $${r.costUsd.toFixed(4)}`
        : `FAILED — ${r.error}`)
      writeFileSync(join(outDir, `${tag}.json`), JSON.stringify(r, null, 2), 'utf8')
    }
  }

  // Summary table — the numbers. Quality is yours to judge from the briefs.
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────────┐')
  console.log('  │ cfg │ model            │  time │   in │  out │ cache rd │      cost │ ok │')
  console.log('  ├─────────────────────────────────────────────────────────────────────────┤')
  for (const r of results) {
    console.log(
      `  │ ${r.config.padEnd(3)} │ ${r.model.padEnd(16)} │ ${((r.elapsedMs / 1000).toFixed(1) + 's').padStart(5)} │ ` +
      `${String(r.inputTokens).padStart(4)} │ ${String(r.outputTokens).padStart(4)} │ ` +
      `${String(r.cacheReadTokens).padStart(8)} │ ${('$' + r.costUsd.toFixed(4)).padStart(9)} │ ${r.ok ? ' ✓' : ' ✗'} │`
    )
  }
  console.log('  └─────────────────────────────────────────────────────────────────────────┘')

  const baseline = results.find(r => r.config.startsWith('a') && r.ok)
  if (baseline) {
    for (const r of results.filter(x => !x.config.startsWith('a') && x.ok)) {
      const delta = ((r.costUsd - baseline.costUsd) / baseline.costUsd) * 100
      console.log(`  [${r.config}] vs baseline: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% cost, ${((r.elapsedMs - baseline.elapsedMs) / 1000).toFixed(1)}s slower`)
    }
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ query, configs, results }, null, 2), 'utf8')
  console.log(`\n  Briefs written to ${outDir}`)
  console.log('  Read them side by side — cost is in the table, quality is the part only you can judge.\n')
}

main().catch(err => { console.error('\n', err instanceof Error ? err.message : err, '\n'); process.exit(1) })
