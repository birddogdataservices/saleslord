# SalesLord Platform — Handoff

## Current state: v0.8.0 — Stage 2 monorepo restructure complete

Stage 2 is done and deployed. The repo is now a pnpm monorepo:

```
saleslord/
├── apps/web/           @saleslord/web — single Next.js app, all products
├── packages/core/      @saleslord/core — shared types/domain model
├── packages/signals/   @saleslord/signals — collectors, enrichment, scoring, persist
└── packages/db/        @saleslord/db — schema.sql
```

Both ProspectLord and CELord verified working in production at
https://saleslord-theta.vercel.app after migration.

**Vercel config (do not change):**
- Root Directory: blank
- Install: `pnpm install`
- Build: `pnpm --filter @saleslord/web build`
- Output: `apps/web/.next`
- `next` listed in root `package.json` devDependencies — required for Vercel framework detection

## Next: TerritoryLord v0

See [`docs/territorylord/CLAUDE.md`](docs/territorylord/CLAUDE.md) for full architecture.
See [`docs/territorylord/HANDOFF.md`](docs/territorylord/HANDOFF.md) for implementation plan.
See [`docs/territorylord/BACKLOG.md`](docs/territorylord/BACKLOG.md) for post-v0 backlog.

**Open questions to answer at session start (from HANDOFF):**
- OpenCorporates BYOK key: Jon decided BYOK (matches existing Anthropic key pattern)
- Industry tags: NAICS chosen for v0
- Subdomains/separate deployments: deferred to lowest-priority backlog

The HANDOFF verification checklist has been completed this session:
- `core/` shape confirmed ✓ (Organization, Location, OrgType, CustomerStatus all exist)
- `signals/` shape confirmed ✓ (Collector, RawSignal, CollectorConfig, persist, enrichment)
- Route group convention confirmed ✓ (`app/celord/` real segment, not route group)
- Cron + admin patterns confirmed ✓

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
