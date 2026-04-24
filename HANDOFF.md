# SalesLord Platform — Handoff

## Active work: CELord v0 — Session 4 (CRM import + production go-live)

Session 3 is complete and merged at v0.4.0. See [`docs/celord/HANDOFF.md`](docs/celord/HANDOFF.md)
for the full session summary and Session 4 plan.

**Session 4 scope (summary):**
- CRM import — CSV upload of existing customers + failed conversions with entity resolution.
  Must be done **before** flipping to real collector credentials to avoid polluting the
  prospect list with known accounts.
- Flip to real credentials (`GITHUB_TOKEN`, `SHODAN_API_KEY`, `SERPAPI_KEY`) in Vercel
- Trigger collectors + enrichment manually in production to seed first real dataset
- False-positive review of top 50 ranked orgs; tune scoring/filters if needed
- Adjust cron cadence (`vercel.json`) — jobs should run daily, not monthly

**Prerequisite for go-live:**
Jon needs approval to bring customer + failed-conversion data to the table.
Do not flip collector credentials until CRM import is done.

## ProspectLord status: stable at v0.7.0

No active ProspectLord work. See [`docs/prospectlord/HANDOFF.md`](docs/prospectlord/HANDOFF.md)
for current state and backlog.

**Pending ProspectLord tasks (not urgent):**
- Case Study Matcher seeding — code complete, waiting on Pentaho PDF from Jon
- `/api/cron/refresh-all` — weekly refresh + Resend digest

## Docs structure

```
docs/
├── prospectlord/
│   ├── CLAUDE.md    — ProspectLord architecture, schema, API routes, design principles
│   ├── HANDOFF.md   — Session history and what's next
│   └── BACKLOG.md   — Prioritized feature queue
└── celord/
    ├── CLAUDE.md    — CELord architecture, signal model, collector pattern
    ├── HANDOFF.md   — Session 3 summary + Session 4 plan
    └── BACKLOG.md   — Post-v0 feature queue and platform evolution plan
```

Root `CLAUDE.md` covers: shared stack, env vars, Next.js 16 quirks, deployment,
platform-wide rules that apply to both apps.
