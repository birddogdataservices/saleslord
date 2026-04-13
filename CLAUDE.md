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
- **PDF-to-image**: `pdf-to-img` (wraps `pdfjs-dist` — no system binary deps, Vercel-safe)
- **PDF generation**: `@react-pdf/renderer` — server-side only, PDF components in `lib/pdf/*.tsx`
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
├── vercel.json                 # Cron config — Monday 6am /api/cron/refresh-all
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
│   ├── crypto.ts               # encryptApiKey / decryptApiKey — AES-256-GCM
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
│       ├── setup/              # Rep profile setup page
│       ├── admin/
│       │   ├── products/       # Admin CRUD for shared products
│       │   ├── users/          # Admin invite management (allowed_emails)
│       │   └── case-studies/   # Admin CRUD + PDF deck import for case study library
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
│       ├── RightColumn.tsx     # Outreach readiness, angle, tech, log wrapper
│       ├── CaseStudySection.tsx     # Match trigger, ranked cards, export — in right column
│       └── CaseStudySlideModal.tsx  # Slide image preview modal
└── app/api/
    ├── research/route.ts       # POST — full prospect research ✅
    ├── refresh-email/route.ts  # POST — regenerate email draft only ✅
    ├── profile/
    │   └── api-key/route.ts    # POST — encrypt + store user Anthropic key ✅
    ├── admin/
    │   ├── allowed-emails/     # GET + POST + DELETE — invite management ✅
    │   ├── team-config/route.ts          # GET + PUT — singleton targeting config ✅
    │   └── case-studies/
    │       ├── route.ts                  # GET (list) + POST (create) + DELETE ✅
    │       └── import-deck/route.ts      # POST — PDF upload → extract → seed ✅
    ├── case-studies/
    │   ├── match/route.ts               # POST — prospect matching call
    │   ├── export-pdf/route.ts          # POST — assemble + stream PDF of selected slides
    │   └── slide-url/[id]/route.ts      # GET — generate signed Supabase Storage URL
    ├── export/pdf/[id]/        # GET — PDF brief export ✅
    ├── refresh/route.ts        # POST — re-research one prospect (to build)
    └── cron/refresh-all/       # GET — weekly cron (to build)
