# TerritoryLord — Handoff

## Current state: ready to build (Workstream A complete)

Stage 2 monorepo restructure is done at v0.8.0. Workstream B (TerritoryLord v0)
is the next session's work.

**Decisions made since the design session:**
- OpenCorporates key: **BYOK** (matches existing Anthropic key pattern; platform-owned key backlogged)
- Industry classification: **NAICS** chosen for v0
- Deployment: **single `apps/web/` deployment** — no separate subdomain for TerritoryLord.
  TerritoryLord routes live at `apps/web/app/territorylord/` (real segment, matching
  `celord/` convention). Separate deployment is lowest-priority backlog.

**Verification checklist — all confirmed:**
1. ✅ Repo state confirmed — CELord at v0 Session 7 as assumed
2. ✅ `core/` shape confirmed — `Organization`, `Location`, `OrgType`, `CustomerStatus`
   all exist in `packages/core/src/index.ts`
3. ✅ `signals/` shape confirmed — `Collector`, `RawSignal`, `CollectorConfig` in
   `packages/signals/src/collectors/types.ts`; `persist.ts`, `enrichment.ts` present
4. ✅ Route convention confirmed — `app/celord/` real segment; TerritoryLord uses
   `app/territorylord/` (real segment, no route group wrapper)
5. ✅ Cron + admin patterns confirmed — `app/celord/admin/page.tsx` exists with
   manual trigger buttons; per-collector cron routes under `app/api/celord/collect/`

## Decision log from the design session

The design session reached the following conclusions, in order:

1. **Problem framing.** TerritoryLord solves "I know my territory but don't know
   every org in it that fits my ICP and is plausibly a buyer." Goal is
   **enumeration, not qualification** — fill the hopper of accounts in territory
   with enough size to plausibly have IT budget for enterprise data management
   software. Sales motion qualifies; this just enumerates.

2. **Territory primitive.** A rep's territory is a set of state/province codes
   in ISO 3166-2 format (`US-CA`, `CA-ON`, etc.). Determined by company HQ.
   Territory definition lives in a `territories` table; chunking is an
   execution concern, not part of territory identity.

3. **Required fields at this stage.** Account name, industry, revenue band,
   HQ location. **Revenue band has been deprioritized** — Jon confirmed
   precision isn't needed at the enumeration stage; ProspectLord briefs handle
   per-account revenue research as part of the existing prospect workflow.
   v1 ships **without revenue data**. Optional employee-count proxy is
   backlogged.

4. **Free-source-first strategy.** Jon explicitly chose to start with free
   public data (OpenCorporates as spine, Claude classification for industry
   gaps), evaluate the noise/usefulness tradeoff, and only move to paid
   firmographic providers (Apollo, ZoomInfo, etc.) if free results prove
   insufficient. v1 is a learning loop.

5. **Per-region execution.** Runs are scoped to one region (state/province)
   at a time in v1. Multi-state runs in a single job are deferred. This keeps
   the v1 implementation inside Vercel function limits without needing a
   proper job queue (Inngest etc. is deferred).

6. **TerritoryLord is its own app.** Jon decided it should have its own
   interface, not bolt onto ProspectLord. Sibling to ProspectLord and CELord.
   Shares packages-in-waiting (`core/`, `signals/`) and the Supabase project.

7. **Monorepo migration first — deliberate trigger override.** The CELord
   docs establish Stage 2 (monorepo restructure) as **trigger-based** — "when
   single-repo shape starts hurting." Adding a third app does not automatically
   trigger that. Jon is explicitly overriding the trigger because:
   - No users yet → no migration risk
   - Time available before user growth
   - Wants the structure set up cleanly to take on multiple future apps
   This is a deliberate override, not a contradiction. **Stage 2 happens before
   TerritoryLord v1 starts.**

## Implementation order

Two distinct workstreams. Do them in order.

### Workstream A: Stage 2 monorepo migration (do first)

Per `docs/celord/BACKLOG.md` "Stage 2: Monorepo restructure + ProspectLord rename":

- Restructure repo into pnpm-workspaces + Turborepo. Repo name stays `saleslord`.
- Move ProspectLord code into `apps/prospectlord/`. Rename from SalesLord to
  ProspectLord: package.json, user-facing strings, Vercel project name.
- Move CELord code into `apps/celord/`.
- Extract `core/` → `packages/core/`, `signals/` → `packages/signals/`,
  `supabase/migrations/` → `packages/db/`.
- Fix imports in both apps. Verify both build and deploy.
- Split Vercel deployment into two apps. Each gets its own subdomain.

Verify both apps still work end-to-end before starting Workstream B. ProspectLord
v0.7.0 features and CELord v0 features should all still function — collectors,
enrichment, status management, CRM import, the prospect flow.

### Workstream B: TerritoryLord v1 (do after Workstream A)

Lands in `apps/territorylord/` with shared code in `packages/core/` and
`packages/signals/`.

**Shared data model** (lands in `packages/db/`, consumed by all three apps):

- `territories` table — `rep_id` → array/join of ISO 3166-2 region codes.
- `icp_profiles` table — industries (NAICS top-level + sub-sector or freeform
  tags), optional size hint. Owned by rep or team. Reusable across
  TerritoryLord and ProspectLord.
