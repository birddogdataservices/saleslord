# CELord — Handoff

## Current state: Session 3 complete — entity resolution + enrichment + UI from DB

CELord v0 Session 3 is done. The full pipeline is now live:
collectors → DB → entity resolution → enrichment → UI from DB.

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
| `app/api/celord/collect/github/route.ts` | NEW — cron route, monthly on the 1st at 02:00 UTC |
| `app/api/celord/collect/shodan/route.ts` | NEW — cron route, monthly on the 1st at 02:30 UTC |
| `app/api/celord/collect/jobs/route.ts` | NEW — cron route, monthly on the 1st at 03:00 UTC |
| `vercel.json` | Updated — three CELord cron schedules + function timeouts added |

## Session 3 summary (entity resolution + enrichment + UI from DB)

| File | What |
|---|---|
| `signals/persist.ts` | Rewritten — fuzzy name resolution + Haiku LLM disambiguation (0.50–0.79 similarity) |
| `signals/enrichment.ts` | NEW — Haiku 4.5 enrichment (billing_hq, org_type, confidence); writes enrichment_runs + locations |
| `app/api/celord/enrich/route.ts` | NEW — cron route, monthly on the 1st at 04:00 UTC; processes up to 50 unenriched/stale orgs |
| `app/celord/prospects/page.tsx` | Rewritten — reads from DB (organizations + signal_links + signals + locations + enrichment_runs) |
| `components/celord/ProspectsTable.tsx` | Updated — new `ProspectRow` type; org type column + filter; customer status badge; enrichment confidence in drill-down |
| `vercel.json` | Enrich cron + 300s function timeout added |
| `CLAUDE.md` (root) | `ANTHROPIC_API_KEY` added to env var block |
| `.env.local` | `ANTHROPIC_API_KEY` added (server-side, CELord cron only) |

### Architecture decisions made in Session 3

- **Server env var for enrichment** — `ANTHROPIC_API_KEY` is used for CELord cron/enrichment jobs.
  ProspectLord interactive routes continue to use per-user BYOK. Cron jobs have no user context,
  so BYOK doesn't apply. Company handoff will consolidate to a single server key.
- **Fuzzy entity resolution** — three-pass: (1) domain exact, (2) normalized name similarity ≥ 0.80
  (Jaccard token overlap + prefix bonus, strips legal suffixes), (3) Haiku YES/NO for 0.50–0.79.
  Below 0.50 always creates a new org row.
- **Enrichment staleness** — 30-day TTL. Orgs enriched within 30 days are skipped by the cron.
- **Batch cap** — enrichment cron processes at most 50 orgs per run to bound cost.
- **Cost attribution** — enrichment cron writes to `api_usage` attributed to the first admin user
  (FK constraint on `user_id` requires a real auth.users row; no user context in cron).
- **UI territory from enrichment** — billing_hq location (written by enrichment) takes precedence
  over signal-derived country/state for territory filtering. Falls back to signal origin if not enriched.
- **Collectors stay background-only** — `/celord/prospects/page.tsx` no longer calls collectors inline.
  All data flows through: cron → DB → UI.
- **`ProspectRow` extends `ScoredOrg`** — org_type, customerStatus, enrichmentConfidence added as
  optional fields so scoring.ts stays pure (no DB awareness).

### ⚠️ First-run steps

1. Add `ANTHROPIC_API_KEY` to Vercel environment variables (already in `.env.local`).
2. Trigger the collector crons manually to populate the DB:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/celord/collect/github
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/celord/collect/shodan
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/celord/collect/jobs
   ```
3. Trigger enrichment:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/celord/enrich
   ```
4. Navigate to `/celord/prospects` — should show orgs from DB with territory from enrichment.

### Local dev note

When running from a worktree, copy `.env.local` from the main repo root into the worktree directory
and run `npm run dev` from the worktree.

## Session 4 plan (v0 completion)

1. **Org detail page** — `/celord/prospects/[id]` — shows all signals, enrichment result, status history.
   "Mark as customer / DNC / failed conversion" actions that write `customer_status` + `org_status_history`.
2. **Watchlist** — `celord_watchlists` table stub is ready; wire up a simple "Watch this org" button
   that saves to the watchlist. Email alert on new signal (Resend) is post-v0.
3. **CRM import** — CSV import flow for `customer_status` bulk-set (active_customer + failed conversions).
   Spec in `docs/celord/BACKLOG.md`.
4. **False-positive rate check** — manual review of top 50 in production. Tune scoring weights or
   add noise filters if >50% obvious FPs.

## Definition of done for v0

Jon can navigate to `/celord/prospects`, see a ranked list of North American organizations likely
using Pentaho CE, filter by state/province, click into an org to see contributing signals, and
export to CSV. Ranked list has fewer than ~50% obvious false positives on manual review of the
top 50. No regressions in existing ProspectLord functionality.
