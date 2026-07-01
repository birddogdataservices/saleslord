// ─────────────────────────────────────────────────────────────────────────────
// Language lookup — the SINGLE source of truth for ProspectLord i18n.
//
// Everything that needs to know about a language reads from here: the /setup
// locale selector, the email/pitch compose dropdown, the next-intl chrome
// resolver, and the generation language directive appended to every Anthropic
// prompt. Adding a language is one entry below (+ one catalog file in messages/);
// never a schema migration.
//
// Codes are BCP-47. `en-US` is the base catalog and the default for existing rows.
// `en-GB` is a real, separate language — British spelling/idiom in both chrome and
// generated copy — not "the untranslated one".
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUAGES = [
  { code: 'en-US', label: 'English (US)',       instruction: 'American English' },
  { code: 'en-GB', label: 'English (UK)',       instruction: 'British English (use British spelling and idiom)' },
  { code: 'es',    label: 'Español',            instruction: 'Spanish' },
  { code: 'pt-BR', label: 'Português (Brasil)', instruction: 'Brazilian Portuguese' },
  { code: 'fr',    label: 'Français',           instruction: 'French' },
  { code: 'de',    label: 'Deutsch',            instruction: 'German' },
] as const

export type Locale = (typeof LANGUAGES)[number]['code']

export const LOCALES: Locale[] = LANGUAGES.map(l => l.code)

// Default for existing rows and any missing/invalid locale.
export const DEFAULT_LOCALE: Locale = 'en-US'

// Cookie that mirrors rep_profiles.locale and feeds the next-intl chrome resolver.
// (NEXT_LOCALE is next-intl's conventional cookie name.)
export const LOCALE_COOKIE = 'NEXT_LOCALE'

// Compose-dropdown sentinel: "use my profile's language", distinct from explicitly
// picking en-US. Selecting it clears prospect.output_language_override to null.
export const PROFILE_DEFAULT = '__profile_default__'

export function isSupportedLocale(code?: string | null): code is Locale {
  return !!code && (LOCALES as string[]).includes(code)
}

// Coerce any input to a supported locale, falling back to the default.
export function normalizeLocale(code?: string | null): Locale {
  return isSupportedLocale(code) ? code : DEFAULT_LOCALE
}

// The model-facing instruction string for a locale (falls back to en-US's).
export function instructionFor(code?: string | null): string {
  const loc = normalizeLocale(code)
  return (LANGUAGES.find(l => l.code === loc) ?? LANGUAGES[0]).instruction
}

// Appended to every generation system prompt so output lands in the rep's /
// prospect's language. Build once, here, so every call site stays in sync.
export function languageDirective(code?: string | null): string {
  return `Write all output in ${instructionFor(code)}. This applies to every part of your response.`
}

// Extra rule for prompts that return structured JSON. The language directive tells
// the model to write output in the target language; for structured data that must NOT
// mean translating keys or fixed enum values (which breaks downstream matching). The
// JSON itself is produced via tool use (see lib/structured-output.ts), so validity is
// guaranteed by the API — this rule only scopes WHAT gets translated.
export const JSON_LANGUAGE_RULE =
  'Keep every JSON key, and any fixed enum/code values (not free text), exactly in English. ' +
  'Translate ONLY the free-text human-readable string values.'

// Resolve the output language for a PROSPECT-FACING generation (emails, pitches)
// from the audience principle: an explicit per-generation selection wins and is
// sticky; otherwise fall back to the prospect's stored override, then the rep's
// profile locale.
//
// Returns the resolved language plus the write-back instruction for the sticky
// override column:
//   - overrideWrite === undefined → leave the column unchanged
//   - overrideWrite === null      → clear the override (rep chose "Profile default")
//   - overrideWrite === <Locale>  → persist the explicit choice
export function resolveProspectLanguage(args: {
  selection?: string | null            // body.languageSelection
  storedOverride?: string | null       // prospect.output_language_override
  profileLocale?: string | null        // rep_profiles.locale
}): { lang: Locale; overrideWrite: Locale | null | undefined } {
  const profileLocale = normalizeLocale(args.profileLocale)

  if (args.selection === PROFILE_DEFAULT) {
    return { lang: profileLocale, overrideWrite: null }
  }
  if (isSupportedLocale(args.selection)) {
    return { lang: args.selection, overrideWrite: args.selection }
  }
  // No concrete selection: stored override (if any) → profile locale. No write.
  const lang = isSupportedLocale(args.storedOverride) ? args.storedOverride : profileLocale
  return { lang, overrideWrite: undefined }
}
