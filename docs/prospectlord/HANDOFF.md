# ProspectLord — Handoff

## Current version: v1.10.0 — web search in the cost ledger; priced, colour-coded actions

---

## Session 16 (2026-09-14) — web search in the cost ledger; every research action states its price

Four commits, plus one migration run on production Supabase before any of the
code touched a database.

### What shipped

1. **`feat(costs)` — web search is billed in `api_usage`.** Anthropic charges $10
   per 1,000 searches on top of tokens, and nothing recorded it, so every search
   route under-reported.
   - `api_usage.web_search_requests` — nullable on purpose: NULL means "not
     recorded" (every earlier row, and CELord's direct inserts). Migration
     `packages/db/migrations/2026-09-14_api_usage_web_search_requests.sql`,
     **already run on production**.
   - `calculateCost` adds `WEB_SEARCH_COST_PER_REQUEST`. `logUsage` **requires**
     the count and the four non-search routes pass 0, so a new search route that
     forgets it is a type error, not a silently low bill.
   - `logUsage` now logs a failed insert instead of swallowing it — a lost row also
     disappeared from `checkDailyLimit`.
   - The A/B harness reports `costUsd` (tokens + searches) and `tokenCostUsd`.
     **Compare runs against the 2026-09-11 baseline using `tokenCostUsd`**, or the
     searches finally being counted will look like a regression.
   - Tests 12 → 22: `lib/utils.test.ts` (pricing) and `lib/api-usage.test.ts`
     (the row written, via a stub client).
2. **`feat(ui)` — Check for Updates and Refresh company state their price.** Both
   take two clicks, and the confirm step floats the price beneath the button
   (`components/prospect/CostConfirmHint.tsx`). Check for Updates used to fire on
   a single click with no price anywhere. New `COST_HINTS.checkUpdates`.
3. **`feat(ui)` — topbar actions coloured by what they do**, defined once in
   `lib/action-styles.ts`: research blue, writing purple, free utilities neutral,
   confirm amber. Regrouped as utilities | research | writing with hairline
   dividers. Refresh company and Archive had been `--sl-text3`, about 2.7:1 on
   white; every pairing now clears 4.5:1.
4. **`feat(ui)` — Find Decision Makers matches.** Blue throughout. The price is a
   visible caption where the button sits in the card body (invite, retry) and a
   confirm step where it sits in the section header (refresh). New i18n key
   `DecisionMakers.confirmRefresh` in all six locales.

### Verified live — localhost, California

check-updates returned `200 in 32.4s` with 0 continuations and **8 web searches
(+$0.08)**, no `[logUsage]` insert error, and a sidebar job cost of **$0.31**. The
token cost was therefore about $0.23, and searches were ~26% of the real charge —
the second measurement of the gap, after 9 searches on 2026-09-13. The confirm
steps on Refresh company and on the decision-makers Refresh were exercised and
cancelled; no research or decision-makers call ran.

### Hard-won lessons

1. **Run a migration before exercising the code that writes it — on localhost
   too.** Local dev writes to the same Supabase project, and an insert that names a
   missing column fails. `logUsage` now surfaces that; before this session it
   vanished silently and took the runaway-guard count with it.
2. **A floating hint needs room, and `overflow-hidden` cards do not give it.** The
   decision-makers retry button sits at the foot of a clipped card. That is why
   placement, not preference, decides caption versus confirm step.
3. **Colour needs one source.** The topbar drifted into three text colours because
   six buttons each carried an inline copy. New action buttons take their style
   from `lib/action-styles.ts`.

---

## Session 15 (2026-09-11 → 13) — the three search routes run on `runSearchLoop`

The top-priority item from Session 14. Four commits, one variable each.

### What shipped

1. **`refactor(search)` — the routes call the shared loop.** `research`,
   `decision-makers` and `check-updates` each inlined a copy of the `pause_turn`
   loop. All three now call `runSearchLoop` with their own parameters verbatim
   (6/4/4 continuations, their own deadlines, `max_tokens` 4096/4096/1024), so the
   request body sent to Anthropic is byte-identical to before. `research` keeps its
   own try/catch, so a first-call failure is still a 504 with "your existing brief
   is unchanged". `decision-makers` and `check-updates` gain the
   continuation-failure handling research already had — a timeout on continuation 2
   used to throw away the searches already paid for.
2. **`fix(search)` — every route composes findings from every turn.** Two routes
   read only the final assistant turn, which silently discarded earlier findings
   whenever a run was cut short. `findingsFromFinalTurn` is deleted. At zero
   continuations the two compositions are byte-identical (now asserted by a test),
   which is why this change needed no measured run of its own.
3. **`feat(search)` — telemetry.** Each route logs
   `[route] search loop: N continuation(s), M web search(es) (~$X not in api_usage)`.
4. **`fix(costs)` — recalibrated `COST_HINTS`.** Research and decision makers now
   quote `$0.40–$0.65`. Decision makers had been quoted `$0.10–$0.25` — about half
   its measured token cost alone, before any search charges.

### Measured — live routes, not the harness

| route (California) | code | env | time | cost (api_usage) |
|---|---|---|---|---|
| research | new | localhost | 2:34 | $0.42 |
| decision-makers | old | **production** | 1:43 | $0.30 |
| decision-makers | new | localhost | 2:49 | $0.33 |
| check-updates | new | localhost | 44s | $0.26 |

A full California brief on the new code is **$0.75**, against the 2026-09-11
baseline band of **$0.72–$0.76**. The one controlled comparison — decision makers,
same prospect, same stored brief, old code vs new — moved +10%, inside the 12%
spread the baseline's own two stage-2 runs showed. Localhost wall times are not
comparable to the harness baseline: `next dev` on Turbopack, `proxy.ts` on every
request, and Supabase round trips the harness never makes.

