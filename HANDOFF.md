# SalesLord Platform — Handoff

## Active work: CELord v0 — Session 2 (real collectors)

Session 1 is complete. See [`docs/celord/HANDOFF.md`](docs/celord/HANDOFF.md)
for the full session summary, Session 2 plan, and open questions.

**Session 2 scope (summary):**
- Flip GitHub, Shodan, and jobs collector stubs to real API implementations
- Add cron routes for each collector + wire into `vercel.json`
- Credentials needed: `GITHUB_TOKEN`, `SHODAN_API_KEY`, and either
  `SERPAPI_KEY` or `ADZUNA_APP_ID` + `ADZUNA_APP_KEY`

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
    ├── HANDOFF.md   — Session 1 summary + Session 2 plan
    └── BACKLOG.md   — Post-v0 feature queue and platform evolution plan
```

Root `CLAUDE.md` covers: shared stack, env vars, Next.js 16 quirks, deployment,
platform-wide rules that apply to both apps.
