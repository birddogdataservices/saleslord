import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/languages'
import enUS from '../messages/en-US.json'

// next-intl request config — no URL routing. The active locale is read from the
// NEXT_LOCALE cookie, which mirrors rep_profiles.locale (set on /setup save and
// backfilled once in proxy.ts). Anything missing/invalid falls back to en-US.
//
// Missing-key fallback: en-US is the base catalog; the active locale's catalog is
// deep-merged on top, so a partial catalog (or an untranslated app like CELord)
// renders English for the gaps instead of a blank key — never a missing string.
export default getRequestConfig(async () => {
  const store = await cookies()
  const locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value)

  const messages =
    locale === DEFAULT_LOCALE
      ? enUS
      : deepMerge(
          enUS as Messages,
          (await import(`../messages/${locale}.json`)).default as Messages,
        )

  return { locale, messages }
})

type Messages = Record<string, unknown>

// Recursive merge: values from `override` win, but keys present only in `base`
// (en-US) survive — that's the fallback guarantee.
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base }
  for (const key of Object.keys(override)) {
    const b = base[key]
    const o = override[key]
    out[key] =
      isPlainObject(b) && isPlainObject(o) ? deepMerge(b, o) : o
  }
  return out
}

function isPlainObject(v: unknown): v is Messages {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
