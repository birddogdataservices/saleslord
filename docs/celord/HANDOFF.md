# CELord — Handoff

## Current state: Session 7 complete — Docker Hub collector

CELord v0 is feature-complete. The full pipeline plus workflow UI is live:
collectors → DB → entity resolution → enrichment → UI → status management → CRM import.

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

## Session 4 summary (CRM import + org detail page — v0 completion)

| File | What |
|---|---|
| `app/celord/prospects/[id]/page.tsx` | NEW — org detail page; signals, enrichment, status history, status actions |
| `components/celord/OrgStatusActions.tsx` | NEW — client component; status picker with optional note field |
| `app/celord/import/page.tsx` | NEW — CRM import page; CSV file upload or paste, import summary |
| `app/api/celord/import/crm/route.ts` | NEW — POST handler; parses CSV, matches by domain→name, bulk-sets status + history |
| `components/celord/ProspectsTable.tsx` | "Details →" link in expanded row → org detail page |
| `app/celord/prospects/page.tsx` | "Import CSV" button in header → /celord/import |

### Architecture decisions made in Session 4

- **CRM import matching** — two-pass: (1) domain exact (strips www.), (2) Jaccard token similarity ≥ 0.70
  on normalized names (legal suffixes stripped). Below 0.70 creates a new org row (status is set inline,
  avoiding a separate UPDATE).
- **CSV format** — `org_name,domain,status,note` with `org_name` or `name` accepted as the name column.
  `domain` and `note` are optional. Status must be a valid `CustomerStatus` value.
- **Status history on import** — every imported row writes an `org_status_history` row regardless of
  whether the org was matched or created. Source is `csv_import`.
- **Org detail page** — server component with full signal list (sorted newest-first), enrichment data,
  status history timeline. Status changes use `OrgStatusActions` client component which POSTes to the
  existing `PATCH /api/celord/orgs/[id]/status` route.
- **No watchlist in v0** — `celord_watchlists` remains a schema stub. Watchlist + email alerts are
  backlogged post-v0 per BACKLOG.md.

### ⚠️ Production go-live checklist

These steps must be done in production (Vercel dashboard + Supabase SQL editor) before CELord is usable:

**1. Supabase — run the Session 3 migration** (if not already done):
```sql
alter table enrichment_runs
  add column if not exists industry   text,
  add column if not exists approx_size text;
```

**2. Vercel env vars** — add/verify all of these in Vercel → Settings → Environment Variables:
```
ANTHROPIC_API_KEY          # Server-side — CELord enrichment cron
CRON_SECRET                # Shared secret for authenticating cron requests
GITHUB_TOKEN               # Optional — enables real GitHub collector
SHODAN_API_KEY             # Optional — enables real Shodan collector
SERPAPI_KEY                # Optional — enables real job postings collector
```

