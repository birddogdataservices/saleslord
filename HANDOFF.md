# SalesLord — Handoff

## Current version: 0.4.0 — BYOK + invite management, ready for team deployment

---

## Session 1 summary (scaffold)

- Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui scaffolded
- Supabase client utilities (browser, server, admin)
- Full DB schema with RLS, `api_usage`, `allowed_emails`, `stripe_customer_id` stub
- Auth proxy (`proxy.ts`): Google OAuth, domain gate, allowlist fallback
- OAuth callback route + rep profile upsert on first sign-in
- App group layout with server-side sidebar data fetch
- Dark sidebar (grouped by window status, cost badge, settings link)
- Login page + access-denied page
- Rep profile setup page (initial version)
- Shared types, slop detection, utilities, design tokens
- Auth flow verified end-to-end in dev

---

## Session 2 summary (research + prospect page)

- **`/api/research` route** — full AI research call with Anthropic web search tool, agentic tool-use loop, writes to prospects/prospect_briefs/decision_makers, logs cost to api_usage
- **`stats` jsonb column** added to `prospect_briefs`
- **`AddProspectInput`** — inline sidebar input, triggers research, toast feedback, navigates on success
- **Full prospect summary page** — timing bar, stat cards, snapshot, initiatives + pain signals, news, decision makers, right column
- **`DecisionMakers`** — role pill dropdown, custom role inline add, direct Supabase update
- **`ProspectLog`** — add note with state/industry, filter pills, optimistic update
- **Setup page** — new field order, multi-product cards (later replaced by shared products table)

---

## Session 3 summary (shared products, PDF export, email panel)

### Completed

**Shared products data model**
- New `products` table — admin-managed, all reps read, RLS enforces write restriction
- `is_admin boolean` on `rep_profiles` — set via SQL, grants access to `/admin/*`
- `/admin/products` page — full CRUD (add, edit, delete), server-side admin gate, redirects non-admins
- Setup page products section — read-only list, "Manage products →" link visible to admins only
- Sidebar footer — "Manage products →" link visible to admins only
- `SetupForm` save changed from `.update()` to `.upsert()` — silently failed for new users before
- Research route now fetches products from `products` table instead of `rep_profiles.products`

**Research pipeline debugged**
- Fixed JSON parsing: model was wrapping output in prose preamble — now extracts first `{` to last `}`
- Added nudge call: if final response contains no `{`, sends one more tool-free message asking for JSON only
- Accumulated token counts across nudge call for accurate cost logging
- Fixed `prospects` upsert: added `UNIQUE (user_id, query)` constraint (upsert requires a constraint, not just an index)
- First successful research runs: MSC Industrial Direct, Broadridge Financial

**PDF export**
- `GET /api/export/pdf/[id]` — server route, auth-gated, streams PDF
- `BriefPdf` component using `@react-pdf/renderer` — company header, timing pill, stats, snapshot, initiatives, pain signals, top 5 news, outreach angle, tech tags, decision maker cards with role colors, email draft
- "Export PDF" button in prospect topbar (hidden until brief exists)
- Filename: `{company-name}-brief.pdf`

**Email writing rules tightened**
- `lib/prompts.ts` — `EMAIL_RULES` constant, single source of truth for all generation endpoints
- Rules: BLUF first sentence, 75 word hard cap, 3–5 sentences + one ask, bullets for data, no flattery, no filler phrases, explicit banned phrase list
- Research route and refresh-email route both import `EMAIL_RULES`

**Email draft panel + refresh**
- `POST /api/refresh-email` — uses existing brief as context, no web search, ~1–2k tokens vs ~20–30k for full research, updates `prospect_briefs.email`, logs to `api_usage` with endpoint `'email'`
- `EmailDraftButton` client component — modal panel with subject/body display, word count badge (green ≤75w / red over), slop detection badge, copy to clipboard, refresh draft button
- "Draft email →" topbar button wired to `EmailDraftButton`, hidden until brief has email

### Supabase migrations run this session
```sql
-- Shared products table + admin flag
alter table rep_profiles add column if not exists is_admin boolean default false;
create table if not exists products ( ... ); -- see schema.sql for full DDL
alter table prospects add constraint prospects_user_id_query_unique unique (user_id, query);

-- Set admin (already run for jonathan.m.hanson@gmail.com)
update rep_profiles set is_admin = true
where user_id = (select id from auth.users where email = 'jonathan.m.hanson@gmail.com');
```

