# CELord — Handoff

## Current state: Session 1 complete — foundation built

CELord v0 Session 1 is done. The architecture is in place: domain types,
stub collectors with fixture data, scoring, DB migrations, top ribbon, and
a working ranked list UI at `/celord/prospects`. Next up is Session 2
(real collectors).

See `docs/celord/CLAUDE.md` for full architectural context and the staged plan.
See `docs/prospectlord/` for the existing ProspectLord app's documentation
(untouched during CELord v0 work).

## Repo structure decisions (locked)

- No `src/` directory. New CELord-specific code lives at the repo root
  alongside existing ProspectLord folders:
  - `core/` — shared domain model (package-in-waiting)
  - `signals/` — collectors, enrichment, scoring (package-in-waiting)
  - `app/celord/` — CELord routes (real route segment, not a route group)
- Existing `app/(app)/`, `components/`, `lib/` are untouched.
- Navigation: `components/PlatformRibbon.tsx` — top ribbon in root layout,
  tabs for ProspectLord (`/`) and CELord (`/celord/prospects`).

## Session 1 summary

### What was built

| File | What |
|---|---|
| `CLAUDE.md` (root) | Rewritten — shared platform context only |
| `HANDOFF.md` (root) | Pointer doc — CELord active, ProspectLord stable |
| `docs/prospectlord/` | Three sub-docs migrated from root |
| `docs/celord/` | Three spec files, updated for Option A paths |
| `components/PlatformRibbon.tsx` | ProspectLord/CELord tab strip (client component) |
| `app/layout.tsx` | Ribbon wired in, body restructured to flex-col |
| `core/types.ts` | Organization, Signal, Location, OrgType, CustomerStatus, etc. |
| `signals/collectors/types.ts` | Collector, RawSignal, CollectorConfig interfaces |
| `signals/collectors/github.ts` | Stub — 7 realistic fixture signals |
| `signals/collectors/shodan.ts` | Stub — 5 fixture signals with server banners |
| `signals/collectors/jobs.ts` | Stub — 8 fixture signals from job postings |
| `signals/scoring.ts` | 4-dimension composite scorer + groupAndScore() |
| `app/celord/layout.tsx` | Minimal CELord layout |
| `app/celord/prospects/page.tsx` | Server component — runs stubs, scores, renders |
| `components/celord/ProspectsTable.tsx` | Sortable table, territory filter, CSV export, expandable evidence |
| `supabase/schema.sql` | CELord tables appended (organizations, signals, signal_links, locations, enrichment_runs, org_status_history) |

### Architecture decisions made

- **No `src/` directory** — `core/` and `signals/` live at repo root alongside
  `lib/` and `components/`. Stage 2 extraction is equally mechanical either way.
- **`app/celord/` not `app/(celord)/`** — route groups strip the segment from
  the URL, which would collide with ProspectLord's `/prospects` route. Real
  route segment gives clean `/celord/*` URLs.
- **Stub-first collectors** — early return on missing API key, returns hardcoded
  fixtures. Full pipeline (scoring, UI) works without any credentials. Flip to
  live by removing the early return when keys are in `.env.local`.
- **Light theme for CELord** — white background, black/gray text. Visually
  distinct from ProspectLord's dark theme.

### ⚠️ Supabase migration required

Run the CELord migration block from `supabase/schema.sql` in the Supabase
SQL editor before Session 2. The UI works without it (fixture data is in-memory)
but real collector writes will fail without the tables.

### Local dev note

When running from a worktree, copy `.env.local` from the main repo root into
the worktree directory and run `npm run dev` from the worktree. The Turbopack
workspace root warning is harmless — suppress it by setting `turbopack.root`
in `next.config.ts` if desired.

## Session 2 plan (real collectors)

1. **GitHub collector** — flip stub when `GITHUB_TOKEN` present. Real GitHub
   code search API: `search/code?q=extension:ktr`, `extension:kjb`,
   `pentaho-kettle` in Maven pom.xml. Handle pagination + 10 req/min rate limit.
2. **Shodan collector** — flip stub when `SHODAN_API_KEY` present. Probe actual
   Pentaho server fingerprints first (see open questions below). Handle free-tier
   pagination limits.
3. **Jobs collector** — flip stub when `SERPAPI_KEY` or Adzuna keys present.
   Queries: "Pentaho", "Kettle ETL", "Pentaho Data Integration", "PDI developer".
4. **Cron routes** — `/api/celord/collect/github`, `/shodan`, `/jobs`. Add to
   `vercel.json` cron schedules.

## Open questions for Session 2

- Exact Shodan query strings — probe what HTTP banners Pentaho servers actually
  expose before committing to specific queries.
- GitHub code search pagination — 10 req/min unauthenticated, 30 authenticated.
  Plan for multi-page results.
- SerpApi vs Adzuna — test both for job coverage on Pentaho queries; pick winner.
- Vercel timeout — Shodan sweeps may need chunking or a background worker if
  free-tier result volume is large.

## Definition of done for v0

Jon can navigate to `/celord/prospects`, see a ranked list of North American
organizations likely using Pentaho CE, filter by state/province, click into an
org to see contributing signals, and export to CSV. Ranked list has fewer than
~50% obvious false positives on manual review of the top 50. No regressions in
existing ProspectLord functionality.