check-updates logged **0 continuations and 9 web searches** — $0.09 the ledger never
saw on top of the $0.26 it did record, so the real charge was ~35% higher than
`api_usage` shows. That is the first measured size of the web-search gap. No live run has ever
reached `pause_turn`; every real brief now adds evidence for free instead of
costing ~$0.75 to hunt for.

### Hard-won lessons

1. **The A/B harness does not execute route handlers.** `scripts/ab-research.ts`
   imports `runSearchLoop`, the prompts and `generateStructured` and reimplements
   each stage. It cannot catch a route-wiring failure, and a harness run after a
   route-only change reproduces the baseline by construction. Route changes need a
   live run through the app.
2. **`api_usage` under-reports every search route.** Web search is billed at $10
   per 1,000 searches on top of tokens, and nothing read
   `usage.server_tool_use.web_search_requests`. The token pricing and cache
   multipliers were audited against published rates and are correct — the total is
   incomplete. Now logged, not yet billed; see BACKLOG.md.
3. **Local Google sign-in needed `http://localhost:3000/**` in Supabase →
   Authentication → URL Configuration → Redirect URLs.** Without it Supabase
   silently fell back to Site URL and bounced sign-in to production. Fixed in the
   dashboard. The magic link still always lands on production — see priorities.
4. **`next build` leaves production output in `apps/web/.next`, and a later
   `next dev` then 404s on page routes** (`/login`, `/auth/callback`) while
   `proxy.ts` keeps redirecting to them. Clear `.next` after any build before
   starting dev.
5. **Check which browser and which origin a run actually hit.** The in-app Browser
   pane and Chrome keep separate cookies, and a production tab will happily run a
   brief against the shared Supabase project. Stage 2 went to production once by
   accident. Confirm `POST /api/<route>` appears in the dev log before trusting a
   number.

---

## Session 14b (2026-09-11) — the v1.8.0 deploy failed; a v1.7.3 break surfaced

`Can't resolve 'shadcn/tailwind.css'`. **Not caused by the SDK upgrade** — it was
dormant since v1.7.3 and the v1.8.0 deploy is simply what exposed it.

`apps/web/app/globals.css` line 3 imported `shadcn/tailwind.css`. v1.7.3 removed
`shadcn` from dependencies as "zero imports" — correct about the CLI, wrong about
the CSS, because a `@import` in a stylesheet is not something an import scan
finds. It kept building anyway: Vercel restores a build cache between deploys, and
that cache still held the pruned package. The v1.8.0 install finally pruned it
(`Packages: +4 -232` in the log) and the build broke.

Fixed by vendoring the 95 lines into `globals.css` — the canonical shadcn +
Tailwind v4 setup, and it keeps the CLI out of `dependencies` as root `CLAUDE.md`
requires. `data-open`, `data-closed` and `data-disabled` are in live use in
`components/`, so deleting the import instead would have broken styling silently.

### Hard-won lesson: a local build is NOT a clean build

**`pnpm install` does not prune packages dropped from the lockfile.** `shadcn@4.6.0`
sat in `node_modules` for the entire v1.7.3 → v1.8.0 window, so every local build
resolved the import and passed. Vercel installs clean, so it did not.

This is a second way to ship a green build that breaks in production, alongside
the typecheck problem already recorded below. Before trusting a build that touches
dependencies:

```bash
rm -rf node_modules apps/web/node_modules apps/web/.next && pnpm install
pnpm --filter @saleslord/web build
```

The v1.8.0 build was reported green off a warm Turbopack cache with a stale
`node_modules`. It proved nothing.

---

## Session 14 (2026-09-11) — SDK 0.81 → 0.125, with a real safety net

The top-priority item from Session 13, done in the order that session asked for:
build the measurement first, re-baseline, then upgrade.

### What shipped

**Step 1 — the harness measures the two stages separately** (`apps/web/scripts/ab-research.ts`)

It had still been running the pre-v1.7.0 combined flow, so there was no
post-split baseline and `MODEL-UPGRADES.md` described a protocol that could not
be run. It now times and prices stage 1 (`/api/research`) and stage 2
(`/api/decision-makers`) independently.

- Stage 2 grounds on stage 1's in-memory brief when both run, or on the stored
  brief with `--stages 2`. The grounding mapping mirrors the row
  `research/route.ts` writes, so both paths ground identically.
- Calls the real `generateStructured`, the real prompts, the real budgets. The
  old harness omitted the `languageDirective` + `JSON_LANGUAGE_RULE` suffix both
  routes append — it was measuring a prompt production never sends.
- Mirrors each route's findings handling rather than correcting it: stage 1
  accumulates across every assistant turn, stage 2 reads the final turn only.

  > **Corrected by Session 15:** the split it was mirroring was a bug, not
  > intent. Both stages now compose from every assistant turn, in the routes
  > and in the harness alike, and `findingsFromFinalTurn` is gone.
- Default `--configs` is now `a` alone. It was `a,b,c,d`, so a bare invocation
  spent on three Sonnet 5 runs nobody asked for.
- Still writes nothing to the database; still confirms before spending.

**Step 2/3 — re-baselined, upgraded, re-ran.** Numbers and caveats are in
[`MODEL-UPGRADES.md`](MODEL-UPGRADES.md) under the 2026-09-11 baseline record.
Cost −3.2%, wall time +1.9%, both inside run-to-run spread. `packages/signals`
pinned `^0.81.0` too and was bumped with it — bumping only `apps/web` would have
installed two copies of the SDK.

### What this measurement corrected

**A complete brief costs ~$0.75, not ~$0.34.** The v1.7.3 figures (133.8s /
$0.3407 and 125.2s / $0.2853) match stage 1 alone almost exactly. Stage 2 costs
roughly the same as stage 1 — it reads a large cached prefix and searches just
as hard. Still inside the $0.50–$1.00 budget, but at the top of it, not the
bottom. This is exactly what a combined number was hiding.

