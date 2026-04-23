# SalesLord Platform — Claude Code context

## What this repo is

The **SalesLord platform** — a suite of B2B sales tools for enterprise AEs.
The repo hosts two apps in Stage 1 (single Next.js deployment):

- **ProspectLord** (currently branded SalesLord in code) — prospecting and
  outreach assistant. Briefs, email drafts, decision maker targeting, case
  study matching. See [`docs/prospectlord/CLAUDE.md`](docs/prospectlord/CLAUDE.md).
- **CELord** — Pentaho CE signal detection and prospect discovery. Finds
  organizations running end-of-life Pentaho Community Edition via GitHub,
  Shodan, job postings, and other public signals. See [`docs/celord/CLAUDE.md`](docs/celord/CLAUDE.md).

## Naming and the rename path

- **SalesLord** — (a) the existing repo name (stays forever — it's the platform
  monorepo name), and (b) the current branding of the prospecting app that will
  be renamed ProspectLord at Stage 2.
- **ProspectLord** — rename target for the current prospecting app. Rename
  happens at Stage 2 bundled with the monorepo restructure. Until then,
  "SalesLord" in code and user-facing strings means ProspectLord.
- **CELord** — CE signal detection app. Built as a feature inside this repo
  in Stage 1; promoted to its own workspace at Stage 2.

## Stage 1 repo structure

```
saleslord/
├── CLAUDE.md               (this file — shared platform context)
├── HANDOFF.md              (pointer to active work)
├── docs/
│   ├── prospectlord/       (ProspectLord CLAUDE/HANDOFF/BACKLOG)
│   └── celord/             (CELord CLAUDE/HANDOFF/BACKLOG)
├── core/                   (shared domain model — package-in-waiting)
├── signals/                (CELord collectors/enrichment/scoring — package-in-waiting)
├── proxy.ts                (Next.js 16 auth middleware — covers ALL routes)
├── vercel.json             (cron config)
├── supabase/
│   └── schema.sql          (source of truth for all DB tables)
├── lib/                    (ProspectLord utilities — admin.ts, crypto.ts, utils.ts, etc.)
├── components/             (ProspectLord UI components)
└── app/
    ├── layout.tsx          (root layout — platform top ribbon lives here)
    ├── globals.css         (design tokens + Tailwind)
    ├── login/
    ├── access-denied/
    ├── auth/callback/
    ├── (app)/              (ProspectLord route group)
    └── (celord)/           (CELord route group)
```

## Shared tech stack

- **Framework**: Next.js 16 (App Router), TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Database**: Supabase (Postgres + Auth + RLS) — one project, shared by both apps
- **Auth**: Supabase Google OAuth — one auth setup, covers all routes
- **AI**: Anthropic Claude API (server-side only, BYOK)
  - ProspectLord: `claude-sonnet-4-6` for research + email
  - CELord: `claude-haiku-4-5-20251001` for bulk enrichment + entity resolution
- **Web search**: Anthropic web search tool (`web_search_20250305`)
- **PDF generation**: `@react-pdf/renderer` — server-side only, components in `lib/pdf/*.tsx`
- **PDF-to-image**: `pdf-to-img` (wraps `pdfjs-dist` — no system binary deps, Vercel-safe)
- **Email**: Resend
- **Payments**: Stripe (stubbed — wire when ready)
- **Deployment**: Vercel (single deployment — both apps in one Next.js instance at Stage 1)
- **Cron**: Vercel cron (`vercel.json`)

## Shared environment variables

