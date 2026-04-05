# SalesLord — Backlog

Items are roughly priority-ordered within each section.

## 🔴 Must have (core product not usable without these)

- [x] Complete setup page (background, voice samples, ICP, products) — unlocks research
- [x] Run first real prospect research end-to-end and verify summary page
- [x] Email draft panel — "Draft email →" button, subject + body, slop detection badge, copy button
- [ ] `/api/follow-up` route — gated by reason >= 10 words, reads full note history, logs api_usage
- [ ] Follow-up panel UI — reason input (word count gate), generated output, slop detection badge

## 🟡 Should have (product is awkward without these)

- [ ] **BYOK — bring your own Anthropic API key** — store encrypted on rep_profiles, use per-user key for all calls; fall back to platform key if not set; input + save in setup page
- [ ] `/api/refresh` route — re-research single prospect, diff logic, never overwrites timing, logs api_usage
- [ ] Re-research button wired in topbar → `/api/refresh`
- [ ] `/api/cron/refresh-all` route — weekly refresh for all users, Resend digest
- [ ] Vercel cron wired (`vercel.json` already has the schedule)
- [ ] Product selector in "Add prospect" flow — when multiple products exist, let rep pick which to research against

## 🟢 Nice to have (quality of life)

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

- [ ] Admin UI to add/remove emails from `allowed_emails` table (currently requires direct Supabase access)
- [ ] Admin UI to promote/demote other reps to admin (currently requires direct SQL)
- [ ] Per-user usage dashboard — table of costs by day/endpoint
- [ ] Option to switch from allowlist to domain-restriction (one `if` change in `proxy.ts`)

## 🔧 Infrastructure

- [ ] Error boundaries for failed data fetches (prospect page currently has no error state)
- [ ] 429 rate-limit UI feedback — currently toast shows raw error string; could be friendlier
- [ ] Vercel deployment configured with all env vars
