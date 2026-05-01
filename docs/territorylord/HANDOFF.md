# TerritoryLord — Handoff

## Current state: v0 live, first run complete (465 orgs)

TerritoryLord v0 is deployed and working end-to-end. First run completed
successfully: Public Administration + Educational Services ICP against a US
state returned **465 candidate organizations**.

**What's live:**
- Territory page — single unified North America map (US states + Canadian
  provinces), fills viewport, zooms to selection, hover tooltips with region
  name, frosted-glass selected-regions overlay
- ICP profiles — NAICS sector chips (alphabetical, 20 sectors including
  Public Administration 92), size hint picker
- Runs — new run form (region + ICP), run history list, results table with
  accept/reject/promote actions
- Admin page — manual run trigger for testing

**Data source:** Wikidata SPARQL (free, no key). Collector at
`packages/signals/src/collectors/wikidata.ts`. Queries P300 (ISO 3166-2
region), P856 (website required), P452 (industry where available), ordered
by sitelinks count, capped at 500. Haiku 4.5 classifies industry for orgs
without P452.

**Territory map tech:**
- `react-simple-maps` v3 with `ZoomableGroup` for auto-zoom
- Single `ComposableMap` with two `Geographies` layers — `us-atlas@3` for
  US states, `codeforamerica/click_that_hood` GeoJSON for Canadian provinces
- `TerritoryMap` component is generic (`layers[]` array) — adding more
  countries is a one-liner
- `getTooltipExtra` hook stubbed on `TerritoryMap` — ready to inject per-region
  org discovery / briefed counts into the hover tooltip in a future session
- Type declaration shim for `react-simple-maps` at `apps/web/types/react-simple-maps.d.ts`

**What was built this session:**
- `packages/core/src/index.ts` — added `'wikidata'` to `SignalSource`
- `packages/signals/src/collectors/wikidata.ts` — Wikidata SPARQL collector
- `packages/signals/src/classifyIndustry.ts` — NAICS Haiku 4.5 classifier (20
  sectors, code 99 = unknown filtered from ICP picker)
- `packages/signals/src/persist.ts` — added `orgMap` to `PersistResult`
- `packages/signals/src/scoring.ts` — added wikidata confidence score
- `packages/db/schema.sql` — territories, icp_profiles, territorylord_runs,
  territorylord_candidates tables + RLS policies
- `apps/web/app/territorylord/` — layout, territory, icp, runs, runs/[id], admin
- `apps/web/app/api/territorylord/` — POST runs, PATCH candidates/[id]
- `apps/web/components/territorylord/TerritoryMap.tsx` — interactive map component
- `apps/web/types/react-simple-maps.d.ts` — type declaration shim
- `apps/web/components/PlatformRibbon.tsx` — TerritoryLord tab added

## Next session focus: candidate filtering + enrichment

**The problem:** 465 candidates returned with no visibility into revenue or
headcount. Without size/revenue signals the rep can't efficiently filter to
accounts worth pursuing. Need better pre-filtering at collection time and/or
richer display in the results table.

**Options to evaluate (pick one approach before starting):**

1. **Wikidata employee count** — P1082 (number of employees) is available on
   some Wikidata entries. Pull it in the SPARQL query at zero extra cost. Coverage
   will be partial but better than nothing for well-known orgs.

2. **Wikipedia/Wikidata description enrichment** — schema:description is already
   pulled. Surface it in the results table so reps can scan faster without needing
   revenue/headcount numbers.

3. **ICP size-hint pre-filter** — currently `size_hint` on the ICP profile is
   stored but not used as a filter during the run. Wire it to the Wikidata query
   or post-collection filter using employee count (if pulled).

4. **Results table improvements** — the 465-org table is hard to work through
   without sort/filter controls. Add: sortable columns, filter by status (new /
   accepted / rejected), bulk accept/reject.

**Likely right answer for next session:** pull P1082 employee count from Wikidata
(free, already in the graph), surface it in the results table, and wire the ICP
`size_hint` filter to it. Then improve the results table with basic sort/filter.

## Decision log

- **OpenCorporates:** replaced with Wikidata SPARQL — free, no key required,
  good coverage of government + education entities
- **NAICS vs freeform:** NAICS top-level codes chosen for v0; 20 sectors shown
  as alphabetical chips in ICP profile editor
- **NAICS 92 (Public Administration):** confirmed in ICP — state/local government
  is explicitly in target ICP
- **Revenue band:** deprioritized per original design doc — ProspectLord briefs
  handle per-account revenue research
- **Territory map:** single unified NA map (vs two separate maps) — simpler,
  zoom handles the scale difference
- **Subdomain:** all three apps in one deployment at Stage 1 — no separate
  TerritoryLord subdomain

## Explicitly deferred (do not build now)

- Multi-state runs in a single job (needs Inngest or similar)
- Paid firmographic BYOK (Apollo, ZoomInfo) — only if free data proves too noisy
- Employee count enrichment from paid sources
- Revenue band data at candidate level
- Saved territory presets
- Watchlist / alert-on-new-org-in-territory
- Promote-to-ProspectLord deep-link QA (needs testing with a real promoted org)
- Tooltip org counts (`getTooltipExtra` hook is stubbed, data not wired)