### The `pause_turn` loop — what the live runs missed, and what covers it now

Every stage on all four runs made exactly **one** search call. The server-side
search finished inside a single API call and never returned `pause_turn`, so the
continuation loop never executed. Four live runs, ~$3 spent, zero coverage of
the most fragile code in the app.

**This is not a regression, and the drop from the 2026-09-08 record's six
continuations is mostly explained.** That run was the pre-split monolith — one
prompt doing company research, news, decision makers *and* the email draft.
Stage 1 today does company, news and fit only. Roughly half the work in the same
call, so finishing in one pass is the expected outcome. The prompt also changed
between those dates. Nothing here needs investigating.

What it left was a coverage gap, now closed two ways:

1. **The API contract is verified.** `StopReason` carries `pause_turn`
   identically in 0.81 and 0.125 — 0.125 only *adds*
   `model_context_window_exceeded` (benign for us: both loops treat any
   non-`pause_turn` reason as "done" and compose from findings so far).
2. **The loop logic is tested offline.** `lib/web-search.test.ts` — 11 cases via
   a stub client: continuation, message accumulation, `MAX_CONTINUATIONS`, the
   wall-clock deadline, partial findings kept when a continuation throws, first
   call propagating, `cache_control` on every call. Free, deterministic, and it
   runs on every future SDK bump instead of costing $3 and proving nothing.

```bash
pnpm --filter @saleslord/web test
```

**Do not go hunting for a prospect heavy enough to trigger `pause_turn`.** The
ceiling is undocumented and search volume varies per company, so it is guesswork
at ~$0.75 a run. The one thing still uncovered is narrow — whether a *live*
`pause_turn` response body has the content shape we append — and it is worth a
single targeted run if one ever turns up naturally, not a search.

**The routes still inline their own copies of the loop.** `runSearchLoop` in
`lib/web-search.ts` is the shared, tested version, currently used only by the
harness. Migrating `research`, `decision-makers` and `check-updates` onto it is
the natural follow-up — it would delete three copies, fix the findings-accumulation
split below, and put the tested code on the production path. It touches the AI
path, so it needs its own measured harness run.

---

## Session 13 (2026-09-10) — review pass: correctness, staging, cost control

A full review pass. The through-line: **the app should not lie to the rep, and
nothing expensive should happen without them asking.**

### What shipped

**v1.5.0 — usage accounting**
- `lib/api-usage.ts` is now the single owner of the runaway guard and the cost
  ledger. They used to be the same counter, which meant cheap Haiku calls ate
  the same budget as a $0.40 research run. `METERED_ENDPOINTS` lists what
  counts; email/pitch-opener/resolve write to the ledger but do not meter.
  **Never hand-roll the check** — see root `CLAUDE.md`.
- `calculateCost` was silently returning 0 for dated model ids
  (`claude-haiku-4-5-20251001`). `normalizeModelId` strips the `-YYYYMMDD`
  suffix. Cache read/write multipliers (0.10x / 1.25x) are applied.
- Teammates get a login link emailed when they are allowlisted — via Supabase
  Auth (`inviteUserByEmail`, falling back to `signInWithOtp` for users who
  already exist). No Resend, no transactional provider.

**v1.6.0 — targeting tiers + prompt caching**
- Decision makers surface a targeting tier; `sortByTier` and the tier palette
  live in `lib/utils.ts`.
- The web-search prompt prefix is cached (`cache_control: ephemeral`).

**v1.7.0 — staged research** (the important one)
- `POST /api/research` is now **stage 1 only**: company, news, fit. It no
  longer writes decision makers or drafts an email.
- `POST /api/decision-makers` is **stage 2**, triggered by the rep from the
  brief. It uses `loadProspectContext`, which gives the "no brief yet" 404 for
  free, and stamps `dm_researched_at` even when it finds nobody.
- The UI never shows an empty section. An unrun stage renders an invitation
  (button + what it does + roughly what it costs). "No named individuals found
  publicly" is rendered as a correct answer, not a failure.
- This is now a **product principle** in root `CLAUDE.md` — read it before
  adding any generative feature.

**v1.7.1 — staleness**
- Brief age shows in the sidebar next to every prospect (`3d`, `6w`, `4mo`;
  amber past 30 days) and on the brief itself.
- Research and update-check timestamps were split, because a fresh brief was
  making month-old update blurbs look current. The migration reads
  `prospect_briefs.created_at` rather than defaulting to `now()` — defaulting
  would have made every existing brief look freshly researched, which is the
  dangerous direction to err in.

**v1.7.2 — UX friction**
- Toast lifetimes use `LONG_ACTION_TOAST_MS` (300s, the Vercel ceiling), so a
  toast cannot expire while its request is still running.
- `lib/use-escape-key.ts`; Escape closes every modal.
- Home renders an empty state instead of redirecting to `/setup`. The old
  redirect dropped a fully configured rep who had archived everything into a
  settings form with nothing to do.
- Sidebar search forces archived matches open and counts matches.

**v1.7.3 — docs and dead deps**
- Root `CLAUDE.md` and `.env.local.example` corrected: no Resend, no Stripe,
  TerritoryLord is built-but-being-restarted.
- Removed `stripe` (zero imports) and `shadcn` (a scaffolding CLI that was
  sitting in production `dependencies`). Add components with
  `pnpm dlx shadcn@latest add <name>`.

### Migrations — all three are already run on production

- `2026-09-08_allowed_emails_format.sql`
- `2026-09-09_staged_research.sql`
- `2026-09-10_split_staleness_timestamps.sql`

### Measured behaviour

