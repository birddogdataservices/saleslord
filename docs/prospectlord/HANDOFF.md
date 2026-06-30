# ProspectLord — Handoff

## Current version: v1.4.1 — i18n / multi-language

---

## Session 12.1 hotfix (non-English JSON parse failure)

**Symptom:** with a non-English `profile.locale`, research/email/pitch generation ran
(burned credits) then failed with "Failed to parse AI response".

**Cause:** the language directive ("Write all output in X. This applies to every part
of your response.") induced the model to wrap the JSON in translated commentary. The
naive `text.slice(indexOf('{'), lastIndexOf('}'))` parser then grabbed a `}` from a
trailing translated remark, producing invalid JSON. English output had obeyed the
"no trailing text" instruction, so it only surfaced once generation went multi-language.

**Fix:**
- `extractJsonObject()` in `lib/utils.ts` — returns the first **complete, balanced**
  JSON object (string/escape-aware), tolerating leading/trailing prose (incl. braces)
  and fences in any language. Now used by research, check-updates, case-studies/match,
  refresh-email, pitch-opener (replaces the slice in each).
- `JSON_LANGUAGE_RULE` (in `lib/i18n/languages.ts`) strengthened: output only the JSON
  object with no commentary in any language; keep keys + fixed enum/code values English;
  translate only free-text values; escape inner quotes. Now also applied to refresh-email
  and pitch-opener (previously only the rep-facing JSON routes had it).
- Verified `extractJsonObject` with a unit test covering the trailing-prose-with-brace
  case. No schema change.

---

## Session 12 summary (i18n / multi-language)

### What was built

ProspectLord is now multi-language, **profile-driven** (no URL-based locale routing).
Two stored values drive everything: `rep_profiles.locale` (chrome + default generation
language) and `prospects.output_language_override` (sticky per-prospect, emails/pitches
only). Language is chosen by **audience** — rep-facing content always follows the
profile; prospect-facing content is overridable per generation and sticks to the
prospect. Six languages: en-US, en-GB, es, pt-BR, fr, de. See the
**Internationalization** section in `docs/prospectlord/CLAUDE.md` for the durable design.

### Files created / modified

| File | Change |
|---|---|
| `packages/db/migrations/2026-06-25_i18n.sql` | **New** — `rep_profiles.locale` (default `en-US`), `prospects.output_language_override` (nullable) |
| `packages/db/schema.sql` | Mirrored both columns into the source of truth |
| `apps/web/lib/i18n/languages.ts` | **New** — single source of truth: the 6, helpers, `languageDirective`, `JSON_LANGUAGE_RULE`, `resolveProspectLanguage`, `PROFILE_DEFAULT` |
| `apps/web/i18n/request.ts` | **New** — next-intl request config; reads `NEXT_LOCALE` cookie, deep-merges en-US fallback |
| `apps/web/next.config.ts` | Wrapped with `createNextIntlPlugin()` |
| `apps/web/app/layout.tsx` | `NextIntlClientProvider` at root; `<html lang>` from `getLocale()` |
| `apps/web/messages/{en-US,en-GB,es,pt-BR,fr,de}.json` | **New** — chrome catalogs (en-US base, all 6 authored) |
| `apps/web/scripts/translate-catalog.ts` | **New** — author-time catalog translation (for new locales / regen) |
| `apps/web/app/api/profile/locale/route.ts` | **New** — writes `rep_profiles.locale` + sets `NEXT_LOCALE` cookie |
| `apps/web/proxy.ts` | One-time `NEXT_LOCALE` cookie backfill for pre-i18n sessions |
| `apps/web/app/api/{research,check-updates,case-studies/match}/route.ts` | Append `languageDirective(profile.locale)` + `JSON_LANGUAGE_RULE` (rep-facing) |
| `apps/web/app/api/{refresh-email,pitch-opener}/route.ts` | Resolve language by audience + sticky write-back of the override |
| `apps/web/components/prospect/{EmailDraftButton,PitchOpenerButton}.tsx` | Language dropdown (6 + Profile default), pre-select override, send `languageSelection` |
| `apps/web/app/(app)/setup/{page,SetupForm}.tsx` | Locale selector (saves via the new route + `router.refresh()`); chrome strings extracted |
| `apps/web/app/login/page.tsx`, `app/access-denied/page.tsx`, `components/prospect/{Sidebar,JobsSection}.tsx`, `app/(app)/(gated)/prospects/[id]/page.tsx` | Chrome strings extracted to catalogs; cost displays use next-intl currency formatting |
| `apps/web/lib/types.ts` | `RepProfile.locale`, `Prospect.output_language_override` |

### Architecture decisions

- **Cookie mirrors the profile** — chrome locale reads `NEXT_LOCALE`, kept in lockstep
  with `rep_profiles.locale` by the locale route (+ a one-time proxy backfill). Avoids a
  Supabase hit per render across every route.
- **Deep-merge en-US fallback** in `i18n/request.ts` — partial/untranslated catalogs
  never blank the UI.
- **One source of truth** (`lib/i18n/languages.ts`) for the list, the directive, and the
  sentinel — the /setup selector, compose dropdowns, and prompts never hardcode their own.
- **JSON keys stay English** in structured prompts (`JSON_LANGUAGE_RULE`) — verified the
  research brief and case-study matcher still parse.
- **Chrome extraction scoped** to the high-visibility surfaces this session; remaining
  brief sub-components fall back to en-US (backlog: extraction sweep).

### ⚠️ Required after merge

1. Run `packages/db/migrations/2026-06-25_i18n.sql` in prod Supabase (same pattern as prior migrations).
2. Tag **v1.4.0** and bump the "Current version" line in the **root** `CLAUDE.md` in the same change.
3. Optional: have the Brazilian teammate review `messages/pt-BR.json`; regenerate any locale with `npx tsx scripts/translate-catalog.ts <code>`.

---

## Session 11 summary (Per-User Products + Mandatory Product Gate)

### What was built

Products moved from a shared admin-managed table to per-user ownership. Each rep now creates and manages their own products on the `/setup` page — reps selling different things can share the platform, and a rep can redefine their products when they change companies. Creating at least one product is mandatory: all ProspectLord pages redirect to `/setup` until the user has one.

### Files created / modified

| File | Change |
|---|---|
| `packages/db/schema.sql` | `products` rebuilt per-user: `user_id` column (not null), `created_by` dropped, admin RLS policies replaced with `Users manage own products`, index now `(user_id, created_at)` |
| `packages/db/migrations/2026-06-10_products_per_user.sql` | **New** — copies every shared product to every existing user, deletes shared rows, swaps policies/index |
| `lib/types.ts` | `Product`: `created_by` → `user_id` |
| `app/(app)/(gated)/layout.tsx` | **New** — mandatory-product gate; redirects to `/setup` when user has zero products |
| `app/(app)/(gated)/` | `page.tsx`, `prospects/`, `admin/` moved into the gated group (URLs unchanged) |
| `app/(app)/admin/products/` | **Deleted** — admin product management gone |
| `app/(app)/setup/ProductsManager.tsx` | **New** — per-user product CRUD (ported from AdminProductsClient); add form auto-opens at zero products; `router.refresh()` after add/delete so the gate updates |
| `app/(app)/setup/SetupForm.tsx` | Products now the first section, editable by everyone, outside the profile `<form>`; amber onboarding banner at zero products |
| `app/(app)/setup/page.tsx` | Products fetch scoped `.eq('user_id', user.id)`; passes `userId` to form |
| `app/api/research/route.ts` | Products fetch scoped to user; empty-products error no longer says "ask your admin" |
| `app/api/refresh-email/route.ts` | Products fetch scoped to user |
| `app/api/check-updates/route.ts` | Products fetch scoped to user |
| `components/prospect/Sidebar.tsx` | "Manage products →" admin link removed |
| `package.json` | Added `packageManager` field — required by turbo 2.9 to resolve workspaces |

### Architecture decisions

- **Migration copies products to every user** — nobody loses working state; each rep then edits their copies independently. Original shared rows are deleted.
- **`created_by` dropped** — redundant once `user_id` is the owner. Admin role now governs only case studies, team config, and invites.
- **Gate is a nested route group `(app)/(gated)/`** — canonical App Router pattern; layouts can't read the pathname, so exclusion of `/setup` is structural (it sits outside the group), not conditional. URLs are unchanged.
- **Gate counts via the user's RLS client** — head-only count query, no admin client in a layout.
- **API routes keep the admin client but add explicit `.eq('user_id', user.id)`** — client-side fetches (setup page, prospect page product selector) are auto-scoped by the new RLS policy.
- **Products section rendered outside the profile `<form>`** — pressing Enter in a product field must not submit the profile form; product saves are independent Supabase writes.

### ⚠️ Required migration

`packages/db/migrations/2026-06-10_products_per_user.sql` — **already run in prod Supabase** (2026-06-10). Fresh environments get the new shape from `schema.sql` directly.

---

## Session 10 summary (Org Disambiguation + Cost Transparency)

### What was built

Two-phase prospect add flow. Instead of firing the expensive Sonnet research call directly on raw user input, a cheap Haiku resolve call first identifies 1–4 candidate organizations, applies a territory confidence boost, and surfaces a confirmation dialog. The user always confirms before research fires. A cost transparency design principle was codified — dialogs at natural workflow pause points show a plain-language cost estimate.

### Files created / modified

| File | Change |
|---|---|
| `lib/types.ts` | Added `OrgCandidate` type (name, hq_region, hq_display, description, disambiguated_query, confidence) |
| `lib/costs.ts` | **New** — `COST_HINTS` constants: plain-language cost ranges per BYOK endpoint |
| `app/api/resolve/route.ts` | **New** — POST; Haiku call returning 1–4 candidates with confidence scores; territory boost (+0.15) applied server-side; sorted descending before return |
| `components/prospect/OrgDisambiguationDialog.tsx` | **New** — confirmation dialog; adapts header for 1 vs multiple results; cost hint in footer; "Search anyway" text link as escape hatch |
| `components/prospect/AddProspectInput.tsx` | Updated — calls `/api/resolve` first, always shows dialog, passes `disambiguated_query` to research; falls through to research directly if resolve errors |

### Architecture decisions

- **Always show the dialog** — even for unambiguous single matches. Research is expensive ($0.10–$0.40) and slow; the confirmation step is worth the friction.
- **Haiku for resolve, Sonnet for research** — resolve is a lightweight identification task. Haiku is accurate enough and costs ~$0.0005 per call. Not counted against the daily rate limit; not logged to `api_usage`.
- **Territory confidence boost, not hard filter** — territory matches get +0.15 on confidence and float to the top, but out-of-territory candidates are still shown. The rep decides; the app just surfaces the most likely match first.
- **`disambiguated_query` passed to research** — e.g. `"Delta Air Lines (NYSE: DAL, Atlanta GA)"` instead of `"Delta"`. Gives the Sonnet research loop a clean, unambiguous starting point.
- **Cost hints only at pause points** — `lib/costs.ts` defines ranges for research, refresh, follow-up, email refresh. Nothing shown for sub-cent operations (resolve, case study match). Principle: never show cost hints mid-flow, only when the UI is already paused waiting for user input.
- **Resolve errors fall through** — if `/api/resolve` fails (network error, no API key), `AddProspectInput` falls through to `/api/research` directly. Research returns the same auth/config error with a proper message. No silent failures.

### Cost transparency design principle (new)

Any BYOK operation with estimated cost ≥ ~$0.01 should surface a plain-language cost range at the nearest natural workflow pause point. Never mid-flow, never with false precision. `lib/costs.ts` is the single source of truth for these ranges — update it when model pricing or typical token volumes change materially.

---

## Session 9 summary (Decision Maker Targeting Tiers)

### What was built

Full targeting tier feature. Research prompt now tiers each decision maker based on team-level seniority band and function rules. DM cards sort automatically — prime targets first, intel/low signal below. No badges, no separate sections — position does the work.

### Files created / modified

| File | Change |
|---|---|
| `supabase/schema.sql` | Added `targeting_tier` + `tier_reasoning` to `decision_makers`; added `team_config` table + RLS + index |
| `lib/types.ts` | Added `TargetingTier` type; `targeting_tier` + `tier_reasoning` to `DecisionMaker`; new `TeamConfig` type |
| `app/api/admin/team-config/route.ts` | **New** — GET (any authed user) + PUT (admin-only upsert of singleton row) |
| `app/(app)/setup/page.tsx` | Added `team_config` fetch in parallel block; passes to `SetupForm` |
| `app/(app)/setup/SetupForm.tsx` | New Targeting section — chip selectors for seniority bands + functions, custom add inputs, admin-only edit, separate "Save targeting" button |
| `components/prospect/DecisionMakers.tsx` | Single flat list sorted by tier rank then sort_order; no badges, no section splits |
| `app/api/research/route.ts` | Fetches `team_config`; injects `seniority_bands` + `target_functions` into system prompt; validates and writes `targeting_tier` + `tier_reasoning` on DM insert |

### Architecture decisions

- **`team_config` singleton, not per-rep** — targeting rules are consistent across the team; no per-rep override needed. Admin edits via the Targeting section of `/setup`.
- **No manual tier override on DM cards** — reps manage contacts in their CRM. This app is for initial prospecting, not contact lifecycle management.
- **`null` targeting_tier treated as `prime_target`** — existing DMs before migration are shown as prime targets optimistically. They'll get proper tiers on next re-research.
- **Single flat list, sort only** — tried separate "Prime targets" / "Intel only" section cards; felt disorienting. Dropped to a single list sorted by tier. Position conveys priority without explicit labeling.
- **`type="search"` for custom chip inputs** — Chrome ignores `autoComplete="off"` and `autoComplete="new-password"` on inputs it heuristically associates with credentials. `type="search"` is the one input type Chrome won't autofill.
- **Preset lists baked into `SetupForm`** — 9 seniority bands + 14 target functions defined as constants in the component. Custom additions are persisted to `team_config` and surfaced alongside presets on next load.

### Supabase migration run this session

```sql
alter table decision_makers
  add column if not exists targeting_tier text not null default 'prime_target',
  add column if not exists tier_reasoning text;

create table team_config (
  id                uuid primary key default gen_random_uuid(),
  seniority_bands   jsonb not null default '[]',
  target_functions  jsonb not null default '[]',
  updated_at        timestamptz default now()
);
alter table team_config enable row level security;
create policy "Authenticated users can read team config"
  on team_config for select using (auth.role() = 'authenticated');
create index on team_config (updated_at desc);
```

### ⚠️ First-use step

Go to `/setup` → Targeting section → select your target bands and functions → Save targeting. Until this is done, the research prompt will note that targeting is unconfigured and use model judgment.

---

## Session 7 summary (Case Study Matcher — full implementation)

### What was built

Full Case Study Matcher feature. All routes, UI components, and wiring are complete. **Feature is code-complete but not yet end-to-end tested — waiting on Pentaho PDF from Jon.**

### Files created / modified

| File | Change |
|---|---|
| `supabase/schema.sql` | Added `case_studies` table + RLS + Storage bucket setup notes + index |
| `lib/types.ts` | Added `CaseStudy`, `CaseStudyMatch` types; extended `ApiUsage.endpoint` union |
| `lib/pdf/CaseStudiesPdf.tsx` | PDF document component (separate `.tsx` so route stays `.ts`) |
| `app/api/admin/case-studies/route.ts` | GET + POST + DELETE — admin CRUD, service role only |
| `app/api/admin/case-studies/import-deck/route.ts` | PDF → png (pdf-to-img) → Claude vision → DB + Storage |
| `app/admin/case-studies/page.tsx` | Admin page — server component, admin gate |
| `app/admin/case-studies/AdminCaseStudiesClient.tsx` | Client CRUD + PDF import UI |
| `app/api/case-studies/match/route.ts` | Prospect matching — single Claude call, no web search |
| `app/api/case-studies/slide-url/[id]/route.ts` | Signed URL for slide images (1hr expiry) |
| `app/api/case-studies/export-pdf/route.ts` | PDF export — signed URLs → @react-pdf/renderer |
| `components/prospect/CaseStudySection.tsx` | Right column UI — idle/loading/results states, export |
| `components/prospect/CaseStudySlideModal.tsx` | Slide preview modal |
| `components/prospect/RightColumn.tsx` | Added `CaseStudySection` (hidden when library is empty) |
| `components/prospect/Sidebar.tsx` | Added "Case studies →" admin link |
| `app/(app)/prospects/[id]/page.tsx` | Added `caseStudyCount` fetch + passed to `RightColumn` |
| `vercel.json` | Added maxDuration for import-deck (60s), match (30s), export-pdf (30s) |
| `package.json` | Added `pdf-to-img` |

### Architecture decisions

- **`pdf-to-img` instead of `pdf2pic`** — `pdf-to-img` wraps `pdfjs-dist` with no system binary deps. Works in Vercel serverless; no Ghostscript required.
- **PDF component in `lib/pdf/CaseStudiesPdf.tsx`** — Route handlers are `.ts` files; JSX lives in a separate `.tsx` file, imported and invoked via `React.createElement()`.
- **Import is additive** — never wipes existing records. Re-uploading the same filename creates new records; admin deletes duplicates inline.
- **30-slide cap per import run** — prevents Vercel 60s timeout on large decks. Import is additive, so large decks can be uploaded in parts.
- **`caseStudyCount` fetched at page load** — single `count` query added to the parallel fetch in the prospect page. `CaseStudySection` only renders if count > 0, avoiding unnecessary rendering.
- **Signed URLs are short-lived** — 1hr for slide preview (modal fetches on open), 5min for export (server-side use only).

### ⚠️ Required before feature is usable (one-time setup)

1. Run Supabase migration (copy the case_studies block from `supabase/schema.sql`)
2. Create Storage bucket `case-study-slides` (private) in Supabase dashboard
3. Import deck — go to `/admin/case-studies`, upload the Pentaho PDF
4. Verify — check import count, review extracted records, run "Find matches" on a prospect

### Known risks / watch points

- **pdf-to-img on Vercel** — needs real-world test. If pdfjs-dist has runtime issues, fallback is ZIP-of-PNGs (BACKLOG deferred v2).
- **Edit functionality** — admin client-side edit does an optimistic state update but does NOT persist via API. Admin should delete + re-add if inline editing is needed before a PATCH endpoint is added.

---

## What's next (priority order)

1. **Case Study Matcher seeding** — code complete; waiting on Pentaho PDF. Steps: run schema migration, create `case-study-slides` Storage bucket (private), upload PDF at `/admin/case-studies`, verify import + matching.
2. **`/api/cron/refresh-all`** — weekly refresh + Resend digest (not urgent — cron schedule already in vercel.json)
3. **Background job pattern** — if research quality at 3 iterations proves insufficient, move to Inngest
4. **Follow-up route + panel** — de-prioritized; initial outreach focus only for now

---

## Earlier sessions (1–6 and 8) archived

See git history for full session summaries. Key milestones:
- Session 1: scaffold, auth, sidebar
- Session 2: research route, prospect summary page
- Session 3: shared products, PDF export, email panel
- Session 4: BYOK, invite management, Vercel deployment
- Session 5: Check for Updates, crash recovery, timeout fixes
- Session 6: Case Study Matcher design
- Session 8: Decision Maker Targeting Tiers design
