# CELord — Backlog

Items roughly in priority order within each section. Moved from HANDOFF to
BACKLOG as v0 ships.

## Next up after v0

- **Pentaho community forum collector.** Scrape public post history. Usernames
  + post content → person hints that entity resolution can link to orgs via
  LinkedIn / email domains at enrichment time.
- **Stack Overflow collector.** Recent Pentaho/Kettle questions (last 12mo
  weighted heavily). User profiles often list employer.
- **Conference talks + case studies collector.** Pentaho Community Meetup
  archives, Hitachi Vantara case studies, SlideShare, YouTube talk descriptions.
  Lower usage-confidence weight when old; surface speakers as warm contacts.
- **Job postings collector hardening.** v0 ships with basic job postings
  via SerpApi or Adzuna. Post-v0: add company career page scraping for
  orgs in the pipeline, tune employer-name extraction, handle staffing-agency
  reposts that obscure the real hiring org.
- **SerpApi → Adzuna quota fallback.** Currently the jobs collector uses
  whichever key is present at startup — it does not fall back to Adzuna if
  SerpApi returns a 429 mid-run. Add runtime fallback: catch 429 from SerpApi
  and retry the same query via Adzuna if both keys are configured. Build only
  if SerpApi quota becomes a recurring problem — Vercel logs will surface it
  clearly with the current error logging.

## Platform evolution (the SalesLord platform)

CELord is the second product in the SalesLord platform. See `docs/celord/CLAUDE.md`
"Repo structure decisions" and "Target shape" for the full context.

### Stage 2: Monorepo restructure + ProspectLord rename

Triggered when single-repo shape starts hurting — deploy times balloon, route
ownership gets ambiguous, or apps want independent Vercel configs.

Work involved:
- Restructure repo into pnpm-workspaces + Turborepo. Repo name stays `saleslord`.
- Move ProspectLord code into `apps/prospectlord/`. Rename from SalesLord to
  ProspectLord: package.json, user-facing strings, Vercel project name.
- Move CELord code into `apps/celord/`.
- Extract `core/` → `packages/core/`, `signals/` → `packages/signals/`,
  `supabase/migrations/` → `packages/db/`.
- Fix imports in both apps. Verify both build and deploy.
- Split Vercel deployment into two apps. Each gets its own subdomain.

### Stage 3: Shared UI extraction + platform plumbing

Triggered when genuine component duplication exists, or platform-level features
(shared top-nav, user/team model) are actively needed.

- Extract shared top-nav component first
- Extract shared Organization card / Person card / signal evidence components
- Standardize shared form components, table primitives

### Platform plumbing (accretes over time, mostly Stage 3+)

- **Shared top-nav with cross-app links** — apps at subdomains but unified nav
- **Shared user/team model** — User and Team concepts in `packages/core`
- **Per-user settings store** — territory presets, default filters, scoring
  weight overrides; readable from any app
- **Tools registry** — markdown file at monorepo root listing each app and
  its data ownership
- **Event log / activity feed** — shared `activities` table for cross-app actions

### Future apps to consider

- **DealDesk** — quote/proposal management. Uses `core` for Org + Person,
  doesn't need `signals`. Proves platform supports apps that don't need full stack.
- **Territory Planner** — analytics over signal + status history. Pure consumer
  of shared data, no new tables. Proves shared database pays off.
- **Partner Radar** — flips CELord to focus on integrators/consultancies as
  partnership targets. Uses same signal collectors.

## Monitoring and alerting

- **Watchlist.** User marks orgs or queries as watched. Re-run collectors on
  schedule, diff against last run, alert on new signals.
- **Alert delivery.** Start with email digest; evaluate Slack or in-app after.
- **"New to the list" surfacing.** Orgs that appeared this week but not last,
  highlighted on the main list.

## Enrichment quality

- **Sonnet 4.6 re-run tier.** For orgs above score threshold or low-confidence
  Haiku enrichment, re-run on Sonnet. Cache result.
- **Parent/subsidiary traversal in UI.** Show org's parent and children inline;
  territory filters optionally expand to include subsidiaries.
- **Company data enrichment API** (Clearbit, Apollo, People Data Labs) —
  backlogged; revisit if LLM-based HQ determination proves unreliable at scale.

## CRM integration

- **Scheduled customer status refresh.** v0 has manual CSV import; post-v0
  automate refresh cadence and add import validation.
- **Failed-conversion deep tracking.** Extend status history schema to capture
  structured reasons (`price | feature_gap | timing | competitor | other`),
  competitor chosen, deal size at loss, decision-maker contact.
- **Re-engagement scoring.** Failed conversions with recent CE signals get a
  dedicated score weighting: time since loss, freshness of CE signals, whether
  original objection has plausibly changed.
- **Direct CRM sync** — if/when CRM exposes an API. Low priority until CSV
  flow proves value.

## Scoring refinements

- **Per-user scoring weights.** User-configurable weight overrides on the
  composite score.
- **Feedback loop.** "Good / bad prospect" thumbs per org. Feeds manual
  re-weighting conversation — not ML, just data.
- **Industry-specific scoring.** Regulated industries (healthcare, finance,
  government) get a bump on risk-posture weight.

## Collector hardening

- **Rate limit + backoff framework** shared across collectors.
- **Collector health dashboard** — last run time, signals emitted, errors.
- **Secondary / tertiary Shodan queries** as fingerprint knowledge improves.
  Censys as a second provider.

## Revenue band configuration

- **Team revenue band definitions.** The UI currently shows "Enterprise / Mid-market / SMB"
  as plain labels. Add actual revenue ranges to the band labels (e.g. "Enterprise (>$250M)")
  once the team's standard bands are confirmed. Ranges should be configurable — likely stored
  in `team_config` so an admin can update them without a deploy. The enrichment prompt in
  `signals/enrichment.ts` should also be updated to use the team-specific thresholds so
  Haiku classifies consistently with how the team defines each band.

## UI and workflow

- **Territory presets** — save named territories, switch between them.
- **Saved searches** — industry, score range, signal types, recency.
- **Outreach draft generation** — given org + signals, draft cold outreach
  email leading with strongest signal. Uses Sonnet 4.6. (May belong in
  ProspectLord, not here.)
- **Bulk actions** — mark multiple orgs as contacted, excluded, followed up.

## Known false positives to handle

- **Pentaho, Portugal** — negative keyword at collector level. Handled in v0;
  worth a regression test once real data flows.
- **Generic "kettle"** — context-sensitive filtering; likely needs LLM pass
  for ambiguous cases.
- **Hitachi Vantara and subsidiaries** — tag as `org_type: vendor`, exclude
  from default prospect view.
- **Integrators and consultancies** — tag as `org_type: integrator`, separate
  "partners" view.
- **Training providers** — tag as `org_type: training_provider`, low priority
  for prospect view.
