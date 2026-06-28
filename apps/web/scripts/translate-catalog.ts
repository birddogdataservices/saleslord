// scripts/translate-catalog.ts
//
// AUTHOR-TIME catalog translation — NOT a runtime path.
//
// Runs the base en-US message catalog through Claude once per target locale and
// writes messages/<code>.json. Runtime stays a zero-cost static lookup; this only
// runs when you add a language or intentionally regenerate.
//
// Usage (from apps/web):
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/translate-catalog.ts            # all non-en-US locales
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/translate-catalog.ts es pt-BR   # only these
//
// Notes:
//   - en-US is the source and is never overwritten.
//   - en-GB is treated like any other locale (British spelling/idiom).
//   - The model is told to translate VALUES only, keep JSON keys, preserve ICU
//     syntax + {placeholders}, and leave brand/technical terms untranslated.
//   - Review machine output before committing — especially the first non-English
//     catalog (have a native speaker check pt-BR).

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES, DEFAULT_LOCALE, type Locale } from '../lib/i18n/languages'

const MODEL = 'claude-sonnet-4-6'
const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages')

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is required (author-time only).')
    process.exit(1)
  }

  const requested = process.argv.slice(2) as Locale[]
  const targets = LANGUAGES
    .map(l => l.code)
    .filter((code): code is Locale => code !== DEFAULT_LOCALE)
    .filter(code => requested.length === 0 || requested.includes(code))

  if (targets.length === 0) {
    console.error('No target locales to translate. Pass codes or run with none for all.')
    process.exit(1)
  }

  const base = readFileSync(join(MESSAGES_DIR, `${DEFAULT_LOCALE}.json`), 'utf8')
  const client = new Anthropic({ apiKey })

  for (const code of targets) {
    const lang = LANGUAGES.find(l => l.code === code)!
    process.stdout.write(`Translating → ${code} (${lang.instruction})… `)

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system:
        'You are a professional software localizer. You translate JSON message catalogs for a B2B SaaS UI. ' +
        'Return ONLY the translated JSON object — no markdown fences, no commentary.',
      messages: [{
        role: 'user',
        content:
          `Translate the VALUES of this JSON message catalog into ${lang.instruction}.\n\n` +
          `Hard rules:\n` +
          `- Keep every JSON key exactly as-is (English). Translate only string values.\n` +
          `- Preserve ICU MessageFormat syntax verbatim, including {placeholders}, ` +
          `plural blocks ({count, plural, one {#...} other {#...}}), and the # token.\n` +
          `- Do NOT translate brand/technical terms: SalesLord, ProspectLord, Anthropic, ` +
          `Google, LinkedIn, Stripe, Plaid, Snowflake, dbt, Pentaho, API, PDF, sk-ant-, ` +
          `console.anthropic.com, and email addresses.\n` +
          `- Keep punctuation/symbols like →, ↺, ⚠, ·, ${'$'}{cost} placeholders.\n` +
          `- Match the concise, professional tone of the source.\n\n` +
          base,
      }],
    })

    const text = response.content.find(b => b.type === 'text')
    if (!text || text.type !== 'text') {
      console.error(`\n  No text response for ${code}; skipping.`)
      continue
    }
    const raw = text.text
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) {
      console.error(`\n  No JSON object in response for ${code}; skipping.`)
      continue
    }

    // Validate it parses before writing.
    const parsed = JSON.parse(raw.slice(start, end + 1))
    writeFileSync(
      join(MESSAGES_DIR, `${code}.json`),
      JSON.stringify(parsed, null, 2) + '\n',
      'utf8',
    )
    console.log('done.')
  }

  console.log('\nReview the generated catalogs before committing.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
