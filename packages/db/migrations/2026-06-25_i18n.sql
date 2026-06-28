-- ═════════════════════════════════════════
-- Migration: i18n / multi-language (v1.4.0) — ProspectLord
-- Run in Supabase SQL editor (safe to re-run — IF NOT EXISTS guards).
--
-- Two stored values drive all of ProspectLord's language behavior:
--   1. rep_profiles.locale            — the rep's language; drives chrome AND the
--                                        default language of all generated content.
--                                        Existing rows default to 'en-US'.
--   2. prospects.output_language_override — sticky per-prospect; applies ONLY to
--                                        emails/pitches; null = fall back to the
--                                        rep's profile locale.
--
-- No CHECK constraint by design — supported codes are validated app-side against
-- the shared lookup (apps/web/lib/i18n/languages.ts), so adding a language later
-- is one code change, not a migration.
-- ═════════════════════════════════════════

alter table rep_profiles
  add column if not exists locale text not null default 'en-US';

alter table prospects
  add column if not exists output_language_override text;
