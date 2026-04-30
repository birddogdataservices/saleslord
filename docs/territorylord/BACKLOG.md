# TerritoryLord — Backlog

Items roughly in priority order within each section. v1 has not yet shipped
as of this doc's creation; "Next up after v1" assumes Workstream B from
HANDOFF has completed.

## Next up after v1

- **Reject log analysis pass.** After running v1 on 3–5 regions, manually
  review the reject reasons. The dominant reject category is the next
  filter to add. If `too_small` dominates → add employee-count enrichment.
  If `wrong_industry` dominates → tighten the industry classification prompt
  or add a second classification pass. If `not_real` dominates → tighten
  OpenCorporates filters (entity status, age, has-website).
- **Employee-count enrichment.** Use Wikidata SPARQL or LinkedIn-adjacent
  Google search results to add employee count band per candidate. Only build
  if reject-log analysis shows size-based noise dominates. Cheap proxy for
  IT-budget signal.
- **Has-website verification.** Stronger than the v1 basic check — actually
  fetch the homepage to confirm it loads and isn't a parked domain. Cheap
  noise filter.
- **Multi-region runs.** Single job that processes multiple regions
  sequentially. Triggered when reps have >5-state territories and one-at-a-time
  becomes painful. Likely needs Inngest or Vercel Cron pattern (see "Job
  infrastructure" below).
- **Bulk accept/reject.** Multi-select candidates and apply status to all.

## Source upgrades

Build only if v1 free-source results prove insufficient. Reject-log analysis
is the trigger.

- **Apollo BYOK collector.** Lands in `packages/signals/collectors/apollo.ts`.
  Mirrors OpenCorporates collector shape. BYOK key encrypted in `rep_profiles`.
  Apollo is the pragmatic default — broad coverage, common in B2B sales stacks.
- **ZoomInfo BYOK collector.** Same shape as Apollo. Higher quality data,
  much higher cost; only if rep already has an account.
- **Crunchbase / Clearbit / People Data Labs BYOK.** Lower priority.
- **Provider abstraction.** Once 2+ paid providers exist, extract a shared
  `FirmographicProvider` interface. Don't abstract before a second
  implementation exists.
- **Wikidata SPARQL collector.** Free, surprisingly good for mid-to-large
  companies. Useful as augmentation rather than spine. Could provide
  employee-count enrichment without a paid source.
- **Government registries (state SOS, provincial).** Per-jurisdiction scrapers.
  High effort, inconsistent formats, captcha-protected. Last resort.

## Industry classification

- **NAICS vs. freeform tag decision revisit.** v1 picks one during
  implementation; backlog the other. If NAICS chosen, freeform tags may be
  useful for ICPs that don't map cleanly. If freeform chosen, NAICS may be
  needed for cleaner OpenCorporates filtering.
- **Industry-specific filtering rules.** Some ICPs need negative filters
  (e.g. "software but not gaming"). Add structured negative-keyword support
  per ICP profile.
- **Sonnet 4.6 re-run for low-confidence classifications.** Same pattern as
  CELord's two-tier enrichment.

## Territory + ICP UX

- **Saved territory presets.** Reps with multiple named territories
  (e.g. "current", "Q1 expansion", "named accounts") switch between them.
  Probably lives in shared per-user settings post-Stage 3.
- **Territory templates by team.** Sales managers define team-standard
  territories; reps inherit and customize.
- **ICP profile sharing across team.** Same as territory templates —
  team-standard ICP profiles inherited per rep.
- **Territory visualization.** Map view of selected regions. Nice-to-have,
  not load-bearing.

## Cross-app integration

- **ProspectLord territory filtering.** Once `territories` is populated, let
  the existing ProspectLord prospect list filter by rep's territory regions.
  Small change, big leverage — completes the loop.
- **CELord territory awareness.** CELord's territory filter (multi-select on
  country + state/province) could be replaced with a "use my TerritoryLord
  territory" preset for reps who've defined one.
- **Bulk promote to ProspectLord.** Promote multiple accepted candidates in
  one action.
- **Promotion workflow telemetry.** Track candidate → prospect → outcome
  through the full lifecycle. Feeds back into ICP refinement: which
  TerritoryLord candidates actually become customers?

## Job infrastructure

- **Inngest (or Trigger.dev / QStash) integration.** Triggered when:
  (a) multi-region runs needed, (b) CELord background work also wants proper
  queue infrastructure, or (c) regions exceed Vercel function timeouts in
  practice. Becomes a shared `packages/jobs/` package.
- **Per-region status streaming.** Rep starts a multi-region run, results
  stream in region-by-region rather than waiting for the whole batch.
- **Run resumption on failure.** Per-region status tracking already supports
  this; needs UI to expose "retry failed regions" action.

## Watchlist and alerting

- **New-org-in-territory alerts.** Re-run collectors on schedule, diff against
  last run for the same region, alert on new entities. Useful for territories
  with high startup formation rates.
- **ICP-match-changed alerts.** Existing org's industry classification or
  size band changes such that it newly matches an ICP. Lower priority.
- **Email digest delivery.** Reuse whatever pattern CELord adopts for its
  watchlist work.

## Data quality

- **Entity dedup audit.** Cross-app entity resolution may produce surprising
  merges or splits. Periodic manual audit on top-N orgs by signal count.
- **Stale candidate cleanup.** Candidates rejected as `not_real` more than
  X months ago — confirm they're still not real, or re-surface if they've
  matured.
- **Duplicate candidate detection.** Same org appearing in multiple runs as
  separate candidates → unique constraint on `(run_id, org_id)` already
  prevents this within a run, but cross-run dedup may want a different surface.

## Known issues to handle

- **OpenCorporates jurisdiction coverage.** Coverage varies by state/province.
  Some US states have weak coverage; Delaware has too much (every shell LLC).
  Document known weak/strong jurisdictions in collector comments.
- **Recently-renamed companies.** OpenCorporates may show old name; entity
  resolution to existing org rows may fail. Likely needs a second-pass
  fuzzy match.
- **Holding companies and shell entities.** Even with active-only + age
  filters, some noise remains. Ongoing reject-log iteration.