Two end-to-end harness runs after the split: **133.8s / $0.3407** and
**125.2s / $0.2853**. Jon's stated budget is **$0.50–1.00 per brief and 5–10
minutes**, so there is real headroom. Confirmed working on net-new accounts for
both create-brief and find-decision-makers.

> **Corrected by Session 14:** these are **stage 1 only**. The harness was still
> running the pre-split combined flow, and stage 2 costs about as much again — a
> complete brief is ~$0.75. The headroom is real but roughly half what this says.

### Hard-won lessons — read these before changing the research loop

1. **Change one variable at a time.** Phase 0 changed the search tool
   (`web_search_20250305` to `web_search_20260209`), added `max_uses: 15`, and
   rewrote the prompt to demand exhaustive search — all at once. Result: a
   15.2-minute call that returned a 500. The revert kept only the accuracy
   rules, which cost no search volume. `MODEL-UPGRADES.md` records this.
2. **Two guards, not one.** A per-call timeout bounds one call
   (`ANTHROPIC_TIMEOUT_MS`); a wall-clock deadline bounds the route
   (`*_DEADLINE_MS`). Both live in `lib/web-search.ts`. A production refresh
   failed at exactly 3:03 — 90s timeout + 90s retry + setup — which is why
   retries are now **0** and the first search call is wrapped to return 504.
3. **One source, judged by authority — not two sources.** The failure mode is
   zero sources, not one. Requiring two does not stop fabrication; it discards
   singly-sourced truths.
4. **More fields filled is not better.** A `$61B revenue` figure on a state
   government is the appropriations budget wearing the wrong label. The prompt
   prefers `null`, and public-sector stats say `N/A — state government`.
5. **The A/B harness only measures what it runs.** A Sonnet 5 comparison was
   invalidated because both Sonnet 5 configs ran with thinking disabled and
   effort `medium` against defaults of enabled / `high`. Check the config
   before trusting the numbers.

---

## Top priority for the next session

### 1. Remaining cost and pricing follow-ups

- **Magic-link redirect** — `app/api/auth/magic-link/route.ts` builds
  `emailRedirectTo` from `NEXT_PUBLIC_APP_URL`, so local magic-link sign-in always
  lands on production. Derive the origin from the request, but check it against an
  allowlist: trusting a spoofed `Host` header would send a live auth code to
  someone else's domain. The two admin-invite call sites should stay on
  `NEXT_PUBLIC_APP_URL` — an invite belongs on production.
- **CELord's web search is unrecorded** — its enrichment can search, and its routes
  insert `api_usage` rows directly with token-only costs. A CELord change.
- **Re-check `COST_HINTS`** once research and decision-makers search counts appear
  in the `[route] search loop` log lines. Only check-updates has been measured
  (9 and 8 searches).
- **Cost hints are English-only** in a six-locale app. BACKLOG.md.
- Separately queued: the purchasing-power metric that replaces the fixed revenue
  stat. Prompt + schema change on the AI path — own branch, own measured run.
  BACKLOG.md.

### 2. Then the model evaluation

Sonnet 5 and Opus 5 against the re-baselined numbers, and a separate test of
`web_search_20260209` **alone** — it was never evaluated on its own merits,
only as one of three simultaneous changes. Protocol:
[`MODEL-UPGRADES.md`](MODEL-UPGRADES.md).

### 3. Other dependency upgrades

`next` 16.2.2→16.3.4, `react`/`react-dom` 19.2.4→19.3.0, `lucide-react`
1.14→1.44, `@supabase/ssr` 0.10→0.12, `next-intl` 4.13→4.14. Majors that need
their own look: `pdf-to-img` 5→7, `eslint` 9→10.

Also: `react-simple-maps@3` declares peers of React 16/17/18 and is installed
against React 19. It works today, but it is unmaintained against this React —
and it is only used by TerritoryLord, which is being restarted anyway.

---

## Known cleanups (none urgent, all verified present at v1.8.0)

- **4 copies of `SCard`** — `CaseStudySection.tsx`, `ProspectLog.tsx`,
  `RightColumn.tsx`, `prospects/[id]/page.tsx`. Three share a signature; the
  `ProspectLog` one adds `meta`. Extract one component with an optional `meta`.
- **`check-updates` hand-rolls `loadProspectContext`** — it fetches prospect,
  briefs and rep profile itself (route lines ~107-110). Switching it would
  delete code and pick up the ownership 404 for free.
- **Structured-output schema is declared but not enforced** — `emit_result`
  guarantees valid JSON, not correctly *shaped* JSON.
- **Serialized auth round-trips** — `proxy.ts` authenticates, then
  `(gated)/layout.tsx` calls `getUser()` and counts products, then the page
  calls `getUser()` again. Parallelize or pass the user down.
- **`JobsSection` polls forever** — every 20s even when it renders nothing
  (it returns `null` at zero jobs, but the interval keeps running).
- **i18n gap: 16 of 23 `components/prospect/*` are hardcoded English** —
  `AddProspectInput`, `ArchiveButton`, `BriefPdf`, `CaseStudySection`,
  `CaseStudySlideModal`, `CheckUpdatesButton`, `DecisionMakers`, `NewsCard`,
  `OrgDisambiguationDialog`, `ProspectLog`, `RebuildBriefButton`,
  `ReresearchButton`, `RightColumn`, `StatCards`, `TimingBar`, `UpdateBlurbs`.
  The infrastructure is there (next-intl, 6 locales) — these were never converted.

## Backlog items raised this session

- **Bulk decision-maker refresh** — the database holds briefs from before the
  split, with no decision makers. A script could backfill stage 2 across them.
- **ZoomInfo** — wire real contact data into stage 2 someday.
- **Admin UI for `rep_profiles.daily_call_limit`** — currently a manual SQL edit.

