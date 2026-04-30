# TerritoryLord — CLAUDE.md

## Platform context

TerritoryLord is the third app in the **SalesLord platform** (the others are
ProspectLord and CELord). It lives in the same monorepo and shares the same
Supabase project, auth setup, and `packages/core/` + `packages/signals/`
domain code.

This doc assumes Stage 2 monorepo migration has completed. If TerritoryLord
work begins before that, **stop and complete the migration first** per
`docs/celord/BACKLOG.md` "Stage 2: Monorepo restructure + ProspectLord rename".
The reasoning: Jon explicitly chose to do the monorepo work upfront before
adding a third app, while there are no users and migration risk is zero.
This is a deliberate override of the trigger-based criteria in the CELord docs.

See the root `CLAUDE.md` for shared stack, env vars, Next.js 16 quirks, and
deployment details.
See `docs/prospectlord/CLAUDE.md` for ProspectLord context.
See `docs/celord/CLAUDE.md` for CELord context — TerritoryLord follows its
patterns closely.

## What this project is

TerritoryLord is a **territory whitespace** tool. Given a sales rep's
territory (a set of state/province codes) and ICP (industry filters, optional
size hint), it enumerates organizations in that territory that plausibly
fit the ICP. The output is a hopper of accounts the rep can work through
ProspectLord for per-account research and outreach.

The problem it solves: "I know what my territory is, but I don't know every
organization in it that's in my ICP and would like help identifying them."

## What this project is not

- **Not a qualification tool.** Sales motion qualifies accounts (calls, emails,
  meetings). TerritoryLord just enumerates plausible candidates. False
  positives are acceptable; the rep filters in the UI and through outreach.
