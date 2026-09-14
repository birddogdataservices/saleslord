# ProspectLord — Backlog

Items are roughly priority-ordered within each section.

## 🔴 Must have (core product not usable without these)

- [x] Complete setup page (background, voice samples, ICP, products) — unlocks research
- [x] Run first real prospect research end-to-end and verify summary page
- [x] Email draft panel — "Draft email →" button, subject + body, slop detection badge, copy button
- [x] **BYOK** — per-user Anthropic API key; hard gate (no key = no research, no fallback); input in setup page; stored server-side only
- [x] **Invite management** — `/admin/users` page; pre-authorize by email; add/remove inline; admin-only

## 🟡 Should have (product is awkward without these)

- [ ] **Two generative buttons state no cost (product-principle violation)** —
  root `CLAUDE.md` requires every generative action to state its cost before the
  rep commits, because they are spending their own Anthropic key. Found in
  Session 15:
  - `components/prospect/CheckUpdatesButton.tsx` fires `POST /api/check-updates`
    on a single click — no cost shown and no confirm step. It is a Sonnet 4.6
    web-search loop: the one live run (California, 2026-09-13) made 9 searches
    in 44s, costing $0.26 in tokens plus ~$0.09 in searches (~$0.35 real). There
    is no `COST_HINTS` entry for it yet — `roughly $0.30–$0.50` would cover it.
  - `components/prospect/RebuildBriefButton.tsx` has a confirm step ("Confirm
    refresh?") but shows no price, although it re-runs full research (~$0.40–$0.65).
    `COST_HINTS.refresh` already exists and is imported nowhere — this button is
    its natural consumer.
  Follow the `FindDecisionMakersButton` pattern, which does show its hint.

- [ ] **Web search cost is not in the ledger (cost under-reported)** — Anthropic
  bills the server-side web search tool at **$10 per 1,000 searches**, on top of
  tokens. The SDK reports the count as `usage.server_tool_use.web_search_requests`
  (confirmed present in 0.125), and nothing in the codebase reads it, so
  `api_usage` records only the token half of the bill for research,
  decision-makers and check-updates — the three search-heaviest routes.

  This matters more here than it would elsewhere: BYOK means the rep is spending
  their own card, `lib/costs.ts` quotes them a price before they commit, and the
  number they are shown is systematically LOW. At 10–30 searches a stage that is
  $0.10–$0.30 per stage unaccounted, so a "$0.75" brief may really be $0.95+.

  **Session 15 added logging, not billing** — each route now logs its search
  count, so the real magnitude can be read off production runs before the ledger
  changes. Once there are numbers:
  1. `api_usage` needs a `web_search_requests int not null default 0` column
     (migration) — the count is worth storing raw, not just folded into
     `cost_usd`, so historical rows stay re-pricable if the rate changes.
  2. `calculateCost` in `lib/utils.ts` takes the count and adds
     `searches * 0.01`. Keep it a named constant next to `PRICING`.
  3. `logUsage` threads it through; `lib/costs.ts` estimates get revisited.

  Related latent trap found in the same audit: `CACHE_WRITE_MULTIPLIER` is 1.25x,
  correct for the 5-minute ephemeral cache in use. The **1-hour** cache write is
  **2x**. If anyone ever sets `ttl: '1h'`, that multiplier is silently wrong.

- [x] Check for Updates — `POST /api/check-updates`, append-only blurb history, `UpdateBlurbs` component, `CheckUpdatesButton` in topbar
- [x] **Decision maker targeting tiers** — `targeting_tier` + `tier_reasoning` on `decision_makers`; `team_config` singleton for shared seniority bands + target functions; chip UI in setup page (admin-edit, all reps read); research prompt tiers each DM; cards sort prime_target → intel_only → low_signal; single flat list, no sections. **Updated 2026-09-08:** tier badge + `tier_reasoning` now render on each card, on screen and in the exported PDF — the tiers were computed and stored but invisible, so a rep could not tell which names were worth approaching or why. Sorting alone did not communicate it.

- [ ] Vercel cron wired (`vercel.json` already has the schedule)
- [ ] Product selector in "Add prospect" flow — when multiple products exist, let rep pick which to research against
- [ ] **Purchasing-power metric (replaces the fixed `revenue` stat)** — every
  organization has *some* indicator of ability to spend; which one depends on
  what it is. Public company → revenue. SLED → enacted budget or appropriation.
  Private → estimated revenue or funding raised. Higher ed → endowment or
  operating budget. Nonprofit → total expenses.

  Today the model already finds the right figure and has nowhere to put it:
  `research-prompt.ts` tells it to set `revenue.value` to `"N/A — <entity type>"`
  and hide the real number in `revenue.context`, while `StatCards.tsx` hardcodes
  the label `"Revenue (TTM)"`. A rep on a call sees a card headed REVENUE (TTM)
  reading N/A, with the number they want in 11px grey underneath.

  Root cause: the label lives in the UI and the number lives in the data, so a
  fixed label cannot describe a variable metric. Fix is a self-describing
  `ScaleMetric { kind, label, value, value_usd, context, as_of, source_url }`
  with `kind` validated server-side against a closed set (same pattern as
  `VALID_ROLES` / `VALID_TIERS` in decision-makers) and `unknown` as the honest
  fallback. `as_of` must be a field, not prose — an appropriation without its
  fiscal year is the same class of error as a mislabelled revenue. `value_usd`
  is what would let **TerritoryLord** sort a territory by purchasing power;
  derive it from the figure already produced, do not research it separately.

  Keep the existing accuracy rule verbatim — never report a budget as revenue.
  What changes is that there is finally a right place to put the number, so
  `N/A` stops being the only honest answer. Must not become pressure to always
  fill the slot ("more fields filled is not better").

  Touches `lib/types.ts`, `lib/research-prompt.ts`, `components/prospect/
  StatCards.tsx` and `components/prospect/BriefPdf.tsx`. `stats` is jsonb so no
  SQL migration is required, but existing briefs need a read-side fallback or
  they stop rendering. Prompt + schema change on the AI path → its own branch
  and its own measured run, per MODEL-UPGRADES.md.
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
- [ ] Admin UI for per-rep `daily_call_limit` override — column is manual-edit only at first (see STAGED-RESEARCH.md)
- [ ] **ZoomInfo integration for decision makers** — the staged decision-maker call finds named people via web search only, and under the Phase 0 sourcing rules it will correctly return "no named individuals found publicly" more often than before. A contact-data provider would turn that empty state into real coverage, and would let the model verify names it found rather than trusting a single web source. Worth revisiting once the staged research split has settled; the decision-maker stage is already an isolated call, so wiring a provider into it does not touch company research.

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