- The shared `organizations` table (already exists, owned originally by CELord)
  is the canonical org record. TerritoryLord writes new orgs here when
  candidates don't already exist; uses the same entity resolution path in
  `packages/signals/persist.ts`.

**TerritoryLord-specific tables** (prefix `territorylord_` per the convention
in `docs/celord/CLAUDE.md`):

- `territorylord_runs` — `id`, `rep_id`, `icp_profile_id`, `region_code`,
  `status` (pending/running/complete/failed), `created_at`, `completed_at`,
  `candidate_count`, `error`.
- `territorylord_candidates` — `id`, `run_id`, `org_id` (FK to shared
  `organizations`), `status` (new/accepted/rejected/promoted),
  `reject_reason` (enum: wrong_industry/too_small/not_real/duplicate/other),
  `notes`.

**OpenCorporates collector** (lands in `packages/signals/collectors/`):

- BYOK pattern — user's OpenCorporates key from `rep_profiles`, AES-256-GCM
  encrypted. Mirror the existing Anthropic BYOK pattern.
- Filters at collector level: active entities only, exclude entities <90 days
  old, basic has-website check.
- Returns `RawSignal[]` matching the existing collector interface so entity
  resolution / org creation flows through the same `signals/persist.ts` path.

**Industry classification helper** (lands in `packages/signals/`):

- Single Haiku 4.5 call per candidate that lacks a clean industry code from
  OpenCorporates. Classifies into NAICS top-level + sub-sector based on company
  name + any available description text.
- Cost target: $0.001–0.003 per candidate. Batch where possible.
- Reusable by CELord enrichment if useful there too.

**Run mechanism**:

- One region per run in v1. Rep picks a region from their territory; new
  `territorylord_runs` row created; OpenCorporates queried with region +
  ICP industry filters; results paginated server-side; orgs resolved or
  created via shared `signals/persist.ts`; industry classification fills
  gaps; `territorylord_candidates` rows written linking run → org.
- Vercel function timeout (300s on Pro) should be sufficient for one region.
  If a region exceeds the timeout in practice, shift to a Vercel Cron pattern
  that processes one chunk per tick.

**UI** (lands in `apps/territorylord/app/`):

- Territory definition page — multi-select chips of ISO regions; persists to
  `territories` table.
- ICP profile page — industries multi-select, optional size hint; persists
  to `icp_profiles`.
- New run page — pick region + ICP profile, kick off run.
- Results table — list candidates with name, region, industry, source link.
  Per-row actions: **Accept**, **Reject** (with reason picker), **Promote
  to ProspectLord**. Reject log informs filter iteration.
- Run history — list of runs with status and counts.

**Cross-app handoff**:

- "Promote to ProspectLord" creates a `prospects` row pointing to the same
  shared `organizations` row, then deep-links into ProspectLord's add-prospect
  flow with the org pre-filled.
- Verify the exact deep-link contract by reading `apps/prospectlord/`'s
  add-prospect route after monorepo migration completes.

**Platform ribbon update**:

- Add TerritoryLord tab to `components/PlatformRibbon.tsx` (or wherever it
  lives post-monorepo). Three tabs: ProspectLord / TerritoryLord / CELord.

## Explicitly deferred (do not build in v1)

- Multi-state runs in a single job
- Inngest or any proper job queue
- Revenue band data at the candidate level
- Employee count enrichment (add only if reject log shows size-based noise dominates)
- Paid firmographic aggregator BYOK (Apollo, ZoomInfo, Clearbit, etc.)
- Saved territory presets (likely lands in shared per-user settings post-Stage 3)
- Watchlist / alert-on-new-org-in-territory
- Outreach drafting (lives in ProspectLord)

## Open questions for Jon to decide during implementation

- **OpenCorporates BYOK key source.** OpenCorporates has a free tier; a key
  raises rate limits. BYOK fits the existing pattern, but a single
  platform-owned key may be simpler for v1. Code should ask before assuming.
- **NAICS vs. freeform industry tags in `icp_profiles`.** Structured NAICS is
  cleaner but harder for reps to think in. Freeform tags are easier but harder
  to filter against OpenCorporates results. Pick one for v1; backlog the other.
- **Auth model across three apps post-monorepo.** Almost certainly one Supabase
  auth, three app surfaces. Confirm during Stage 2.
- **Subdomain convention post-Stage 2.** ProspectLord, CELord, TerritoryLord
  each get their own subdomain. Naming TBD.

## Repo structure (target post-Stage 2)

```
saleslord/                  (monorepo root — same repo, restructured)
├── apps/
│   ├── prospectlord/       (renamed from SalesLord)
│   ├── celord/
│   └── territorylord/      (NEW)
├── packages/
│   ├── core/               (Organization, Location, enums, types — shared)
│   ├── signals/            (collectors, enrichment, scoring, persist — shared)
│   ├── db/                 (Supabase migrations + schema — shared)
│   └── ui/                 (extracted at Stage 3, not before)
├── docs/
│   ├── prospectlord/
│   ├── celord/
│   └── territorylord/      (NEW — this doc + CLAUDE.md + BACKLOG.md)
├── pnpm-workspace.yaml
└── turbo.json
```
