# SalesLord Platform — Handoff

## Current state: v1.0.0 — TerritoryLord live, first run complete

Stage 2 monorepo done. TerritoryLord v0 shipped and producing results — first
run returned 465 candidate organizations (Public Administration + Educational
Services ICP). Next focus: candidate filtering and size/revenue enrichment.

```
saleslord/
├── apps/web/           @saleslord/web — single Next.js app, all products
├── packages/core/      @saleslord/core — shared types/domain model
├── packages/signals/   @saleslord/signals — collectors, enrichment, scoring, persist
└── packages/db/        @saleslord/db — schema.sql
```

**Vercel config (do not change):**
- Root Directory: blank
- Install: `pnpm install`
- Build: `pnpm --filter @saleslord/web build`
- Output: `apps/web/.next`
- `next` listed in root `package.json` devDependencies — required for Vercel framework detection

## ProspectLord: job history sidebar (this session)

The sidebar now shows AI jobs (research, email drafts, update checks, case
study matches) — running jobs with live elapsed time, finished jobs with
success/fail, runtime, and API cost. Last 24h of history, running jobs pinned
on top, rows link to the prospect.

- `jobs` table — written by `withJob` in `apps/web/lib/jobs.ts`, which wraps
  each AI route's handler (row inserted as `running`, finalized from the
  route's Response; validation failures like rate limits are deleted, not
  shown as failures).
- `GET /api/jobs` — polled by `components/prospect/JobsSection.tsx` (5s while
  running, 20s idle); sweeps `running` rows older than 10 min to `failed`.
- **Migration to run in prod Supabase:** `packages/db/migrations/2026-06-10_jobs.sql`

## ProspectLord: security + cost-accounting fixes (this session)

- **Ownership checks (IDOR)** — `refresh-email`, `check-updates`, and
  `case-studies/match` fetched prospects by id with the admin client without
  verifying the caller owned them. All three now return 404 on mismatch.
  (`archive` and PDF export were already safe — user_id check / RLS client.)
- **Web search loop + token accounting** — research and check-updates had a
  `stop_reason === 'tool_use'` loop that never fired (`web_search_20250305` is
  a server-side tool; the continuation signal is `pause_turn`) and counted only
  the final call's tokens. Now: canonical `pause_turn` continuation (append
  assistant content, re-send) and usage accumulated across every call, so
  `api_usage.cost_usd` no longer undercounts multi-continuation runs.

## Platform: per-user module visibility (this session)

Admins can hide CELord / TerritoryLord (and future modules) per user from
`/admin/users` → Modules tab. ProspectLord is always visible; admins always
see everything. Enforcement is in `proxy.ts` (pages redirect to `/`, API
routes get 403) — hiding the ribbon tab is display-only. Grants live in the
`module_access` table, keyed by email like `allowed_emails`, so access can be
granted before first sign-in. **Default: new users see ProspectLord only.**

- Module registry: `apps/web/lib/modules.ts` — single source of truth for
  ribbon, proxy gate, and admin UI. A future module is one entry here.
- **Migration to run in prod Supabase:** `packages/db/migrations/2026-06-10_module_access.sql`
  (includes a commented seed block to preserve existing users' all-tab access).

## TerritoryLord: next session — candidate filtering

See [`docs/territorylord/HANDOFF.md`](docs/territorylord/HANDOFF.md) for full detail.

**Priority:** 465 orgs returned with no revenue/headcount visibility. Next
session should pull Wikidata P1082 (employee count), wire ICP `size_hint`
filter to it, and improve the results table (sort, filter by status, bulk actions).

**Data source:** Wikidata SPARQL (free, no key)

## ProspectLord status: v0.9.0 — Per-user products + mandatory product gate

See [`docs/prospectlord/HANDOFF.md`](docs/prospectlord/HANDOFF.md).

**Shipped this session (v0.9.0):**
- Products moved from shared admin-managed table to per-user ownership —
  migration run in prod Supabase; `/admin/products` removed; product CRUD
  now lives on `/setup` for every user
- Mandatory product gate — `(app)/(gated)/` route group redirects to `/setup`
  until the user creates their first product
- Platform is ready for beta testers selling different products

**Previous session (v0.8.0):**
- Org disambiguation flow — resolve route (Haiku), territory tiebreaker, confirmation dialog
- Cost transparency design principle — `lib/costs.ts`, cost hint in dialog footer

**Pending (not urgent):**
- Beta tester feedback — first external user onboarding via the new product gate
- Case Study Matcher seeding — code complete, waiting on Pentaho PDF from Jon
- `/api/cron/refresh-all` — weekly refresh + Resend digest

## CELord status: v0 feature-complete

See [`docs/celord/HANDOFF.md`](docs/celord/HANDOFF.md). CRM import still pending
(requires approval to bring customer data to table before flipping real credentials).

## Docs structure

```
docs/
├── prospectlord/
│   ├── CLAUDE.md    — ProspectLord architecture, schema, API routes, design principles
│   ├── HANDOFF.md   — Session history and what's next
│   └── BACKLOG.md   — Prioritized feature queue
├── celord/
│   ├── CLAUDE.md    — CELord architecture, signal model, collector pattern
│   ├── HANDOFF.md   — Session history + pending work
│   └── BACKLOG.md   — Post-v0 feature queue
└── territorylord/
    ├── CLAUDE.md    — TerritoryLord architecture, data model, design decisions
    ├── HANDOFF.md   — Implementation plan (Workstream B — ready to start)
    └── BACKLOG.md   — Post-v0 feature queue
```
