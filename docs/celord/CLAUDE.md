# CELord — CLAUDE.md

## Platform context

CELord is one of two apps in the **SalesLord platform** (the other is ProspectLord).
It lives in the same repo and shares the same Supabase project, auth setup, and Vercel
deployment as ProspectLord during Stage 1. See the root `CLAUDE.md` for shared stack,
env vars, Next.js 16 quirks, and deployment details. See `docs/prospectlord/CLAUDE.md`
for ProspectLord context.

## What this project is

CELord is a prospecting tool for finding organizations that use Pentaho Data
Integration Community Edition (CE). Pentaho CE stopped receiving new features
and vulnerability patches in 2024, but many enterprise, government, education,
and non-profit organizations still run it — often unaware of or actively
managing the risks. CE does not phone home, so identifying users requires
triangulating from public signals: code repos, job postings, exposed servers,
forum activity, conference talks, case studies.

CELord collects those signals globally, resolves them to organizations,
scores each organization for prospect value, and surfaces a ranked, filterable
list for the sales rep to work.

## What this project is not

- Not a per-prospect research tool. That workflow ("I have a named company,
  enrich it now for outreach prep") belongs in ProspectLord.
- Not a general-purpose prospecting tool. The signal model is extensible, but
  v0 is explicitly scoped to Pentaho CE detection.
- Not a CRM. It produces prospect lists; CRM-of-record is elsewhere.

## Architecture overview

Four layers:

1. **Collectors** — independent modules that hit one source each and emit
   normalized Signal records. v0 collectors: GitHub code search, Shodan, job
   postings (SerpApi or Adzuna), Pentaho community forum, Stack Overflow,
   conference talks / case studies. Each collector runs on its own schedule.

2. **Entity resolution** — signals cluster into Organizations. Passes:
   (a) exact domain match, (b) fuzzy name match, (c) LLM-assisted resolution
   for ambiguous cases. Every org↔signal link stores provenance.

3. **Enrichment** — for each resolved organization, an LLM + web search pass
   determines: regional billing HQ (country, state/province, city), parent
   org if any, org type (end_user / integrator / vendor / training_provider /
   unknown), industry, approximate size. Two-tier: Haiku 4.5 first pass,
   Sonnet 4.6 re-run for high-value or low-confidence orgs. Results cached.

4. **Scoring + UI** — composite score per org across usage confidence, scale,
   risk posture, reachability. Ranked list with territory filter (multi-select
   on country + state/province), evidence drill-down per org, CSV export,
   watchlist + alert-on-new-signal.

## Signal collection philosophy

- **Collect globally, filter at query time.** Do not scope collection by
  territory. Reps filter the UI, not the collector.
- **Provenance always.** Every signal records its source URL, snippet, and
  collection timestamp. An org's score must always be explainable by drilling
  into the signals that contributed.
- **Recency is first-class.** Signals decay: full weight <12mo, half 12–36mo,
  quarter >36mo. Job postings decay harder (half at 6mo).
- **Noise filtering at the collector.** Negative-keyword filters for the town
  of Pentaho, Portugal, generic "kettle" usage, and other known false-positive
  sources happen in the collector before a signal is emitted.

## Data model conventions

- Global signal pool. One `signals` table, one `organizations` table, a
  `signal_links` join table with confidence + method per link.
- Organizations have multiple `locations` (HQ, offices, signal-origin). The
  `billing_hq` location is the one territory filters match against.
- Subsidiaries are separate org rows with a `parent_org_id` link.
- `customer_status` enum on orgs (`unknown | prospect | active_customer |
  former_customer | failed_enterprise_conversion | do_not_contact`) with
  source + timestamp. Failed conversions are first-class because they're
  high-signal re-engagement targets.
- **Status history is tracked**, not just current status. A separate
  `org_status_history` table records every status change with timestamp,
  source, and an optional note.
- CRM import path exists in v0 as manual CSV import. Both active customers
  and failed conversions import through the same CSV flow with a `status`
  column distinguishing them. Backlog: structured failure reasons, competitor
  chosen, deal size at loss.
- `org_type` enum for handling integrators and vendors (surface-and-label,
  not filter-out).

## Repo structure (Stage 1 — what's actually built now)

CELord v0 is additive inside the existing SalesLord repo. No `src/` directory.
New code lives at the repo root alongside existing ProspectLord folders:

```
saleslord/                  (existing repo, unchanged name)
├── docs/
│   ├── prospectlord/       (ProspectLord CLAUDE/HANDOFF/BACKLOG)
│   └── celord/             (this project's CLAUDE/HANDOFF/BACKLOG)
├── core/                   (shared domain model — package-in-waiting)
├── signals/                (collectors/enrichment/scoring — package-in-waiting)
├── app/
│   ├── (app)/              (existing ProspectLord routes — untouched)
│   └── (celord)/           (new CELord route group)
├── components/             (existing ProspectLord components — untouched)
├── lib/                    (existing ProspectLord utilities — untouched)
└── supabase/
    └── schema.sql          (shared — CELord tables added via migrations)
```

## Package-in-waiting discipline

`core/` and `signals/` follow package-in-waiting discipline so Stage 2 extraction
is mechanical (move folder → add package.json → fix imports):

- `core/` holds the shared domain model (Organization, Person, Location, enums,
  types). App-agnostic. No imports from ProspectLord or CELord UI code.
- `signals/` holds collectors, signal schema, enrichment, scoring. May import
  from `core/`. No imports from UI, route handlers, or either app's internals.
- `app/(celord)/` is the route group for CELord UI. May import from `core/` and
  `signals/`, but not vice versa.
- Do not import across the app boundary — if CELord needs a pattern from
  ProspectLord, copy it or extract it into `core/`.
- No Supabase client imports inside `core/` or `signals/` — pass the client in
  as a dependency.

These folders become `packages/core/`, `packages/signals/`, and `packages/db/`
when the monorepo is restructured at Stage 2.

## Target shape (post-Stage 2)

```
saleslord/              (monorepo root — same repo, restructured)
├── apps/
│   ├── celord/
│   └── prospectlord/
├── packages/
│   ├── core/
│   ├── signals/
│   ├── db/
│   └── ui/             (extracted at Stage 3, not before)
├── pnpm-workspace.yaml
└── turbo.json
```

## CELord-specific tables

Shared tables (`organizations`, `signals`, `signal_links`, `locations`,
`enrichment_runs`, `org_status_history`) have no prefix. App-specific tables
are prefixed `celord_` to make ownership obvious (e.g. `celord_watchlists`).

See `supabase/schema.sql` for the CELord migration block.

## Collector stubs (v0 development pattern)

All v0 collectors start as stubs returning fixture data. This lets the full
pipeline (resolution → enrichment → scoring → UI) be built and tested before
any real API credentials exist.

```ts
// Pattern for every collector
export const githubCollector: Collector = async (config) => {
  if (!config.githubToken) return GITHUB_FIXTURES
  // real implementation
}
```

Fixture data is crafted to exercise edge cases: ambiguous org names, known
false positives (Pentaho Portugal), integrators vs. end users, signal decay.

Real credentials needed when flipping to live:
- `GITHUB_TOKEN` — personal access token for code search API
- `SHODAN_API_KEY` — free-tier Shodan account
- `SERPAPI_KEY` or `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — job postings

## CELord-specific env vars

```
GITHUB_TOKEN          # GitHub PAT for code search API
SHODAN_API_KEY        # Shodan free-tier API key
SERPAPI_KEY           # SerpApi key for job postings (OR use Adzuna below)
ADZUNA_APP_ID         # Adzuna app ID (alternative to SerpApi)
ADZUNA_APP_KEY        # Adzuna app key
```

These are additive — all existing env vars from root CLAUDE.md still apply.

## CELord AI model usage

- **Haiku 4.5** — bulk enrichment (HQ determination, org type classification) and
  LLM-assisted entity resolution. Cost target: <$15/month at steady state.
- **Sonnet 4.6** — high-value org re-runs (low-confidence Haiku enrichment above a
  score threshold). Backlogged for post-v0.
- CELord uses the BYOK pattern — user's Anthropic key from `rep_profiles`. Same
  decryption path as ProspectLord.

## Navigation

CELord routes live at `/celord/*`. A top ribbon in the app layout provides
tabs for ProspectLord and CELord so users can switch between apps. The ribbon
is added to the root layout and applies to both route groups.

## What Claude Code must never do (CELord-specific)

- Import ProspectLord code from `app/(app)/`, `components/prospect/`, or
  `lib/` into CELord files. Copy the pattern or extract into `core/` instead.
- Import `core/` or `signals/` code from inside a ProspectLord file — the
  dependency arrow goes one way: UI → signals → core.
- Add Supabase client imports inside `core/` or `signals/` — pass as dep.
- Expose raw signal source URLs or org data to unauthenticated requests.
- Touch existing ProspectLord routes, components, or lib files during CELord work.

## Cost envelope (target)

- v0 running cost: under $30/month (GitHub free, Shodan free tier, no paid
  job API yet, Supabase + Vercel free tiers, ~$15/month Claude API).
- Full running cost once all collectors active: $75–150/month including
  Shodan Freelancer ($70) and a paid job search API ($0–75).
- Initial bulk enrichment one-time cost: $30–60 depending on org count and
  Sonnet re-run ratio.