- **Not a per-account research tool.** That workflow ("I have a named company,
  enrich it now for outreach prep") belongs in ProspectLord. TerritoryLord
  hands candidates off to ProspectLord via a deep-link.
- **Not a CE detection tool.** That's CELord. TerritoryLord enumerates
  territory + ICP regardless of product fit signals.
- **Not a CRM.** It produces candidate lists. CRM-of-record is elsewhere.

## Architecture overview

Three layers, mirroring the CELord pattern but simpler:

1. **Collectors** — currently one: OpenCorporates. Queries the firmographic
   spine for active entities in a given jurisdiction. Returns normalized
   candidates with name, jurisdiction, industry classification (where
   available), and provenance.

2. **Industry classification** — for candidates without a clean industry code
   from the source, a single Haiku 4.5 call classifies based on company name
   and any available description. Reuses the BYOK Anthropic key pattern from
   ProspectLord and CELord.

3. **Run + UI** — per-region run mechanism writes candidates to
   `territorylord_candidates` linked to a `territorylord_runs` row. UI shows
   results with accept/reject/promote actions. Reject log informs filter
   iteration over time.

There's no separate enrichment layer in v1. Candidates are not deeply enriched
at the TerritoryLord stage — that's ProspectLord's job once a candidate is
promoted.

## Free-source-first philosophy

v1 deliberately uses free public data only:

- **OpenCorporates** as the spine — global company registry data, free tier
  works for v1, BYOK key raises rate limits if needed.
- **Claude Haiku** for industry classification gaps — cheap, batch-able.
- **No paid firmographic providers** in v1 (Apollo, ZoomInfo, Clearbit, etc.).

The reasoning: at the enumeration stage, precision is not the goal. Free
sources will produce more noise than paid aggregators, but the rep filters
through the UI and through the actual sales motion. v1 is a **learning loop** —
ship thin, run on familiar territories, use the reject log to inform filter
tuning, and only upgrade to paid sources if free results prove insufficient.

If reject patterns show free data is too noisy to be useful, the upgrade path
is well-defined: add a paid firmographic BYOK collector under
`packages/signals/collectors/`. Backlogged, not built.

## Data model conventions

TerritoryLord follows the established `packages/core/` + `packages/signals/`
discipline. Shared tables get no prefix; app-specific tables are prefixed
`territorylord_`.

**Shared tables** (consumed by TerritoryLord, ProspectLord, and CELord):

- `organizations` — canonical org record. Already exists from CELord; reused
  here. TerritoryLord writes new orgs through `packages/signals/persist.ts`,
  using the same entity resolution as CELord (domain exact → fuzzy name → LLM
  disambiguation).
- `locations` — already exists. TerritoryLord writes HQ region info here.
- `territories` — NEW. `rep_id` → ISO 3166-2 region codes. Owned by
  TerritoryLord but designed for ProspectLord to consume too (e.g. filtering
  the prospect list by rep territory).
- `icp_profiles` — NEW. Industries + optional size hint. Owned by rep or team.
  Designed for both TerritoryLord and ProspectLord to use.

**TerritoryLord-specific tables** (prefix `territorylord_`):

- `territorylord_runs` — one row per region per run. Status, counts, timestamps.
- `territorylord_candidates` — one row per (run, org). Status (new / accepted /
  rejected / promoted), reject reason, notes.

**The cross-app key insight**: one organization row, three apps reasoning
about it. TerritoryLord adds a candidate → rep promotes → ProspectLord adds
a prospect record pointing to the same org → CELord may later add CE signals
pointing to the same org. The shared `organizations` table is what makes
the platform a platform.

## Run philosophy

- **One region per run in v1.** Reps pick a state/province, kick off a run,
  results stream in for that region. Multi-state runs in a single job are
  deferred — they require proper job queue infrastructure (Inngest etc.)
  that's not justified yet.
- **Runs are idempotent at the candidate level.** Re-running a region
  re-resolves orgs through the existing entity resolution path; existing
  org rows are reused rather than duplicated.
- **Reject reasons are first-class.** Every rejection captures a structured
  reason (wrong_industry / too_small / not_real / duplicate / other). The
  reject log is the primary input for v1 filter iteration.
- **Provenance always.** Every candidate records its source (OpenCorporates
  jurisdiction query) and the underlying source URL where applicable.

## Repo structure (post-Stage 2)

TerritoryLord routes live inside `apps/web/` — the single Next.js app that
hosts all products. There is no separate `apps/territorylord/` deployment;
all three products share one Vercel deployment.

```
saleslord/                  (monorepo root)
├── apps/
│   └── web/                                 (single Next.js app — all products)
│       ├── app/
│       │   ├── (app)/                       (ProspectLord routes)
│       │   ├── celord/                      (CELord routes)
│       │   └── territorylord/               (TerritoryLord routes — NEW)
│       │       ├── territory/page.tsx       (territory definition)
│       │       ├── icp/page.tsx             (ICP profile editor)
│       │       ├── runs/page.tsx            (run history + new run)
│       │       ├── runs/[id]/page.tsx       (results table)
│       │       └── admin/page.tsx           (manual triggers, mirroring CELord)
│       └── app/api/territorylord/
│           ├── runs/route.ts                (POST: create + execute run)
│           └── candidates/[id]/route.ts     (PATCH: accept/reject/promote)
├── packages/
│   ├── core/                                (shared — Organization, types)
│   ├── signals/                             (shared — collectors, persist, enrichment)
│   │   └── src/collectors/
│   │       ├── opencorporates.ts            (NEW for TerritoryLord)
│   │       └── ... existing CELord collectors
│   ├── db/                                  (shared — schema + migrations)
│   └── ui/                                  (Stage 3, not yet)
└── docs/territorylord/                      (this doc + HANDOFF + BACKLOG)
```

Route segment is `territorylord/` (real segment, matching the `celord/`
convention — not a route group).

## Package-in-waiting → packages discipline

The same dependency-arrow rules from CELord apply, just adapted to the
post-Stage 2 monorepo:

- `packages/core/` — app-agnostic. No imports from any app, no Supabase client
  imports.
- `packages/signals/` — may import from `core/`. No imports from any app's UI.
- `apps/territorylord/` — may import from `core/`, `signals/`, `db/`. No
  imports from `apps/prospectlord/` or `apps/celord/`.
- If TerritoryLord needs a pattern from another app, copy it or extract it
  into a shared package. Never reach across apps.
- No Supabase client imports inside `core/` or `signals/` — pass the client
  in as a dependency.

## TerritoryLord-specific tables

```sql
-- Shared (lives in packages/db/, used by ProspectLord too)
create table territories (
  rep_id uuid references rep_profiles(id),
  region_code text,           -- ISO 3166-2, e.g. 'US-CA', 'CA-ON'
  primary key (rep_id, region_code)
);

create table icp_profiles (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references rep_profiles(id),
  name text not null,
  industries text[],          -- NAICS codes or freeform tags (TBD during impl)
  size_hint text,             -- nullable; e.g. 'mid_market_plus'
  created_at timestamptz default now()
);

-- TerritoryLord-specific
create table territorylord_runs (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references rep_profiles(id),
  icp_profile_id uuid references icp_profiles(id),
  region_code text not null,
  status text not null,       -- pending | running | complete | failed
  candidate_count int default 0,
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table territorylord_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references territorylord_runs(id),
  org_id uuid references organizations(id),
  status text not null default 'new',  -- new | accepted | rejected | promoted
  reject_reason text,                  -- enum: wrong_industry|too_small|not_real|duplicate|other
  notes text,
  created_at timestamptz default now(),
  unique (run_id, org_id)
);
```

## TerritoryLord-specific env vars

```
OPENCORPORATES_API_KEY      # Optional — raises rate limits on the free tier.
                            # If BYOK pattern adopted, this lives encrypted
                            # in rep_profiles instead.
```

`ANTHROPIC_API_KEY` is already shared via the existing BYOK pattern. No new
env vars beyond OpenCorporates.

## TerritoryLord AI model usage

- **Haiku 4.5** — industry classification for candidates without a NAICS code
  from OpenCorporates. Same BYOK pattern as ProspectLord and CELord (rep's
  Anthropic key from `rep_profiles`, AES-256-GCM decryption). Cost target:
  <$5/month at v1 volumes (one region per run, manual trigger).
- **No Sonnet usage in v1.** Industry classification is straightforward
  enough that Haiku quality is sufficient. Sonnet re-runs for low-confidence
  classifications are backlogged.

## Navigation

TerritoryLord routes live at `/territorylord/*` (or `/(territorylord)/*`
depending on the route group convention confirmed during Stage 2 — match
whatever ProspectLord and CELord use).

The platform ribbon (`components/PlatformRibbon.tsx` or its post-monorepo
location) should be updated to show three tabs: ProspectLord / TerritoryLord /
CELord. Order TBD; suggest left-to-right by typical workflow:
TerritoryLord (find) → ProspectLord (research/outreach) → CELord (CE-specific
prospecting).

## What Claude Code must never do (TerritoryLord-specific)

- Import ProspectLord or CELord code directly. Use shared packages or copy
  patterns.
- Add Supabase client imports inside `packages/core/` or `packages/signals/`.
- Modify ProspectLord or CELord routes, components, or app-specific tables
  during TerritoryLord work.
- Build paid firmographic provider integrations in v1. The free-source-first
  decision is deliberate; revisit only if v1 reject patterns prove free data
  insufficient.
- Build multi-region runs in a single job in v1. One region per run.
- Add revenue data at the candidate level. ProspectLord briefs handle revenue
  per-account.

## Cost envelope (target)

- v1 running cost: under $10/month (OpenCorporates free tier, ~$5/month
  Claude Haiku for classification, Supabase + Vercel free or shared tiers).
- If paid firmographic upgrade happens later: depends on provider. Apollo
  starts ~$50/month for usable volumes; ZoomInfo enterprise pricing is
  much higher.
