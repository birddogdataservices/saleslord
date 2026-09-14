# ProspectLord — Backlog

Items are roughly priority-ordered within each section.

## 🔴 Must have (core product not usable without these)

- [x] Complete setup page (background, voice samples, ICP, products) — unlocks research
- [x] Run first real prospect research end-to-end and verify summary page
- [x] Email draft panel — "Draft email →" button, subject + body, slop detection badge, copy button
- [x] **BYOK** — per-user Anthropic API key; hard gate (no key = no research, no fallback); input in setup page; stored server-side only
- [x] **Invite management** — `/admin/users` page; pre-authorize by email; add/remove inline; admin-only

## 🟡 Should have (product is awkward without these)

- [x] **Check for Updates and Refresh company now state their cost** — done
  2026-09-14. Root `CLAUDE.md` requires every generative action to state its cost
  before the rep commits. Both are topbar buttons with no room for a caption, so
  both take two clicks and the confirm step floats the price beneath the button
  (`components/prospect/CostConfirmHint.tsx` — non-interactive, so it cannot take
  focus and cancel the confirm it describes). Blur and Escape cancel.
  - Check for Updates used to fire on a single click. New
    `COST_HINTS.checkUpdates`: roughly $0.30–$0.50 (one measured run: $0.26 in
    tokens + 9 searches, ~$0.35 real).
  - Refresh company already asked "Confirm refresh?" but never said what that
    cost. It now shows `COST_HINTS.refresh`, which existed and was imported
    nowhere.

- [x] **Find Decision Makers states its price wherever it can be clicked** — done
  2026-09-14; the same violation, found while fixing the two topbar buttons. It
  showed `COST_HINTS.decisionMakers` only on the first-run `invite` variant, while
  `refresh` and `retry` spent ~$0.40–$0.65 on a single click with no price. Now:
  - `invite` and `retry` sit in the card body, where there is room: the price is
    a visible caption under the button (now `--sl-text2`, readable at 10px), and
    one click runs it.
  - `refresh` sits in the section header with no room for a caption, so it
    confirms first and floats the price below (`CostConfirmHint`), like the topbar
    research buttons. New i18n key `DecisionMakers.confirmRefresh` in all six
    locales.
  - The floating hint is deliberately NOT used for `retry`: it sits at the foot of
    an `overflow-hidden` card and would be clipped.
  All three use the blue research style from `lib/action-styles.ts`.

- [ ] **Cost hints and several topbar labels are English-only** — the app ships six
  locales, but `COST_HINTS` are plain strings in `lib/costs.ts` rather than entries
  in `messages/*.json`, so a rep on de / es / fr / pt-BR reads every price in
  English. `CheckUpdatesButton` and `RebuildBriefButton` hardcode their labels and
  toasts too. Pre-existing; noticed while adding the confirm steps.

- [x] **Web search cost in the ledger** — done 2026-09-14. Anthropic bills the
  server-side web search tool at **$10 per 1,000 searches** on top of tokens, and
  until this change `api_usage` recorded only tokens, so research, decision-makers
  and check-updates all under-reported. One measured run (check-updates,
  California) recorded $0.26 against a real ~$0.35.

  What shipped:
  - `api_usage.web_search_requests integer` — **nullable on purpose**: NULL means
    "not recorded" (every earlier row, and CELord's direct inserts). Migration
    `packages/db/migrations/2026-09-14_api_usage_web_search_requests.sql`.
  - `WEB_SEARCH_COST_PER_REQUEST` next to `PRICING` in `lib/utils.ts`;
    `calculateCost` takes the count (defaults to 0 so CELord's token-only calls
    are unchanged).
  - `logUsage` **requires** `webSearchRequests`, so a new search route that forgets
    it is a type error, not a silently low bill. Non-search routes pass `0`.
  - `logUsage` now logs a failed insert instead of swallowing it — a lost row also
    dropped out of `checkDailyLimit`.
  - The A/B harness reports cost as tokens + searches and keeps a token-only
    figure, so runs stay comparable to pre-2026-09-14 baselines.
  - Tests: `lib/utils.test.ts` (pricing) and `lib/api-usage.test.ts` (the row written).

  Still open:
  - **CELord's web search is unrecorded.** `packages/signals/src/enrichment.ts` can
    run web search, and `app/api/celord/enrich` / `celord/admin/trigger` insert
    into `api_usage` directly with token-only `calculateCost`. It is CELord's code,
    so it was left for a CELord change: pass the count and write the column.
  - Historical `cost_usd` stays token-only — there are no counts to backfill from.
  - Re-check `COST_HINTS` once research and decision-makers search counts appear
    in the logs.

  Related latent trap: `CACHE_WRITE_MULTIPLIER` is 1.25x, correct for the 5-minute
  cache in use. The **1-hour** cache write is **2x** — if anyone sets `ttl: '1h'`,
  that multiplier is silently wrong. Now noted in `lib/utils.ts`.

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
