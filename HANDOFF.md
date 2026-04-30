# SalesLord Platform — Handoff

## Current state: v0.9.0 — TerritoryLord v0 built, pending deploy

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

## TerritoryLord v0: code complete, needs SQL + deploy

See [`docs/territorylord/HANDOFF.md`](docs/territorylord/HANDOFF.md) for what was built.

**To activate:**
1. Run the TerritoryLord schema block at the bottom of `packages/db/schema.sql` in Supabase SQL editor
2. Merge PR to `main` → Vercel auto-deploys
3. Smoke test: set territory → create ICP profile → start a run (try US-WY — small state, fast query)

**Data source:** Wikidata SPARQL (free, no key) instead of OpenCorporates (commercial-only)

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
