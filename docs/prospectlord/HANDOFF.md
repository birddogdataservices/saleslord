# ProspectLord — Handoff

## Current version: 0.7.0 — Decision Maker Targeting Tiers

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