### Known issues / notes
- Existing MSC/Broadridge email drafts use old prompt rules — hit "Refresh draft" in the email panel to regenerate with the tighter rules
- `rep_profiles.products` jsonb column kept for backward compat but no longer used by the app — products now live in the `products` table
- Research occasionally produces prose before JSON — the nudge call handles it, adds a small token cost (~500 tokens)

---

---

## Session 5 summary (Check for Updates, crash recovery, timeout fix)

### Completed

**Check for Updates (replaces Re-research)**
- Design decision: don't overwrite the brief on "refresh" — append blurbs instead. Freshest intel on top, original brief preserved below.
- `prospect_updates` table — one row per check-for-updates run that found relevant intel. `summary` (text), `news_items` (jsonb), `created_at`. RLS via prospect ownership.
- `POST /api/check-updates` — narrow web search call. Passes existing news items + last-checked date to the model for deduplication. Returns `{ found: false }` (no blurb written) if no relevant new intel. Always logs cost to `api_usage`.
- `UpdateBlurbs` component — renders blurb history sorted freshest-first. Each card shows checked date, summary, expandable news items.
- `CheckUpdatesButton` — client component with loading/spinner, toast feedback, `router.refresh()`. Shows last-checked date as tooltip. Hidden until brief exists.
- Follow-ups button removed from topbar.

**window_status computed live**
- `computeWindowStatus(fyEnd: string)` added to `lib/utils.ts` — pure date math, no stored value.
- `TimingBar` and sidebar layout both use `computeWindowStatus(timing.fy_end)` instead of reading `timing.window_status` from DB. Stored value was going stale as months passed.
- Thresholds: open = 90–150 days before FY end, approaching = 150–210 days, closed = everything else.

**Crash recovery for research**
- Research route previously did delete-then-insert for brief and DMs. A crash between delete and insert left a prospect with no brief and no way to re-trigger from the page.
- Fixed: insert-first for both brief and DMs. New row is live immediately; old rows are deleted after. Orphaned rows from a crash are cleaned up on the next research run.
- `ReresearchButton` — client component on the empty brief state. Uses stored `prospect.query` to re-trigger research without the user retyping. Message updated to "Research may still be running, or it was interrupted."

**Vercel function timeout fixes**
- Agentic loop was unbounded — model could make 10–15 web search calls, each 20–40s, exceeding Vercel's 300s limit.
- Capped at 3 iterations for both research and check-updates routes.
- Added explicit `maxDuration` per route in `vercel.json` (60s for research/check-updates, 30s for refresh-email).
- Verified: research now completes within limit.

**Email draft improvement**
- `/api/refresh-email` now fetches the most recent update blurb and injects it into the company context. Email drafts reflect the freshest available intel.

### Supabase migration run this session
```sql
create table prospect_updates (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid references prospects(id) on delete cascade not null,
  user_id      uuid references auth.users not null,
  summary      text not null,
  news_items   jsonb default '[]',
  created_at   timestamptz default now()
);
alter table prospect_updates enable row level security;
create policy "Users access updates via prospect"
  on prospect_updates for all
  using (exists (
    select 1 from prospects p
    where p.id = prospect_id and p.user_id = auth.uid()
  ));
create index on prospect_updates (prospect_id, created_at desc);
```

### Architecture decisions
- **Append-only updates instead of overwriting briefs** — the original brief is stable; each "Check for Updates" call appends a blurb if relevant. Cheaper, preserves history, and lets reps see what changed over time.
- **window_status is derived, not stored** — the stored `window_status` in `timing` jsonb is now ignored by the UI. It's still written during research for potential future use but `computeWindowStatus()` is the source of truth everywhere.
- **3 search iterations max** — Vercel's serverless timeout is the hard constraint. 3 calls ≈ 30–45s execution, leaving headroom. If brief quality suffers, the right fix is a background job pattern (Inngest), not raising the cap.

## What's next (priority order)

1. **`/api/cron/refresh-all`** — weekly refresh + Resend digest (not urgent — cron schedule already in vercel.json)
2. **Background job pattern** — if research quality at 3 iterations proves insufficient, move to Inngest or similar to remove the serverless timeout constraint
3. **Follow-up route + panel** — de-prioritized; initial outreach focus only for now

---

## Session 4 summary (BYOK + invite management)

### Completed