## Backlog items raised in Session 14

- **`decision-makers` and `check-updates` drop earlier findings.** Both compose
  the emit call from `response.content` — the **final** assistant turn only
  (`decision-makers/route.ts:155`, `check-updates/route.ts:255`). `research`
  accumulates across every turn (`research/route.ts:186`). When a continuation is
  cut short by the deadline, those two throw away everything gathered before it.
  Pre-existing at v1.7.3; left alone during the SDK upgrade to keep one variable
  moving at a time. Fix it together with the `pause_turn` investigation above —
  the two are the same code path, and neither can be verified without a prospect
  that actually continues.
- **`packages/signals/src/enrichment.ts:175` loops on the wrong stop reason.**
  It declares `web_search_20250305` — a server-side tool — then loops on
  `stop_reason === 'tool_use'`, which a server-side tool never returns. The whole
  continuation block is dead code, and the `tool_result` blocks it builds read
  `(b as any).output`, a field that does not exist on a `tool_use` block. Effect
  today is mild (enrichment gets one search pass instead of up to three, which
  may be fine for "confirm an HQ") but it is not doing what it says. CELord's
  path, so it needs its own change.
- **`toBriefRow` duplication.** The harness derives stage 2's grounding from a
  parsed stage 1 brief by repeating the mapping in `research/route.ts` step 8.
  That mapping is the stage 1 → stage 2 contract and should live in one place.

---

## Session 12.3 (always-on structured output — remove text parsing)

The v1.4.1/v1.4.2 work left a "usually parse text, sometimes fall back to tool use"
split. Made structured output the **only** path, so there's one consistent, robust
mechanism and no fragile text parsing anywhere.

- `lib/structured-output.ts` → `generateStructured()` — forces an `emit_result` tool
  call and returns the tool input (valid JSON by construction) + token usage.
- **Single-call routes** (refresh-email, pitch-opener, case-studies/match): call it
  directly — one call, always valid.
- **Web-search routes** (research, check-updates): unchanged `web_search` loop, then a
  second `generateStructured` call over the model's own findings (you can't force a tool
  and let it search in the same call). Costs one extra call per run vs. the old happy
  path — accepted for the guarantee + consistency; folded into `api_usage`.
- Removed `extractJsonObject` (lib/utils.ts) and `reEmitAsStructuredJson` — no more text
  parsing. Trimmed `JSON_LANGUAGE_RULE` to just the keys/enums-English scoping (validity
  is now the API's job, not the prompt's). No schema change.

---

## Session 12.2 hotfix (non-English JSON — structured-output fallback)

**v1.4.1 was not enough.** The Vercel log showed the model prefixing Portuguese prose
+ a ```json fence (which `extractJsonObject` handles), but the object itself was
**invalid JSON deeper down** — an unescaped `"`/newline inside a translated string
value. No amount of string-slicing fixes text the model wrote wrong.

**Canonical fix:** stop relying on the model hand-writing valid JSON as text. When the
fast text-parse fails, force the model to re-emit its own answer via **tool use**
(`lib/structured-output.ts` → `reEmitAsStructuredJson`): a forced `emit_json` tool call
whose input the API serializes as JSON, so the result is **guaranteed valid** in any
language. It runs ONLY on parse failure, so the happy path (English, and well-formed
non-English) costs nothing extra; the fallback adds one cheap call and its tokens are
folded into `api_usage`.

Wired into all five generation routes (research, check-updates, case-studies/match,
refresh-email, pitch-opener). `extractJsonObject` (v1.4.1) stays as the fast path. No
schema change.

---

## Session 12.1 hotfix (non-English JSON parse failure)

**Symptom:** with a non-English `profile.locale`, research/email/pitch generation ran
(burned credits) then failed with "Failed to parse AI response".

