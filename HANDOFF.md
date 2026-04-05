# SalesLord — Handoff

## Current version: 0.3.0 — Research working, email panel live

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

## What's next (priority order)

1. **`/api/follow-up` route** — gated by reason >= 10 words, reads full note history, slop detection, logs api_usage
2. **Follow-up panel UI** — reason input (word count gate), generated output with slop badge, copy button
3. **BYOK** — per-user Anthropic API key in setup page; research + follow-up + refresh-email routes use it when set; fall back to platform key
4. **`/api/refresh` route** — re-research one prospect, never overwrites timing, diff on brief fields
5. **Re-research button** wired in topbar
6. **`/api/cron/refresh-all`** — weekly refresh + Resend digest

---

## Architecture decisions made this session

- **Shared products table** replaces per-rep `products` jsonb. All reps see all products. Admins manage. Research uses all products and picks most relevant.
- **Admin flag on rep_profiles** — `is_admin boolean default false`. Set via SQL. First admin bootstrapped manually; future admin management via an admin UI (backlogged).
- **Email refresh is a separate cheap route** — `/api/refresh-email` skips web search, costs ~$0.001 per call vs ~$0.05+ for full research. Iterating on email quality does not burn research credits.
- **Email rules are a shared constant** — `lib/prompts.ts` exports `EMAIL_RULES`. Both research and refresh-email import it. One edit updates all generation endpoints.
- **PDF export is server-side streaming** — `@react-pdf/renderer` on a route handler. No client-side libraries, no browser print dialog. `export const dynamic` not needed since it's a route handler.
