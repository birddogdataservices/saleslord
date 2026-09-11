# SalesLord Platform — Claude Code context

## What this repo is

The **SalesLord platform** — a suite of B2B sales tools for enterprise AEs.
A pnpm monorepo with one deployed Next.js app hosting all products:

- **ProspectLord** (currently branded SalesLord in code) — prospecting and
  outreach assistant. Briefs, email drafts, decision maker targeting, case
  study matching. See [`docs/prospectlord/CLAUDE.md`](docs/prospectlord/CLAUDE.md).
- **CELord** — Pentaho CE signal detection and prospect discovery. Finds
  organizations running end-of-life Pentaho Community Edition via GitHub,
  Shodan, job postings, and other public signals. See [`docs/celord/CLAUDE.md`](docs/celord/CLAUDE.md).
- **TerritoryLord** — territory whitespace tool. Enumerates organizations in a
  rep's territory that plausibly fit their ICP. **v0 is built and gated**
  (`app/territorylord/*`, `app/api/territorylord/*`) — a first run returned 465
  candidates — but Jon is not happy with it and intends to restart the approach.
  Treat the existing code as a prototype to be replaced, not a base to extend.
  See [`docs/territorylord/CLAUDE.md`](docs/territorylord/CLAUDE.md).

## Product principle — nothing is generated blindly

**The rep is a human in the loop, not a recipient of output.** ProspectLord
exists to help a rep progressively qualify an account, and every expensive or
generative step waits for them to ask for it.

The qualification path is deliberately staged:

1. **Assess the company and the need** — is there something real here?
2. **Identify potential decision makers** — only if stage 1 looked compelling
3. **Design the outreach** — only once there is someone worth writing to

**Nothing beyond the initial brief gets generated unless the rep asks for it.**
Decision makers, emails, pitch openers, case-study matches and update scans are
all rep-triggered. A stage never auto-runs because a previous one finished.

What this means when building:

- Never chain generation steps. Finishing stage 1 does not start stage 2.
- An unrun stage renders an **invitation** — a button plus a caption explaining
  what it does and roughly what it costs — never an empty section, a spinner, or
  a silently missing card.
- Every generative action states its cost before the rep commits to it
  (`lib/costs.ts`), because they are spending their own Anthropic key.
- Prefer showing the rep less and letting them ask, over producing more on
  their behalf. Unasked-for output costs money, and a brief full of material
  nobody requested is harder to trust, not easier.
- Declining to answer is a valid result. "No named individuals found publicly"
  is a correct outcome, not a failure state, and must be rendered as one.

## Naming and the rename path

