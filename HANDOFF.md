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

## TerritoryLord: next session — candidate filtering

See [`docs/territorylord/HANDOFF.md`](docs/territorylord/HANDOFF.md) for full detail.

**Priority:** 465 orgs returned with no revenue/headcount visibility. Next
session should pull Wikidata P1082 (employee count), wire ICP `size_hint`
filter to it, and improve the results table (sort, filter by status, bulk actions).

**Data source:** Wikidata SPARQL (free, no key)

## ProspectLord status: stable at v0.7.0

No active ProspectLord work. See [`docs/prospectlord/HANDOFF.md`](docs/prospectlord/HANDOFF.md).

**Pending (not urgent):**
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