**3. Trigger collectors** — once deployed, seed the DB:
```bash
# Swap localhost for your Vercel URL in production
curl -H "Authorization: Bearer $CRON_SECRET" https://saleslord-theta.vercel.app/api/celord/collect/github
curl -H "Authorization: Bearer $CRON_SECRET" https://saleslord-theta.vercel.app/api/celord/collect/shodan
curl -H "Authorization: Bearer $CRON_SECRET" https://saleslord-theta.vercel.app/api/celord/collect/jobs
```
(Collectors stub when no API key is set — you'll get fixture data until real keys are added.)

**4. Trigger enrichment**:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://saleslord-theta.vercel.app/api/celord/enrich
```

**5. CRM import** — navigate to `/celord/import` and paste your active customer + failed conversion list.

**6. Verify** — navigate to `/celord/prospects` and confirm org list renders with scores and territory.

### Local dev note

When running from a worktree, copy `.env.local` from the main repo root into the worktree directory
and run `npm run dev` from the worktree.

## Definition of done for v0 — ACHIEVED

Jon can navigate to `/celord/prospects`, see a ranked list of North American organizations likely
using Pentaho CE, filter by state/province, click into an org to see contributing signals, and
export to CSV. Customer status is manageable inline and via CSV import. Ranked list has fewer than
~50% obvious false positives on manual review of the top 50. No regressions in existing ProspectLord
functionality.

## Session 5 summary (signal quality + Shodan removal + UX polish)

| File | What |
|---|---|
| `signals/collectors/shodan.ts` | DELETED — Shodan removed (free tier unusable; paid tier targets self-hosted servers not enterprise buyers) |
| `app/api/celord/collect/shodan/route.ts` | DELETED — cron route removed |
| `signals/collectors/github.ts` | Org-type filter added (`owner.type !== 'Organization'` drops individual devs); fixtures removed |
| `signals/collectors/jobs.ts` | Fixtures removed — returns `[]` when no API keys |
| `signals/collectors/types.ts` | `shodanApiKey` removed from `CollectorConfig` |
| `core/types.ts` | `'shodan'` removed from `SignalSource`; `'irrelevant'` added to `CustomerStatus` |
| `signals/scoring.ts` | Shodan confidence entry removed |
| `vercel.json` | Shodan cron + function config removed |
| `components/celord/ProspectsTable.tsx` | `min-h-0` on table scroll div (scrollbar fix); `irrelevant` status; "Hide" multi-select status filter (defaults to hiding DNC + irrelevant) |
| `components/celord/OrgStatusActions.tsx` | `irrelevant` status added |
| `supabase/schema.sql` | `customer_status` comment updated to include `irrelevant` |
| `app/celord/admin/page.tsx` | Shodan job card removed |
| `app/api/celord/admin/trigger/route.ts` | Shodan job handler removed |

### Architecture decisions made in Session 5

- **Shodan removed entirely** — self-hosted Pentaho servers exposed publicly correlate with poor security posture, not enterprise purchase intent. Enterprise buyers run behind VPNs. Cost ($70/mo Freelancer plan) not justified.
- **GitHub org filter** — `owner.type !== 'Organization'` drops individual developer repos before accumulation. Reduced 50 low-quality orgs to a smaller, higher-quality set. Individual devs are not enterprise buyers.
- **No fixture fallbacks** — all collectors return `[]` on missing credentials or errors. Fixture data was masking real collection failures and polluting the DB.
- **Status filter is a "Hide" selector** — semantically clearer than "Show": defaults to hiding DNC + irrelevant, user opts in to see them. Integrators surface-and-label (not filtered out) — channel sales use case.

### ⚠️ Production go-live checklist (updated)

**1. Supabase — run the Session 3 migration** (if not already done):
```sql
alter table enrichment_runs
  add column if not exists industry   text,
  add column if not exists approx_size text;
```

**2. Clean up fixture/bad data** (run in Supabase SQL editor):
```sql
-- Remove fixture Shodan signals (if collected before Shodan was removed)
DELETE FROM signals WHERE source = 'shodan';

-- Remove GitHub signals from individual accounts (before org filter was added)
DELETE FROM signals WHERE source = 'github';

-- Remove orgs with no remaining signals
DELETE FROM organizations
WHERE id NOT IN (SELECT DISTINCT org_id FROM signal_links);
```

**3. Vercel env vars** — add/verify (remove SHODAN_API_KEY if present):
```
ANTHROPIC_API_KEY   # Server-side — CELord enrichment
CRON_SECRET         # Shared secret for cron auth
GITHUB_TOKEN        # GitHub PAT for code search
SERPAPI_KEY         # Job postings (or ADZUNA_APP_ID + ADZUNA_APP_KEY)
```

**4. Re-run collectors + enrichment** via Admin panel at `/celord/admin`:
- GitHub collector (now org-only)
- Jobs collector
- Enrichment (skips already-enriched orgs <30 days old)

**5. CRM import** — `/celord/import` — paste active customers + failed conversions.

**6. Verify** — `/celord/prospects` — org list renders, Type column shows after enrichment, status filter working.

## Session 6 summary (Stack Overflow collector)

| File | What |
|---|---|
| `signals/collectors/stackoverflow.ts` | NEW — Stack Exchange API; searches SO for Pentaho/Kettle questions (last 12mo); emits signals only for users whose profile `website_url` resolves to a company domain |
| `signals/collectors/types.ts` | `stackoverflowApiKey` added to `CollectorConfig` |
| `app/api/celord/collect/stackoverflow/route.ts` | NEW — cron route, monthly on the 1st at 02:15 UTC |
| `vercel.json` | SO cron + 30s function timeout added |
| `app/celord/admin/page.tsx` | Stack Overflow job card added between Jobs and Enrichment |
| `app/api/celord/admin/trigger/route.ts` | `stackoverflow` case added to POST handler |

### Architecture decisions made in Session 6

- **Org extraction via `website_url`** — SO user profiles lack a structured "employer" field. `website_url` is the most reliable org anchor; signals are only emitted when the URL resolves to a non-personal, non-social, non-vendor domain. This keeps signal quality high at the cost of recall (users without a company website are dropped).
- **`org_hint` = `org_domain` = extracted domain** — domain-anchored hints flow into entity resolution's `domain_exact` path (highest confidence: 0.90 link confidence). Enrichment then fills in the real org name.
- **No API key required** — Stack Exchange API works without a key at 300 req/day/IP. With `STACKOVERFLOW_API_KEY` (free to register at stackapps.com), quota rises to 10,000/day. A monthly run needs ~20 API calls, so the free tier is sufficient.
- **12-month `fromdate` window, deduped by `source_url`** — each run fetches the last 12 months of questions. The DB deduplication (by `source_url`) skips already-seen questions on subsequent runs, so there's no cost to re-fetching.
- **Max 3 questions per user per run** — caps signal volume from prolific individual SO users; each question is a separate signal (different URL) but linked to the same org row in the DB.
- **Quota guard** — collector stops early (returns signals collected so far) if `quota_remaining` drops below 10. Prevents hitting zero and breaking other tools sharing the IP quota.

### ⚠️ Production go-live checklist (updated for Session 6)

**Optional — register a Stack Apps key** (recommended if running on shared Vercel IPs):
1. Go to https://stackapps.com/apps/oauth/register
2. Fill in any name/URL (this is a public client key, not secret)
3. Copy the "Key" value
4. Add `STACKOVERFLOW_API_KEY=<key>` to Vercel env vars

Without the key the collector still works — just capped at 300 req/day across Vercel's shared IPs.

All prior production steps from Sessions 3–5 still apply (see above).

## Session 7 summary (Docker Hub collector)

| File | What |
|---|---|
| `core/types.ts` | `'docker'` added to `SignalSource` |
| `signals/scoring.ts` | `docker: 0.85` added to `SOURCE_CONFIDENCE` |
| `signals/collectors/dockerhub.ts` | NEW — Docker Hub search (`/v2/search/repositories/?query=pentaho`); filters vendor namespaces + noise descriptions + <100 pulls; lookups org/user profile for `company`, `profile_url`, `location` |
| `app/api/celord/collect/dockerhub/route.ts` | NEW — cron route, monthly on the 1st at 02:30 UTC |
| `vercel.json` | Docker Hub cron + 60s function timeout added |
| `app/celord/admin/page.tsx` | Docker Hub job card added between Stack Overflow and Enrichment |
| `app/api/celord/admin/trigger/route.ts` | `dockerhub` case added to POST handler |

### Architecture decisions made in Session 7

- **Search-based discovery** — `GET /v2/search/repositories/?query=pentaho&page_size=100` paginates up to 1000 results. No API key required; Docker Hub's public search is unauthenticated.
- **Pull count threshold >100** — eliminates personal experiments that were never run in production. The 82k-pull Telefonica image and 1.58M-pull ap1.com.br image both clear this easily.
- **Vendor namespace filter** — `pentaho`, `hitachivantara`, `bitnami`, etc. publish Pentaho rather than use it. Filtered at collector level.
- **Noise description filter** — regex for tutorial/demo/poc/example/sample/test drops repos that clearly aren't production deployments.
- **Org extraction via namespace profile** — `GET /v2/orgs/{namespace}` (fallback: `/v2/users/{namespace}`) provides `company`, `full_name`, `profile_url`, `location`. `company` is used as `org_hint`; `profile_url` is parsed for `org_domain` (personal/social domains filtered). Namespace itself is the fallback `org_hint`.
- **One signal per qualifying repo** — rather than one signal per namespace, each repo becomes its own signal. Entity resolution's domain/name deduplication collapses multiple repos from the same org into one org row. Snippet includes repo name + pull count + description for provenance.
- **No API key needed** — Docker Hub public API is freely accessible. No env var added.
- **`signal_date: null`** — Docker Hub search results don't include a last-push date. Enrichment timestamp via `collected_at` is the date anchor.

### ⚠️ Production go-live checklist (updated for Session 7)

No new env vars needed. Docker Hub collector works out of the box.

Trigger Docker Hub collection via Admin panel at `/celord/admin` → "Docker Hub collector".

All prior production steps from Sessions 3–6 still apply (see above).

## Post-v0 backlog

See `docs/celord/BACKLOG.md`. Top items:
1. Watchlist + email alerts on new signals
2. Pentaho community forum collector
3. Sonnet 4.6 re-run tier for high-value low-confidence orgs
4. SO collector: expand org extraction to parse `about_me` HTML for employer mentions (increases recall for users without a website_url)
5. False-positive rate check on top-50 after org filter (manual review)