- **SalesLord** — the repo name (stays forever — it's the platform monorepo name).
  The prospecting app is still branded SalesLord in user-facing strings; it will
  be renamed ProspectLord when user-facing rename work happens.
- **ProspectLord** — rename target for the current prospecting app.
- **CELord** — CE signal detection app. Shares packages and Supabase project.
- **TerritoryLord** — territory whitespace app. v0 built, slated for a restart.

## Repo structure

```
saleslord/                  (monorepo root)
├── CLAUDE.md               (this file — shared platform context)
├── HANDOFF.md              (pointer to active work)
├── pnpm-workspace.yaml     (workspace config)
├── turbo.json              (build pipeline)
├── tsconfig.base.json      (base TS config extended by all packages)
├── docs/
│   ├── prospectlord/       (ProspectLord CLAUDE/HANDOFF/BACKLOG)
│   ├── celord/             (CELord CLAUDE/HANDOFF/BACKLOG)
│   └── territorylord/      (TerritoryLord CLAUDE/HANDOFF/BACKLOG)
├── packages/
│   ├── core/               (@saleslord/core — Organization, types, enums)
│   ├── signals/            (@saleslord/signals — collectors, enrichment, scoring, persist)
│   └── db/                 (@saleslord/db — schema.sql, migrations)
└── apps/
    └── web/                (@saleslord/web — single Next.js app, all products)
        ├── proxy.ts        (Next.js 16 auth middleware — covers ALL routes)
        ├── vercel.json     (cron config + function timeouts)
        ├── app/
        │   ├── layout.tsx          (root layout — platform ribbon)
        │   ├── globals.css         (design tokens + Tailwind)
        │   ├── login/
        │   ├── access-denied/
        │   ├── auth/callback/
        │   ├── (app)/              (ProspectLord routes)
        │   ├── celord/             (CELord routes)
        │   └── territorylord/      (TerritoryLord routes — v0 prototype)
        ├── components/             (app-specific UI components)
        └── lib/                    (ProspectLord utilities)
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
- **Email**: **Supabase Auth only** — invites and login links go out through
  `inviteUserByEmail` / `signInWithOtp` (see `app/api/admin/allowed-emails/*`).
  There is no transactional email provider installed. Resend was planned and
  never wired; do not assume it exists.
- **Payments**: none installed. Stripe is planned, not wired.
- **UI components**: shadcn/ui, added via `pnpm dlx shadcn@latest add <name>`.
  The CLI is deliberately not a dependency — it is a scaffolding tool, and
  installing it shipped a build-time-only CLI into the production install.
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
DAILY_CALL_LIMIT                  # Default 50 — runaway guard on metered Anthropic calls per user per 24h; rep_profiles.daily_call_limit overrides per rep
CRON_SECRET                       # Authenticates Vercel cron requests
NEXT_PUBLIC_APP_URL               # e.g. https://saleslord-theta.vercel.app
ANTHROPIC_API_KEY                 # Server-side only — CELord cron/enrichment (not BYOK)
# CELord collectors (add when flipping stubs to real):
# GITHUB_TOKEN / SHODAN_API_KEY / SERPAPI_KEY (or ADZUNA_APP_ID + ADZUNA_APP_KEY)
# Transactional email (only if a provider is ever wired — none is today):
# RESEND_API_KEY
# Stripe (wire when ready — the package is not installed):
# STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

See `.env.local.example` for the full reference.

## Deployment

- **Live URL**: https://saleslord-theta.vercel.app
- **GitHub**: https://github.com/birddogdataservices/saleslord
- **Vercel account**: birddogdataservices (Hobby plan — public repo required)
- **Vercel Root Directory**: `apps/web` — must be set in Vercel project settings
- Vercel auto-deploys on every push to `main`
- Supabase auth redirect URLs must include the Vercel domain in Authentication → URL Configuration

## Local dev

```bash
# From repo root:
pnpm install
pnpm dev        # runs turbo dev --filter=@saleslord/web → next dev in apps/web

# Or directly from apps/web (after pnpm install at root):
cd apps/web && pnpm dev
```

Copy `.env.local` into `apps/web/` for local dev. The `.env.local` file is not
at the repo root — Next.js looks for it relative to the app directory.

## Versioning

Semver tags on `main` at meaningful milestones. Tags are the source of truth.

Current version: **v1.7.3** (docs corrected to match the repo; dead deps removed)

Known gap: there is no v1.0.0 tag — the TerritoryLord session (documented as
v1.0.0 in HANDOFF.md) was never tagged. Tags jump v0.9.0 → v1.1.0.

**Tag after merging to main — and update the "Current version" line above in
the same change. That line must always match the latest tag; if they disagree,
trust `git tag` and fix this file.**
```bash
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
```

Increment guide:
- **patch** (0.x.1) — bug fixes, copy changes, minor UI tweaks
- **minor** (0.x+1.0) — new feature or session milestone (new collector, new app section, enrichment, etc.)
- **major** (1.0.0) — reserved for a platform milestone (e.g. first paid customer, public launch)

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
  `API_KEY_ENCRYPTION_SECRET`, `CRON_SECRET`, collector API keys — and any
  provider key added later)
- Call Anthropic client-side
- Skip RLS on client Supabase queries
- Import `apps/web/lib/supabase/admin.ts` from anywhere outside `apps/web/app/api/*`
- Import across the route boundary — ProspectLord files must not import from
  `app/celord/`, CELord files must not import from `app/(app)/`,
  `components/prospect/`, or `lib/`
- Add Supabase client imports inside `packages/core/` or `packages/signals/` — pass as dependency
- Reach from `packages/` into `apps/` — dependency arrows flow one way only
- Touch another app's route code when working on one app

## Supabase admin client pattern

Always use the admin client (service role) in API routes for privileged operations:
```ts
import { createAdminClient } from '@/lib/supabase/admin'
const adminClient = createAdminClient()
```
Never import `admin.ts` from client components, server components, or
`core/`/`signals/` code.

## Runaway guard (ProspectLord Anthropic calls)

**This is a guard, not a budget.** BYOK means every rep pays their own card, so
the limit is not there to control spend — it exists so a retry loop or a
misconfigured client cannot make unbounded calls before anyone notices. Default
50/day, sized never to bind in real use.

Never hand-roll the check. `lib/api-usage.ts` owns it:

```ts
import { checkDailyLimit } from '@/lib/api-usage'

// Pass the rep's override when the profile is already loaded — omitting it
// falls back to the env default and silently ignores a configured override.
const limit = await checkDailyLimit(adminClient, user.id, profile?.daily_call_limit)
if (!limit.ok) return Response.json({ error: limit.error }, { status: limit.status })
```

Only **metered** endpoints count — `METERED_ENDPOINTS` in the same module. The
search-heavy Sonnet routes (research, decision-makers, check-updates,
case-study-match) are metered. The cheap Haiku routes (email, pitch opener,
resolve) are deliberately not: reps are meant to iterate on copy freely, and
they still write to the cost ledger. Keeping those two jobs separate is what
makes raising the ceiling safe.

Per-rep override: `rep_profiles.daily_call_limit` (null = env default). Manual
SQL edit for now; an admin UI is in `docs/prospectlord/BACKLOG.md`.

## Cost tracking

After every Anthropic call, write to `api_usage`:
```ts
import { calculateCost } from '@/lib/utils'
const cost = calculateCost(model, usage.input_tokens, usage.output_tokens)
await adminClient.from('api_usage').insert({ user_id, prospect_id, endpoint, model,
  input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: cost })
```

`calculateCost` is in `lib/utils.ts`. Update pricing there when Anthropic changes rates.
