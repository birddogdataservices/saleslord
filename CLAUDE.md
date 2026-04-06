# SalesLord — Claude Code context

## What this is

A B2B sales prospecting assistant for enterprise AEs. It replaces the gap between "here's a company profile" and "here's what to actually say to this specific person today." Every output — briefs, emails, follow-ups, suggested angles — is grounded in the rep's voice, the prospect's fiscal year and buy cycle, and real relationship history.

Not a sequencing tool. Does not automate outreach. Intelligence and drafting layer the rep controls entirely.

## Tech stack

- **Framework**: Next.js 16 (App Router), TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Database**: Supabase (Postgres + Auth + RLS)
- **Auth**: Supabase Google OAuth
- **AI**: Anthropic `claude-sonnet-4-6` via server-side Route Handlers only
- **Web search**: Anthropic web search tool (`web_search_20250305`)
- **Email**: Resend (weekly digest)
- **Payments**: Stripe (stubbed — wire when ready)
- **Deployment**: Vercel (Next.js native)
- **Cron**: Vercel cron (`vercel.json`) — Monday 6am weekly refresh

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL          # Safe client-side
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Safe client-side
SUPABASE_SERVICE_ROLE_KEY         # Server-side only — admin client
API_KEY_ENCRYPTION_SECRET         # 64 hex chars — AES-256-GCM key for encrypting user Anthropic keys in DB
# ANTHROPIC_API_KEY is no longer used — users bring their own key via /setup
ALLOWED_DOMAIN                    # e.g. "yourcompany.com" — server auth gate
NEXT_PUBLIC_ALLOWED_DOMAIN        # Same value — passed to Google OAuth hd= param
DAILY_CALL_LIMIT                  # Default 25 — max Anthropic calls per user per 24h
RESEND_API_KEY                    # Server-side only
CRON_SECRET                       # Authenticates Vercel cron → /api/cron/refresh-all
NEXT_PUBLIC_APP_URL               # e.g. https://saleslord.vercel.app
# Stripe (wire when ready):
# STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

See `.env.local.example` for the full reference.

## Repository structure

```
/
├── CLAUDE.md
├── HANDOFF.md
├── BACKLOG.md
├── proxy.ts                    # Next.js 16 proxy (auth gate + access control)
├── vercel.json                 # Cron config
├── .env.local.example
├── supabase/
│   └── schema.sql              # Source of truth for DB schema
├── .claude/
│   ├── commands/               # Slash command specs
│   └── skills/                 # research-prompt, voice-calibration, slop-detection
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser Supabase client (anon key)
│   │   ├── server.ts           # Server Supabase client (anon key + cookies)
│   │   └── admin.ts            # Service role client — API routes ONLY
│   ├── types.ts                # All DB row types + composite view types
│   ├── slop.ts                 # SLOP_PHRASES list + detectSlop()
│   └── utils.ts                # cn(), calculateCost(), ROLE_COLORS, windowStatusColor()
├── app/
│   ├── layout.tsx              # Root layout (Toaster, fonts)
│   ├── globals.css             # Design tokens + Tailwind
│   ├── login/                  # Google OAuth sign-in page
│   ├── access-denied/          # Shown when email not on allowlist
│   ├── auth/callback/          # OAuth code exchange route
│   └── (app)/                  # Auth-gated group layout (sidebar + main)
│       ├── layout.tsx          # Fetches sidebar data, renders Sidebar + {children}
│       ├── page.tsx            # Redirects to first prospect or /setup
│       ├── setup/              # Rep profile setup page (multi-product)
│       └── prospects/[id]/     # Full prospect summary page
├── components/
│   ├── ui/                     # shadcn components
│   └── prospect/
│       ├── Sidebar.tsx         # Dark sidebar, grouped by window status
│       ├── AddProspectInput.tsx # Inline research trigger in sidebar
│       ├── TimingBar.tsx       # FY timing bar (always first in content)
│       ├── StatCards.tsx       # Revenue / headcount / open roles / stage
│       ├── NewsCard.tsx        # Paginated news (3/page, client component)
│       ├── DecisionMakers.tsx  # DM cards with role dropdown
│       ├── ProspectLog.tsx     # Filterable note log with add form
│       └── RightColumn.tsx     # Outreach readiness, angle, tech, log wrapper
└── app/api/
    ├── research/route.ts       # POST — full prospect research (built)
    ├── follow-up/route.ts      # POST — follow-up touch (to build)
    ├── refresh/route.ts        # POST — re-research one prospect (to build)
    └── cron/refresh-all/       # GET — weekly cron (to build)
```

## Database schema

See `supabase/schema.sql` for the full migration. Tables:

- `rep_profiles` — one row per user; `products jsonb` array; `stripe_customer_id` stub
- `allowed_emails` — access control allowlist (no RLS select policy — service role only)
- `prospects` — one row per tracked company; upserted on `user_id + query`
- `prospect_briefs` — one active brief per prospect; includes `stats jsonb` for stat cards
- `decision_makers` — 3–5 per prospect, role-colored avatars
- `prospect_notes` — log entries; filter by state + industry
- `follow_ups` — gated by reason (>= 10 words)
- `api_usage` — every Anthropic call logged here with token counts + cost_usd

All tables have RLS. Client always uses anon key. Service role key only in `/app/api/*`.

## rep_profiles.products shape

```ts
type Product = {
  id: string           // client-generated UUID
  name: string
  description: string
  value_props: string
  competitors: string
}
// Stored as products jsonb default '[]' on rep_profiles
```

The research prompt handles 1 or many products. With multiple products it instructs the model to match the most relevant one to the prospect.

## API routes

### POST /api/research ✅ built
Full prospect research. Anthropic web search tool with agentic loop. Writes to prospects, prospect_briefs, decision_makers. Logs to api_usage.

### POST /api/follow-up — to build
Follow-up touch generation. Requires `reason` >= 10 words. Reads full note history. Logs to api_usage.

### POST /api/refresh — to build
Re-research one prospect. Diffs new brief. Never overwrites timing. Logs to api_usage.

### GET /api/cron/refresh-all — to build
Weekly cron. Service role. Re-researches all prospects, sends Resend digest.

## Rate limiting

Every API route checks `api_usage` before calling Anthropic:
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

## Design tokens

All custom colors are CSS variables on `:root` in `app/globals.css`:
- `--sl-bg`, `--sl-surface`, `--sl-surface2`, `--sl-border`, `--sl-border-s`
- `--sl-text`, `--sl-text2`, `--sl-text3`
- `--sl-sidebar` (#18181A — dark sidebar)
- Status pairs: `--sl-green-bg/t`, `--sl-amber-bg/t`, `--sl-coral-bg/t`, `--sl-blue-bg/t`, `--sl-purple-bg/t`, `--sl-teal-bg/t`

## UI source of truth

`prospect-summary-mockup.html` (root) is the canonical layout reference. Key decisions:
- Two-column body: intel left, actions right (340px fixed right column)
- Timing bar always first, above stats
- News above decision makers in left column; paginated 3/page; sorted descending — never re-sort
- Sidebar groups: Window open → Approaching → Monitoring
- Role pills reassignable via dropdown; custom roles supported
- Log filterable by state and industry independently

## Core design principles (never violate)

1. **Voice calibration is a hard constraint.** Voice samples must be in the system prompt on every generation. Warn (amber badge) if < 80 chars. Never block generation, but never silently omit samples.

2. **Follow-ups are gated by reason.** `reason` must be >= 10 words. The reason must be the structural anchor of the generated email, not a footnote.

3. **Slop detection runs on every output.** Use `detectSlop()` from `lib/slop.ts`. Flag with badge. Never silently strip. Never block. List the specific phrases found.

4. **Prospect notes inform suggested angles.** Full note history must be in the system prompt when generating decision maker angles.

5. **News is always sorted descending.** Sort before writing to DB. Treat DB order as authoritative. Never re-sort client-side.

6. **Timing is never overwritten by refresh.** Refresh updates news, pain_signals, initiatives, outreach_angle only. Timing requires explicit full re-research.

7. **API keys never touch the client.** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `API_KEY_ENCRYPTION_SECRET` are used only in `/app/api/*` route handlers. User Anthropic keys are stored AES-256-GCM encrypted in `rep_profiles.anthropic_api_key`; encrypted via `POST /api/profile/api-key`; decrypted via `lib/crypto.ts` only inside API routes.

## What Claude Code must never do

- Generate follow-up without stated reason
- Expose secret env vars client-side
- Overwrite prospect notes on refresh
- Overwrite timing data on refresh
- Sort news ascending
- Generate copy without running slop detection
- Call Anthropic client-side
- Skip RLS on client queries
- Invent UI patterns not in the mockup without flagging first
- Import `lib/supabase/admin.ts` from anywhere outside `/app/api/*`

## Next.js 16 notes

- Middleware file is `middleware.ts` at the root; export function must be named `middleware`. (An earlier session mistakenly called this `proxy.ts` with export `proxy` — that was never picked up by Next.js. Fixed in session 4.)
- All pages using Supabase need `export const dynamic = 'force-dynamic'`
- App Router — server components fetch data, client components handle interactivity
- Route handlers live in `app/api/*/route.ts`