```
NEXT_PUBLIC_SUPABASE_URL          # Safe client-side
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Safe client-side
SUPABASE_SERVICE_ROLE_KEY         # Server-side only — admin client
API_KEY_ENCRYPTION_SECRET         # 64 hex chars — AES-256-GCM for user Anthropic keys
ALLOWED_DOMAIN                    # e.g. "yourcompany.com" — server auth gate
NEXT_PUBLIC_ALLOWED_DOMAIN        # Same value — passed to Google OAuth hd= param
DAILY_CALL_LIMIT                  # Default 25 — max Anthropic calls per user per 24h
RESEND_API_KEY                    # Server-side only
CRON_SECRET                       # Authenticates Vercel cron requests
NEXT_PUBLIC_APP_URL               # e.g. https://saleslord-theta.vercel.app
# CELord collectors (add when flipping stubs to real):
# GITHUB_TOKEN / SHODAN_API_KEY / SERPAPI_KEY (or ADZUNA_APP_ID + ADZUNA_APP_KEY)
# Stripe (wire when ready):
# STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

See `.env.local.example` for the full reference.

## Deployment

- **Live URL**: https://saleslord-theta.vercel.app
- **GitHub**: https://github.com/birddogdataservices/saleslord
- **Vercel account**: birddogdataservices (Hobby plan — public repo required)
- Vercel auto-deploys on every push to `main`
- Supabase auth redirect URLs must include the Vercel domain in Authentication → URL Configuration

## Versioning

Semver tags on `main` at meaningful milestones. `package.json` version is not
kept in sync until Stage 2 (when packages are published). Tags are the source
of truth.

Current version: **v0.3.0** (CELord Session 2 — real collectors + cron routes)

**Tag after merging to main:**
```bash
git checkout main && git pull
git tag v0.X.0 && git push origin v0.X.0
```

Increment guide:
- **patch** (0.x.1) — bug fixes, copy changes, minor UI tweaks
- **minor** (0.x+1.0) — new feature or session milestone (new collector, new app section, enrichment, etc.)
- **major** (1.0.0) — Stage 2 monorepo restructure / ProspectLord rename

## Next.js 16 notes (apply to both apps)

- Middleware file is `proxy.ts` at root; export function must be named `proxy`.
  This is Next.js 16's renamed version of `middleware.ts`. Do NOT create a
  `middleware.ts` — the build will fail if both exist.
- **Route handler params are async** — dynamic segment params are
  `Promise<{ id: string }>`. Always: `const { id } = await params`.
  Build fails on type check if you use the old synchronous pattern.
- All pages using Supabase need `export const dynamic = 'force-dynamic'`
- App Router — server components fetch data, client components handle interactivity
- **JSX in route handlers** — route handlers are `.ts` files; JSX lives in
  separate `.tsx` files imported into the route. Use `React.createElement()`
  in the route, not JSX directly.
- **Dynamic imports for pdfjs-based packages** — `pdf-to-img` and any
  `pdfjs-dist`-based package must be dynamically imported inside the handler
  function (`const { pdf } = await import('pdf-to-img')`), never at the top
  level. Top-level import breaks Turbopack's build phase with `ERR_INVALID_ARG_TYPE`.

## Browser quirks (apply to both apps)

- **Chrome autofill ignores `autoComplete="off"` and `autoComplete="new-password"`**
  on inputs Chrome heuristically associates with credentials. Use `type="search"`
  instead — Chrome does not autofill search inputs.

## Platform-wide rules (what Claude Code must never do)

- Expose secret env vars client-side (`SUPABASE_SERVICE_ROLE_KEY`,
  `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `API_KEY_ENCRYPTION_SECRET`,
  collector API keys)
- Call Anthropic client-side
- Skip RLS on client Supabase queries
- Import `lib/supabase/admin.ts` from anywhere outside `app/api/*`
- Import across the app boundary — ProspectLord files must not import from
  `app/(celord)/`, CELord files must not import from `app/(app)/`,
  `components/prospect/`, or `lib/`
- Add Supabase client imports inside `core/` or `signals/` — pass as dependency
- Touch the other app's code when working on one app

## Supabase admin client pattern

Always use the admin client (service role) in API routes for privileged operations:
```ts
import { createAdminClient } from '@/lib/supabase/admin'
const adminClient = createAdminClient()
```
Never import `admin.ts` from client components, server components, or
`core/`/`signals/` code.

## Rate limiting (ProspectLord Anthropic calls)

Every ProspectLord API route checks `api_usage` before calling Anthropic:
```ts
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const { count } = await adminClient
  .from('api_usage').select('*', { count: 'exact', head: true })
  .eq('user_id', userId).gte('created_at', since)
if ((count ?? 0) >= Number(process.env.DAILY_CALL_LIMIT ?? '25'))
  return Response.json({ error: 'Daily limit reached' }, { status: 429 })
```

## Cost tracking

After every Anthropic call, write to `api_usage`:
```ts
import { calculateCost } from '@/lib/utils'
const cost = calculateCost(model, usage.input_tokens, usage.output_tokens)
await adminClient.from('api_usage').insert({ user_id, prospect_id, endpoint, model,
  input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: cost })
```

`calculateCost` is in `lib/utils.ts`. Update pricing there when Anthropic changes rates.
