# ProspectLord — Backlog

Items are roughly priority-ordered within each section.

## 🔴 Must have (core product not usable without these)

- [x] Complete setup page (background, voice samples, ICP, products) — unlocks research
- [x] Run first real prospect research end-to-end and verify summary page
- [x] Email draft panel — "Draft email →" button, subject + body, slop detection badge, copy button
- [x] **BYOK** — per-user Anthropic API key; hard gate (no key = no research, no fallback); input in setup page; stored server-side only
- [x] **Invite management** — `/admin/users` page; pre-authorize by email; add/remove inline; admin-only

## 🟡 Should have (product is awkward without these)

- [x] Check for Updates — `POST /api/check-updates`, append-only blurb history, `UpdateBlurbs` component, `CheckUpdatesButton` in topbar
- [x] **Decision maker targeting tiers** — `targeting_tier` + `tier_reasoning` on `decision_makers`; `team_config` singleton for shared seniority bands + target functions; chip UI in setup page (admin-edit, all reps read); research prompt tiers each DM; cards sort prime_target → intel_only → low_signal; single flat list, no badges or sections.

- [ ] Vercel cron wired (`vercel.json` already has the schedule)
- [ ] Product selector in "Add prospect" flow — when multiple products exist, let rep pick which to research against
- [x] **Case Study Matcher** — built in session 7. All routes + UI complete. **⚠️ Pending seeding test** — waiting on Pentaho PDF from Jon. Steps when PDF arrives:
  1. Run the Supabase migration in `schema.sql` (case_studies table + RLS)
  2. Create `case-study-slides` Storage bucket (private) in Supabase dashboard
  3. Go to `/admin/case-studies` → Upload PDF → verify import count + review extracted records
  4. Test `pdf-to-img` on Vercel — if it fails due to runtime issues, implement ZIP-of-PNGs fallback
  5. Run "Find matches" on a prospect with a brief, verify top-5 results
  6. Test slide preview modal (signed URL) and PDF export

## 🟢 Nice to have (quality of life)

- [ ] `/api/follow-up` route + panel UI — gated by reason >= 10 words, reads full note history; de-prioritized (initial outreach focus only for now)
- [ ] Email quality iteration — continue refining prompt rules; consider A/B testing different structures
- [ ] Loading skeleton for prospect summary page while research runs
- [ ] Voice calibration badge in app header (not just setup page)
- [ ] Decision maker "Updated from your notes" badge — show when a note references a person by name
- [ ] Prospect search — sidebar search is client-side filter; works fine for < 100 prospects
- [ ] Topbar company meta — show headcount / stage from stats below company name (already partially done)
- [ ] Empty state for prospects with no brief yet (beyond current placeholder text)

## 🤖 Model strategy (revenue + quality)

- [ ] Benchmark models for research quality: claude-sonnet-4-6 vs claude-haiku-3-5 vs opus; measure output quality vs cost per call on a fixed set of test companies
- [ ] Platform margin model — app uses its own key, marks up Anthropic cost by X% (e.g. 20–30%), invoices via Stripe; `calculateCost()` already captures raw cost so margin math is straightforward
- [ ] Per-user model selection — let reps pick their model tier (fast/cheap vs. slow/thorough); store on rep_profiles; pass to research + follow-up routes
- [ ] Research: evaluate whether haiku is good enough for follow-up drafts (shorter context, lower stakes than initial research)

## 💳 Payments (when ready to recover costs)

- [ ] Stripe customer creation on first sign-in (update `stripe_customer_id` on rep_profiles)
- [ ] Monthly usage-based billing: read `api_usage`, report to Stripe, auto-invoice
- [ ] Stripe Customer Portal link in settings (self-serve payment method management)

## 🔐 Access management

- [x] Admin UI to add/remove emails from `allowed_emails` table — `/admin/users`
- [ ] Admin UI to promote/demote other reps to admin (currently requires direct SQL)
- [ ] Per-user usage dashboard — table of costs by day/endpoint
- [ ] Option to switch from allowlist to domain-restriction (one `if` change in `proxy.ts` — Next.js 16 middleware)

## 🔧 Infrastructure

- [ ] Background job pattern for research — current approach caps at 3 search iterations to stay under Vercel's 300s timeout; if brief quality suffers, move to Inngest for durable execution with no timeout constraint
- [ ] Error boundaries for failed data fetches (prospect page currently has no error state)
- [ ] 429 rate-limit UI feedback — currently toast shows raw error string; could be friendlier
- [x] Vercel deployment configured — live at https://saleslord-theta.vercel.app

## 🗂️ Case Study Matcher — deferred v2 items

- [ ] "Refresh from web" — admin action to scrape Pentaho's website and auto-populate/update library
- [ ] Per-prospect history of which case studies were shared with which prospect
- [ ] ZIP-of-PNGs import path (fallback if pdf2pic hits Vercel runtime issues)
- [ ] Bulk CSV edit of case study library

## 🌍 Internationalization — deferred by decision

i18n shipped in v1.4.0 (ProspectLord-only, profile-driven, the 6 languages). These
were deferred by explicit decision during that design session — not omissions.

- [ ] **On-demand re-translation of generated rep content** — convert an
  already-generated brief / match reason / summary into another language after the
  fact (e.g. a rep wants a brief in English to forward to a colleague). Rep-facing
  generation currently always follows `profile.locale` with no override.
- [ ] **Decouple chrome language from generation language** — today `profile.locale`
  drives both. The escape hatch is a second profile field (e.g. `generation_locale`)
  that falls back to `locale` when null. Right for v1 to keep them fused; this is the
  unlock when a rep wants an English UI with Portuguese output (or vice versa).
- [ ] **Translate CELord / TerritoryLord chrome** — the provider already sits at the
  root layout, so backfilling is just: extract those apps' strings into catalogs and
  run the author-time translation script. No new infrastructure.
- [ ] **Complete the ProspectLord chrome extraction sweep** — v1.4.0 extracted the
  high-visibility chrome (platform-shared chrome, sidebar, jobs, setup, prospect
  topbar + section scaffolding, the compose modals). Remaining brief sub-components
  (DecisionMakers, NewsCard, TimingBar, StatCards, ProspectLog, UpdateBlurbs, the
  topbar action buttons) still have hardcoded English — they fall back to en-US,
  which is fine, but a sweep would fully localize the page.
- [ ] **Languages beyond the 6** — Claude can generate far more at runtime, so if reps
  need outbound copy in a language outside the skin set, add a curated list (~15–20) to
  the generation dropdown **without** adding chrome catalogs. Generation list and chrome
  list can diverge — both still read the shared lookup, but not every entry needs a catalog.
- [ ] **Case-study slide localization** — the matcher pulls slides from the
  English-authored Pentaho PDF. Match-reason chips localize; the slides stay English.
  Localizing slides would mean maintaining per-language decks — deferred indefinitely.
  Flagged so it isn't filed as a bug.
- [ ] **RTL and CJK support** — the 6 launch languages are all left-to-right Latin
  script. Arabic/Hebrew (RTL) and CJK need layout work (bidi, line-breaking, font
  stacks) beyond catalog translation. Out of scope until requested.
- [ ] **Locale-aware formatting audit** — v1.4.0 covers the jobs sidebar cost + the
  sidebar monthly cost via next-intl currency formatting (job elapsed/runtime stays a
  locale-neutral `m:ss` stopwatch). A later sweep should catch any remaining hardcoded
  date/number/currency formatting across ProspectLord.
