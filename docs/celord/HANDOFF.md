# CELord — Handoff

## Current state: Session 2 complete — real collectors built

CELord v0 Session 2 is done. All three collectors now have real implementations
that activate when the corresponding API keys are present in `.env.local`.
Cron routes are wired up and scheduled. Next up is Session 3 (entity resolution
+ enrichment + UI reading from DB).

See `docs/celord/CLAUDE.md` for full architectural context.
See `docs/prospectlord/` for the existing ProspectLord app (untouched).

## Repo structure decisions (locked)

- No `src/` directory. CELord-specific code at repo root:
  - `core/` — shared domain model (package-in-waiting)
  - `signals/` — collectors, enrichment, scoring (package-in-waiting)
  - `app/celord/` — CELord routes (real route segment, not a route group)
- Existing `app/(app)/`, `components/`, `lib/` are untouched.
- Navigation: `components/PlatformRibbon.tsx` — top ribbon in root layout.

## Session 1 summary (foundation)

| File | What |
|---|---|
| `CLAUDE.md` (root) | Rewritten — shared platform context only |
| `docs/celord/` | Three spec files |
| `components/PlatformRibbon.tsx` | ProspectLord/CELord tab strip |
| `app/layout.tsx` | Ribbon wired in |
| `core/types.ts` | Organization, Signal, Location, OrgType, CustomerStatus |
| `signals/collectors/types.ts` | Collector, RawSignal, CollectorConfig interfaces |
| `signals/scoring.ts` | 4-dimension composite scorer + groupAndScore() |
| `app/celord/layout.tsx` | Minimal CELord layout |
| `app/celord/prospects/page.tsx` | Server component — runs collectors, scores, renders |
| `components/celord/ProspectsTable.tsx` | Sortable table, territory filter, CSV export |
| `supabase/schema.sql` | CELord tables appended |

## Session 2 summary (real collectors)

| File | What |
|---|---|
| `signals/collectors/github.ts` | Real GitHub code search (extension:ktr/kjb + pom.xml); stubs when no GITHUB_TOKEN |
| `signals/collectors/shodan.ts` | Real Shodan host search (http.title:"Pentaho User Console"); stubs when no SHODAN_API_KEY |
| `signals/collectors/jobs.ts` | Real SerpApi (Google Jobs) + Adzuna fallback; stubs when no keys |
| `signals/persist.ts` | NEW — shared DB write helper (signals + org resolution + signal_links) |
| `app/api/celord/collect/github/route.ts` | NEW — cron route, daily 02:00 UTC |
| `app/api/celord/collect/shodan/route.ts` | NEW — cron route, daily 02:30 UTC |
| `app/api/celord/collect/jobs/route.ts` | NEW — cron route, daily 03:00 UTC |
| `vercel.json` | Updated — three CELord cron schedules + function timeouts added |

### Architecture decisions made in Session 2

- **Stub-first preserved** — each real collector returns fixtures when no key is
  configured. The UI at `/celord/prospects` still works without credentials.
- **Dedup by `source_url`** — `persistSignals()` skips signals already in DB,
  so re-running a cron is safe.
- **Simple entity resolution** — domain-exact match, then case-insensitive name
  match, then create. Full fuzzy/LLM resolution is Session 3.
- **Confidence levels** — domain-exact links get 0.90; name-only gets 0.70.
- **Cloud provider handling (Shodan)** — when the ASN org is a cloud provider
  (AWS, Azure, etc.), fall back to PTR hostname for org identity.
- **Staffing agency filtering (Jobs)** — known staffing firms are skipped so
  the hiring org name isn't polluted with Randstad/Manpower/etc.
- **GitHub rate limit handling** — 2.1s sleep between requests; watches
  `X-RateLimit-Remaining`, sleeps to reset time if < 3 remaining.
- **GitHub dedup by repo** — counts .ktr/.kjb/pom hits per repo, emits one
  signal per repo with a summary snippet.

### ⚠️ Supabase migration still required

Run the CELord migration block from `supabase/schema.sql` in the Supabase SQL
editor before the cron routes can write to the DB. The UI still works without
it (fixture data is in-memory).

### Local dev note

When running from a worktree, copy `.env.local` from the main repo root into
the worktree directory and run `npm run dev` from the worktree.

To test a cron route manually:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/celord/collect/github
```

## Session 3 plan (entity resolution + enrichment + UI from DB)

1. **Real entity resolution** — fuzzy name matching, LLM-assisted resolution
   for ambiguous cases. Replace the v0 name-ilike stub in `signals/persist.ts`.
2. **Enrichment** — Haiku 4.5 LLM pass to determine billing HQ (country,
   state/province, city), org type (end_user/integrator/vendor), industry.
   Write results to `enrichment_runs` table.
3. **UI reads from DB** — update `/celord/prospects/page.tsx` to query the
   `organizations` + `signal_links` + `enrichment_runs` tables instead of
   calling collectors inline. Collectors become background-only (cron).
4. **Cron enrichment route** — `/api/celord/enrich` processes orgs that
   haven't been enriched yet (or where enrichment is stale).

## Open questions resolved in Session 2

- **Shodan query** — `http.title:"Pentaho User Console"` confirmed as primary
  fingerprint. Secondary `http.html:"/pentaho/Home"` available for Freelancer tier.
- **GitHub pagination** — 2 pages × 3 queries = 6 requests, with 2.1s sleeps.
  Stays within 30 req/min authenticated limit.
- **SerpApi vs Adzuna** — implemented both; SerpApi is primary (Google Jobs
  has better global coverage), Adzuna is fallback. Add both keys to use both.
- **Vercel timeout** — GitHub cron gets 60s (pagination + rate limit waits);
  Shodan and Jobs get 30s each. No chunking needed at free-tier volumes.

## Definition of done for v0

Jon can navigate to `/celord/prospects`, see a ranked list of North American
organizations likely using Pentaho CE, filter by state/province, click into an
org to see contributing signals, and export to CSV. Ranked list has fewer than
~50% obvious false positives on manual review of the top 50. No regressions in
existing ProspectLord functionality.