**Cause:** the language directive ("Write all output in X. This applies to every part
of your response.") induced the model to wrap the JSON in translated commentary. The
naive `text.slice(indexOf('{'), lastIndexOf('}'))` parser then grabbed a `}` from a
trailing translated remark, producing invalid JSON. English output had obeyed the
"no trailing text" instruction, so it only surfaced once generation went multi-language.

**Fix:**
- `extractJsonObject()` in `lib/utils.ts` — returns the first **complete, balanced**
  JSON object (string/escape-aware), tolerating leading/trailing prose (incl. braces)
  and fences in any language. Now used by research, check-updates, case-studies/match,
  refresh-email, pitch-opener (replaces the slice in each).
- `JSON_LANGUAGE_RULE` (in `lib/i18n/languages.ts`) strengthened: output only the JSON
  object with no commentary in any language; keep keys + fixed enum/code values English;
  translate only free-text values; escape inner quotes. Now also applied to refresh-email
  and pitch-opener (previously only the rep-facing JSON routes had it).
- Verified `extractJsonObject` with a unit test covering the trailing-prose-with-brace
  case. No schema change.

---

## Session 12 summary (i18n / multi-language)

### What was built

ProspectLord is now multi-language, **profile-driven** (no URL-based locale routing).
Two stored values drive everything: `rep_profiles.locale` (chrome + default generation
language) and `prospects.output_language_override` (sticky per-prospect, emails/pitches
only). Language is chosen by **audience** — rep-facing content always follows the
profile; prospect-facing content is overridable per generation and sticks to the
prospect. Six languages: en-US, en-GB, es, pt-BR, fr, de. See the
**Internationalization** section in `docs/prospectlord/CLAUDE.md` for the durable design.

### Files created / modified

| File | Change |
|---|---|
| `packages/db/migrations/2026-06-25_i18n.sql` | **New** — `rep_profiles.locale` (default `en-US`), `prospects.output_language_override` (nullable) |
| `packages/db/schema.sql` | Mirrored both columns into the source of truth |
| `apps/web/lib/i18n/languages.ts` | **New** — single source of truth: the 6, helpers, `languageDirective`, `JSON_LANGUAGE_RULE`, `resolveProspectLanguage`, `PROFILE_DEFAULT` |
| `apps/web/i18n/request.ts` | **New** — next-intl request config; reads `NEXT_LOCALE` cookie, deep-merges en-US fallback |
| `apps/web/next.config.ts` | Wrapped with `createNextIntlPlugin()` |
| `apps/web/app/layout.tsx` | `NextIntlClientProvider` at root; `<html lang>` from `getLocale()` |
| `apps/web/messages/{en-US,en-GB,es,pt-BR,fr,de}.json` | **New** — chrome catalogs (en-US base, all 6 authored) |
| `apps/web/scripts/translate-catalog.ts` | **New** — author-time catalog translation (for new locales / regen) |
| `apps/web/app/api/profile/locale/route.ts` | **New** — writes `rep_profiles.locale` + sets `NEXT_LOCALE` cookie |
| `apps/web/proxy.ts` | One-time `NEXT_LOCALE` cookie backfill for pre-i18n sessions |
| `apps/web/app/api/{research,check-updates,case-studies/match}/route.ts` | Append `languageDirective(profile.locale)` + `JSON_LANGUAGE_RULE` (rep-facing) |
| `apps/web/app/api/{refresh-email,pitch-opener}/route.ts` | Resolve language by audience + sticky write-back of the override |
| `apps/web/components/prospect/{EmailDraftButton,PitchOpenerButton}.tsx` | Language dropdown (6 + Profile default), pre-select override, send `languageSelection` |
| `apps/web/app/(app)/setup/{page,SetupForm}.tsx` | Locale selector (saves via the new route + `router.refresh()`); chrome strings extracted |
| `apps/web/app/login/page.tsx`, `app/access-denied/page.tsx`, `components/prospect/{Sidebar,JobsSection}.tsx`, `app/(app)/(gated)/prospects/[id]/page.tsx` | Chrome strings extracted to catalogs; cost displays use next-intl currency formatting |
| `apps/web/lib/types.ts` | `RepProfile.locale`, `Prospect.output_language_override` |

### Architecture decisions

- **Cookie mirrors the profile** — chrome locale reads `NEXT_LOCALE`, kept in lockstep
  with `rep_profiles.locale` by the locale route (+ a one-time proxy backfill). Avoids a
  Supabase hit per render across every route.
- **Deep-merge en-US fallback** in `i18n/request.ts` — partial/untranslated catalogs
  never blank the UI.
- **One source of truth** (`lib/i18n/languages.ts`) for the list, the directive, and the
  sentinel — the /setup selector, compose dropdowns, and prompts never hardcode their own.
- **JSON keys stay English** in structured prompts (`JSON_LANGUAGE_RULE`) — verified the
  research brief and case-study matcher still parse.
- **Chrome extraction scoped** to the high-visibility surfaces this session; remaining
  brief sub-components fall back to en-US (backlog: extraction sweep).

### ⚠️ Required after merge

1. Run `packages/db/migrations/2026-06-25_i18n.sql` in prod Supabase (same pattern as prior migrations).
2. Tag **v1.4.0** and bump the "Current version" line in the **root** `CLAUDE.md` in the same change.
3. Optional: have the Brazilian teammate review `messages/pt-BR.json`; regenerate any locale with `npx tsx scripts/translate-catalog.ts <code>`.

---

## Session 11 summary (Per-User Products + Mandatory Product Gate)

### What was built

Products moved from a shared admin-managed table to per-user ownership. Each rep now creates and manages their own products on the `/setup` page — reps selling different things can share the platform, and a rep can redefine their products when they change companies. Creating at least one product is mandatory: all ProspectLord pages redirect to `/setup` until the user has one.

### Files created / modified

| File | Change |
|---|---|
| `packages/db/schema.sql` | `products` rebuilt per-user: `user_id` column (not null), `created_by` dropped, admin RLS policies replaced with `Users manage own products`, index now `(user_id, created_at)` |
| `packages/db/migrations/2026-06-10_products_per_user.sql` | **New** — copies every shared product to every existing user, deletes shared rows, swaps policies/index |
| `lib/types.ts` | `Product`: `created_by` → `user_id` |
| `app/(app)/(gated)/layout.tsx` | **New** — mandatory-product gate; redirects to `/setup` when user has zero products |
| `app/(app)/(gated)/` | `page.tsx`, `prospects/`, `admin/` moved into the gated group (URLs unchanged) |
| `app/(app)/admin/products/` | **Deleted** — admin product management gone |
| `app/(app)/setup/ProductsManager.tsx` | **New** — per-user product CRUD (ported from AdminProductsClient); add form auto-opens at zero products; `router.refresh()` after add/delete so the gate updates |
| `app/(app)/setup/SetupForm.tsx` | Products now the first section, editable by everyone, outside the profile `<form>`; amber onboarding banner at zero products |
| `app/(app)/setup/page.tsx` | Products fetch scoped `.eq('user_id', user.id)`; passes `userId` to form |
| `app/api/research/route.ts` | Products fetch scoped to user; empty-products error no longer says "ask your admin" |
| `app/api/refresh-email/route.ts` | Products fetch scoped to user |
| `app/api/check-updates/route.ts` | Products fetch scoped to user |
| `components/prospect/Sidebar.tsx` | "Manage products →" admin link removed |
| `package.json` | Added `packageManager` field — required by turbo 2.9 to resolve workspaces |

### Architecture decisions

- **Migration copies products to every user** — nobody loses working state; each rep then edits their copies independently. Original shared rows are deleted.
- **`created_by` dropped** — redundant once `user_id` is the owner. Admin role now governs only case studies, team config, and invites.
- **Gate is a nested route group `(app)/(gated)/`** — canonical App Router pattern; layouts can't read the pathname, so exclusion of `/setup` is structural (it sits outside the group), not conditional. URLs are unchanged.
- **Gate counts via the user's RLS client** — head-only count query, no admin client in a layout.
- **API routes keep the admin client but add explicit `.eq('user_id', user.id)`** — client-side fetches (setup page, prospect page product selector) are auto-scoped by the new RLS policy.
- **Products section rendered outside the profile `<form>`** — pressing Enter in a product field must not submit the profile form; product saves are independent Supabase writes.

### ⚠️ Required migration

`packages/db/migrations/2026-06-10_products_per_user.sql` — **already run in prod Supabase** (2026-06-10). Fresh environments get the new shape from `schema.sql` directly.

---

## Session 10 summary (Org Disambiguation + Cost Transparency)

### What was built

Two-phase prospect add flow. Instead of firing the expensive Sonnet research call directly on raw user input, a cheap Haiku resolve call first identifies 1–4 candidate organizations, applies a territory confidence boost, and surfaces a confirmation dialog. The user always confirms before research fires. A cost transparency design principle was codified — dialogs at natural workflow pause points show a plain-language cost estimate.

### Files created / modified

| File | Change |
|---|---|
| `lib/types.ts` | Added `OrgCandidate` type (name, hq_region, hq_display, description, disambiguated_query, confidence) |
| `lib/costs.ts` | **New** — `COST_HINTS` constants: plain-language cost ranges per BYOK endpoint |
| `app/api/resolve/route.ts` | **New** — POST; Haiku call returning 1–4 candidates with confidence scores; territory boost (+0.15) applied server-side; sorted descending before return |
| `components/prospect/OrgDisambiguationDialog.tsx` | **New** — confirmation dialog; adapts header for 1 vs multiple results; cost hint in footer; "Search anyway" text link as escape hatch |
| `components/prospect/AddProspectInput.tsx` | Updated — calls `/api/resolve` first, always shows dialog, passes `disambiguated_query` to research; falls through to research directly if resolve errors |

### Architecture decisions

- **Always show the dialog** — even for unambiguous single matches. Research is expensive ($0.10–$0.40) and slow; the confirmation step is worth the friction.
- **Haiku for resolve, Sonnet for research** — resolve is a lightweight identification task. Haiku is accurate enough and costs ~$0.0005 per call. Not counted against the daily rate limit; not logged to `api_usage`.
- **Territory confidence boost, not hard filter** — territory matches get +0.15 on confidence and float to the top, but out-of-territory candidates are still shown. The rep decides; the app just surfaces the most likely match first.
- **`disambiguated_query` passed to research** — e.g. `"Delta Air Lines (NYSE: DAL, Atlanta GA)"` instead of `"Delta"`. Gives the Sonnet research loop a clean, unambiguous starting point.
- **Cost hints only at pause points** — `lib/costs.ts` defines ranges for research, refresh, follow-up, email refresh. Nothing shown for sub-cent operations (resolve, case study match). Principle: never show cost hints mid-flow, only when the UI is already paused waiting for user input.
- **Resolve errors fall through** — if `/api/resolve` fails (network error, no API key), `AddProspectInput` falls through to `/api/research` directly. Research returns the same auth/config error with a proper message. No silent failures.

### Cost transparency design principle (new)

Any BYOK operation with estimated cost ≥ ~$0.01 should surface a plain-language cost range at the nearest natural workflow pause point. Never mid-flow, never with false precision. `lib/costs.ts` is the single source of truth for these ranges — update it when model pricing or typical token volumes change materially.

---

## Session 9 summary (Decision Maker Targeting Tiers)

### What was built

Full targeting tier feature. Research prompt now tiers each decision maker based on team-level seniority band and function rules. DM cards sort automatically — prime targets first, intel/low signal below. No badges, no separate sections — position does the work.

### Files created / modified

| File | Change |
|---|---|
| `supabase/schema.sql` | Added `targeting_tier` + `tier_reasoning` to `decision_makers`; added `team_config` table + RLS + index |
| `lib/types.ts` | Added `TargetingTier` type; `targeting_tier` + `tier_reasoning` to `DecisionMaker`; new `TeamConfig` type |
| `app/api/admin/team-config/route.ts` | **New** — GET (any authed user) + PUT (admin-only upsert of singleton row) |
| `app/(app)/setup/page.tsx` | Added `team_config` fetch in parallel block; passes to `SetupForm` |
| `app/(app)/setup/SetupForm.tsx` | New Targeting section — chip selectors for seniority bands + functions, custom add inputs, admin-only edit, separate "Save targeting" button |
| `components/prospect/DecisionMakers.tsx` | Single flat list sorted by tier rank then sort_order; no badges, no section splits |
| `app/api/research/route.ts` | Fetches `team_config`; injects `seniority_bands` + `target_functions` into system prompt; validates and writes `targeting_tier` + `tier_reasoning` on DM insert |

### Architecture decisions

- **`team_config` singleton, not per-rep** — targeting rules are consistent across the team; no per-rep override needed. Admin edits via the Targeting section of `/setup`.
- **No manual tier override on DM cards** — reps manage contacts in their CRM. This app is for initial prospecting, not contact lifecycle management.
- **`null` targeting_tier treated as `prime_target`** — existing DMs before migration are shown as prime targets optimistically. They'll get proper tiers on next re-research.
- **Single flat list, sort only** — tried separate "Prime targets" / "Intel only" section cards; felt disorienting. Dropped to a single list sorted by tier. Position conveys priority without explicit labeling.
- **`type="search"` for custom chip inputs** — Chrome ignores `autoComplete="off"` and `autoComplete="new-password"` on inputs it heuristically associates with credentials. `type="search"` is the one input type Chrome won't autofill.
- **Preset lists baked into `SetupForm`** — 9 seniority bands + 14 target functions defined as constants in the component. Custom additions are persisted to `team_config` and surfaced alongside presets on next load.

### Supabase migration run this session

```sql
alter table decision_makers
  add column if not exists targeting_tier text not null default 'prime_target',
  add column if not exists tier_reasoning text;

create table team_config (
  id                uuid primary key default gen_random_uuid(),
  seniority_bands   jsonb not null default '[]',
  target_functions  jsonb not null default '[]',
  updated_at        timestamptz default now()
);
alter table team_config enable row level security;
create policy "Authenticated users can read team config"
  on team_config for select using (auth.role() = 'authenticated');
create index on team_config (updated_at desc);
```

### ⚠️ First-use step

Go to `/setup` → Targeting section → select your target bands and functions → Save targeting. Until this is done, the research prompt will note that targeting is unconfigured and use model judgment.

---

## Session 7 summary (Case Study Matcher — full implementation)

### What was built

Full Case Study Matcher feature. All routes, UI components, and wiring are complete. **Feature is code-complete but not yet end-to-end tested — waiting on Pentaho PDF from Jon.**

### Files created / modified

| File | Change |
|---|---|
| `supabase/schema.sql` | Added `case_studies` table + RLS + Storage bucket setup notes + index |
| `lib/types.ts` | Added `CaseStudy`, `CaseStudyMatch` types; extended `ApiUsage.endpoint` union |
| `lib/pdf/CaseStudiesPdf.tsx` | PDF document component (separate `.tsx` so route stays `.ts`) |
| `app/api/admin/case-studies/route.ts` | GET + POST + DELETE — admin CRUD, service role only |
| `app/api/admin/case-studies/import-deck/route.ts` | PDF → png (pdf-to-img) → Claude vision → DB + Storage |
| `app/admin/case-studies/page.tsx` | Admin page — server component, admin gate |
| `app/admin/case-studies/AdminCaseStudiesClient.tsx` | Client CRUD + PDF import UI |
| `app/api/case-studies/match/route.ts` | Prospect matching — single Claude call, no web search |
| `app/api/case-studies/slide-url/[id]/route.ts` | Signed URL for slide images (1hr expiry) |
| `app/api/case-studies/export-pdf/route.ts` | PDF export — signed URLs → @react-pdf/renderer |
| `components/prospect/CaseStudySection.tsx` | Right column UI — idle/loading/results states, export |
| `components/prospect/CaseStudySlideModal.tsx` | Slide preview modal |
| `components/prospect/RightColumn.tsx` | Added `CaseStudySection` (hidden when library is empty) |
| `components/prospect/Sidebar.tsx` | Added "Case studies →" admin link |
| `app/(app)/prospects/[id]/page.tsx` | Added `caseStudyCount` fetch + passed to `RightColumn` |
| `vercel.json` | Added maxDuration for import-deck (60s), match (30s), export-pdf (30s) |
| `package.json` | Added `pdf-to-img` |

### Architecture decisions

- **`pdf-to-img` instead of `pdf2pic`** — `pdf-to-img` wraps `pdfjs-dist` with no system binary deps. Works in Vercel serverless; no Ghostscript required.
- **PDF component in `lib/pdf/CaseStudiesPdf.tsx`** — Route handlers are `.ts` files; JSX lives in a separate `.tsx` file, imported and invoked via `React.createElement()`.
- **Import is additive** — never wipes existing records. Re-uploading the same filename creates new records; admin deletes duplicates inline.
- **30-slide cap per import run** — prevents Vercel 60s timeout on large decks. Import is additive, so large decks can be uploaded in parts.
- **`caseStudyCount` fetched at page load** — single `count` query added to the parallel fetch in the prospect page. `CaseStudySection` only renders if count > 0, avoiding unnecessary rendering.
- **Signed URLs are short-lived** — 1hr for slide preview (modal fetches on open), 5min for export (server-side use only).

### ⚠️ Required before feature is usable (one-time setup)

1. Run Supabase migration (copy the case_studies block from `supabase/schema.sql`)
2. Create Storage bucket `case-study-slides` (private) in Supabase dashboard
3. Import deck — go to `/admin/case-studies`, upload the Pentaho PDF
4. Verify — check import count, review extracted records, run "Find matches" on a prospect

### Known risks / watch points

- **pdf-to-img on Vercel** — needs real-world test. If pdfjs-dist has runtime issues, fallback is ZIP-of-PNGs (BACKLOG deferred v2).
- **Edit functionality** — admin client-side edit does an optimistic state update but does NOT persist via API. Admin should delete + re-add if inline editing is needed before a PATCH endpoint is added.

---

## What's next (priority order)

1. **Case Study Matcher seeding** — code complete; waiting on Pentaho PDF. Steps: run schema migration, create `case-study-slides` Storage bucket (private), upload PDF at `/admin/case-studies`, verify import + matching.
2. **`/api/cron/refresh-all`** — weekly refresh + Resend digest (not urgent — cron schedule already in vercel.json)
3. **Background job pattern** — if research quality at 3 iterations proves insufficient, move to Inngest
4. **Follow-up route + panel** — de-prioritized; initial outreach focus only for now

---

## Earlier sessions (1–6 and 8) archived

See git history for full session summaries. Key milestones:
- Session 1: scaffold, auth, sidebar
- Session 2: research route, prospect summary page
- Session 3: shared products, PDF export, email panel
- Session 4: BYOK, invite management, Vercel deployment
- Session 5: Check for Updates, crash recovery, timeout fixes
- Session 6: Case Study Matcher design
- Session 8: Decision Maker Targeting Tiers design