```

## Database schema

See `supabase/schema.sql` for the full migration. Tables:

- `rep_profiles` — one row per user; `stripe_customer_id` stub; `is_admin` flag
- `allowed_emails` — access control allowlist (no RLS select policy — service role only)
- `prospects` — one row per tracked company; upserted on `user_id + query`
- `prospect_briefs` — one active brief per prospect; includes `stats jsonb` for stat cards
- `decision_makers` — 3–5 per prospect, role-colored avatars; `targeting_tier` (prime_target | intel_only | low_signal) + `tier_reasoning` set by research prompt; UI sorts by tier rank then sort_order — no badges, no sections
- `prospect_notes` — log entries; filter by state + industry
- `follow_ups` — gated by reason (>= 10 words)
- `api_usage` — every Anthropic call logged here with token counts + cost_usd
- `case_studies` — shared library; admin-managed; slide images in Supabase Storage bucket `case-study-slides`
- `team_config` — singleton table (one row); `seniority_bands` + `target_functions` jsonb string arrays; admin-managed via `/api/admin/team-config`; all reps read; research route injects into system prompt

## team_config shape

Singleton table — one row for the whole team. Admin-managed. Research route reads from here; no per-rep targeting override.

```ts
type TeamConfig = {
  id: string
  seniority_bands: string[]   // ordered — preset + custom additions
  target_functions: string[]  // ordered — preset + custom additions
  updated_at: string
}
```

Preset seniority bands: C-Suite, SVP / EVP, VP, Senior Director, Director, Head of [Function], Senior Manager, Manager, Individual Contributor
Preset target functions: Data Engineering, Data Platform, Data Architecture, Analytics Engineering, Business Intelligence, Data Science, Data Governance, Data Management, Enterprise Architecture, IT / Infrastructure, Software Engineering, Operations, Product, Finance

RLS: all authenticated users can read; no client writes — `/api/admin/team-config` uses service role only.

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

## case_studies table shape

```ts
type CaseStudy = {
  id: string
  title: string
  company_name: string | null
  industry: string | null
  company_size: string | null     // "Enterprise" | "Mid-market" | "SMB"
  pain_solved: string | null
  product_used: string | null
  outcome: string | null          // 2–3 sentence result summary
  tags: string[]
  slide_image_path: string | null // Supabase Storage path — bucket: case-study-slides
  source_deck: string | null      // original PDF filename, for provenance
  created_at: string
}
```

RLS: all authenticated users can read; no client writes — admin routes use service role only.

## API routes

### GET + PUT /api/admin/team-config ✅ built
Singleton targeting config. GET: any authenticated user (used by setup page). PUT: admin-only upsert; validates arrays; fetches existing row id to upsert by pk. No Anthropic call.

### POST /api/research ✅ built
Full prospect research. Anthropic web search tool with agentic loop. Writes to prospects, prospect_briefs, decision_makers (including targeting_tier + tier_reasoning). Fetches team_config and injects seniority_bands + target_functions into system prompt. Logs to api_usage.

### POST /api/follow-up — to build
Follow-up touch generation. Requires `reason` >= 10 words. Reads full note history. Logs to api_usage.

### POST /api/refresh — to build
Re-research one prospect. Diffs new brief. Never overwrites timing. Logs to api_usage.

### GET /api/cron/refresh-all — to build
Weekly cron. Service role. Re-researches all prospects, sends Resend digest.

### POST /api/admin/case-studies/import-deck — to build
Admin-only. Accepts PDF upload. Converts pages to PNGs via `pdf2pic`. Calls Claude vision per slide to extract metadata (is_case_study, company_name, industry, company_size, pain_solved, product_used, outcome, tags). Uploads qualifying slide PNGs to Supabase Storage bucket `case-study-slides`. Inserts records into `case_studies`. ⚠️ `pdf2pic` requires ghostscript — test carefully on Vercel; if unavailable, fallback is ZIP of PNGs.

### POST /api/case-studies/match — to build
No web search. Fetches prospect brief + all case studies. Single Claude call to rank top 5 by relevance and return match_reasons per result. Logs to api_usage with endpoint `'case-study-match'`. ~2–4k tokens per call (~$0.003–0.005).

### POST /api/case-studies/export-pdf — to build
No Anthropic call. Fetches case study records + signed Storage URLs for selected IDs. Assembles PDF (cover page + one slide image per page) using @react-pdf/renderer. Streams as download. Does NOT log to api_usage.

### GET /api/case-studies/slide-url/[id] — to build
Generates a short-lived signed URL for a single slide image in Supabase Storage. Used by CaseStudySlideModal to render previews without exposing the storage bucket publicly.

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
- Case Study Matcher lives in the right column under outreach readiness — NOT in the topbar

## Core design principles (never violate)

1. **Voice calibration is a hard constraint.** Voice samples must be in the system prompt on every generation. Warn (amber badge) if < 80 chars. Never block generation, but never silently omit samples.

2. **Follow-ups are gated by reason.** `reason` must be >= 10 words. The reason must be the structural anchor of the generated email, not a footnote.

3. **Slop detection runs on every output.** Use `detectSlop()` from `lib/slop.ts`. Flag with badge. Never silently strip. Never block. List the specific phrases found.

4. **Prospect notes inform suggested angles.** Full note history must be in the system prompt when generating decision maker angles.

5. **News is always sorted descending.** Sort before writing to DB. Treat DB order as authoritative. Never re-sort client-side.

6. **Timing is never overwritten by refresh.** Refresh updates news, pain_signals, initiatives, outreach_angle only. Timing requires explicit full re-research.

7. **API keys never touch the client.** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `API_KEY_ENCRYPTION_SECRET` are used only in `/app/api/*` route handlers. User Anthropic keys are stored AES-256-GCM encrypted in `rep_profiles.anthropic_api_key`; encrypted via `POST /api/profile/api-key`; decrypted via `lib/crypto.ts` only inside API routes.

8. **Case study slide images are never public.** The `case-study-slides` Supabase Storage bucket must be private. Always serve images via short-lived signed URLs from `/api/case-studies/slide-url/[id]`. Never expose the bucket URL directly to the client.

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
- Expose the `case-study-slides` Storage bucket publicly or return signed URLs to unauthenticated requests
- Use JSX in route handler `.ts` files — if a route needs JSX (e.g. `@react-pdf/renderer`), put the component in `lib/pdf/*.tsx` and import it, then call `React.createElement()` in the route
- Import `pdf-to-img` (or any pdfjs-dist-based package) at the top level of a route — it loads a worker via a numeric webpack chunk ID at module evaluation time, breaking Next.js Turbopack's build phase with `ERR_INVALID_ARG_TYPE`. Always use `const { pdf } = await import('pdf-to-img')` inside the handler function

## Browser quirks

- **Chrome autofill ignores `autoComplete="off"` and `autoComplete="new-password"`** on text inputs it heuristically associates with saved credentials (e.g. any input near the word "function"). Use `type="search"` instead — Chrome does not autofill search inputs. If the ✕ clear button looks wrong, hide it with CSS.

## Next.js 16 notes

- Middleware file is `proxy.ts` at the root; export function must be named `proxy`. This is Next.js 16's renamed version of `middleware.ts`. Do NOT create a `middleware.ts` — the build will fail if both exist.
- **Route handler params are async** — in Next.js 15+, dynamic segment params are `Promise<{ id: string }>` not `{ id: string }`. Always destructure with `await`: `const { id } = await params`. Build will fail on type check if you use the old pattern.
- All pages using Supabase need `export const dynamic = 'force-dynamic'`
- App Router — server components fetch data, client components handle interactivity
- Route handlers live in `app/api/*/route.ts`

## Deployment

- **Live URL**: https://saleslord-theta.vercel.app
- **GitHub**: https://github.com/birddogdataservices/saleslord
- **Vercel account**: birddogdataservices (Hobby plan — public repo required)
- Vercel auto-deploys on every push to `main`
- Supabase auth redirect URLs must include the Vercel domain in Authentication → URL Configuration