**BYOK — bring your own Anthropic API key (AES-256-GCM encrypted)**
- `anthropic_api_key text` column added to `rep_profiles` (see migration below — must run)
- `lib/crypto.ts` — `encryptApiKey` / `decryptApiKey` using Node.js `crypto` (AES-256-GCM, random 96-bit IV per write, stored as `iv.authTag.ciphertext` hex). Requires `API_KEY_ENCRYPTION_SECRET` env var (64 hex chars).
- `POST /api/profile/api-key` — server route that receives raw key, validates `sk-ant-` prefix, encrypts, writes to DB via admin client. Raw key never touches Supabase directly.
- Setup page (`/setup`) — new "Anthropic API key" section; password input; "API key configured" badge when set; setup page server component strips key before passing to client (`hasApiKey: boolean` only); key save POSTs to `/api/profile/api-key` separately from profile save
- `/api/research` and `/api/refresh-email` — hard gate: fetches encrypted key from `rep_profiles` via admin client, decrypts with `decryptApiKey`; 402 if not set, 500 if decryption fails; no platform fallback
- `lib/types.ts` — `anthropic_api_key: string | null` added to `RepProfile`
- `.env.local.example` — `API_KEY_ENCRYPTION_SECRET` documented with generation command

**Invite management — `/admin/users`**
- `GET/POST /api/admin/allowed-emails` — list and add entries; admin-only (403 for non-admins)
- `DELETE /api/admin/allowed-emails/[id]` — remove entry; admin-only
- `/admin/users` page — server component with admin gate; renders `AdminUsersClient`
- `AdminUsersClient` — fetches list on mount, add form (email + optional note), remove button per row, toast feedback, optimistic list update
- Sidebar — "Manage team →" link added alongside "Manage products →", visible to admins only

**`proxy.ts` confirmed correct for Next.js 16**
- Vercel build error confirmed Next.js 16 uses `proxy.ts` (not `middleware.ts`) — the original was right
- During this session a `middleware.ts` was briefly created by mistake; build failed with "both files detected"; deleted immediately
- `vercel.json` created with Monday 6am cron schedule for `/api/cron/refresh-all`

**Deployed to Vercel**
- Live at https://saleslord-theta.vercel.app
- Repo: https://github.com/birddogdataservices/saleslord (public, birddogdataservices org)
- All env vars set in Vercel; Supabase auth URLs configured

### Required setup before deployment

**1. DB migration (run in Supabase SQL editor):**
```sql
alter table rep_profiles add column if not exists anthropic_api_key text;
```

**2. Generate encryption secret (run once, save to env):**
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Add the output as `API_KEY_ENCRYPTION_SECRET` in `.env.local` and Vercel environment variables. **Do not lose this value** — if it changes, all stored keys become unreadable and users must re-enter them.

**3. Add your own key** — go to `/setup` and enter your Anthropic API key. It will be encrypted before storage.

### Architecture decisions
- **No platform fallback** — each user must provide their own Anthropic API key. Cleaner cost isolation; no risk of absorbing team's usage.
- **Keys encrypted at rest** — AES-256-GCM with a fresh random IV per write. Ciphertext stored in DB; plaintext only ever lives in server memory during a request. Even Supabase dashboard shows only ciphertext.
- **Key write is a dedicated server route** — raw key goes browser → `/api/profile/api-key` (HTTPS) → encrypt → DB. Never hits Supabase client SDK directly.
- **Key read is admin-client only** — fetched in API routes via service role, decrypted in-process, used immediately. Never returned to client.
- **`allowed_emails` admin routes use service role** — the table has no RLS select policy (intentional), so all reads/writes go through API routes with the admin client. Client Supabase SDK is never used for this table.
- **Follow-up de-prioritized** — decision made to focus on initial outreach only; follow-up route moved to nice-to-have in backlog.

---

## Architecture decisions made this session (sessions 1–3)

- **Shared products table** replaces per-rep `products` jsonb. All reps see all products. Admins manage. Research uses all products and picks most relevant.
- **Admin flag on rep_profiles** — `is_admin boolean default false`. Set via SQL. First admin bootstrapped manually; future admin management via an admin UI (backlogged).
- **Email refresh is a separate cheap route** — `/api/refresh-email` skips web search, costs ~$0.001 per call vs ~$0.05+ for full research. Iterating on email quality does not burn research credits.
- **Email rules are a shared constant** — `lib/prompts.ts` exports `EMAIL_RULES`. Both research and refresh-email import it. One edit updates all generation endpoints.
- **PDF export is server-side streaming** — `@react-pdf/renderer` on a route handler. No client-side libraries, no browser print dialog. `export const dynamic` not needed since it's a route handler.
