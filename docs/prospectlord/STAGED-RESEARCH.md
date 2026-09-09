# ProspectLord — staged research design

Splitting the monolithic research call into rep-triggered stages.

Status: **design, not yet implemented.** Decisions below are settled unless
marked as an open question.

---

## Why

`/api/research` currently produces, in one call: company snapshot, stats, timing,
news, initiatives, pain signals, tech signals, outreach angle, decision makers,
targeting tiers, and the first email draft. Everything else in the app is already
a separate rep-triggered route — `resolve`, `case-studies/match`, `refresh-email`,
`pitch-opener`, `check-updates`. Research is the outlier.

Four things follow from splitting it, in rough order of value:

**It matches how a rep actually works.** See the product principle in the root
`CLAUDE.md`: assess the company, then find people, then design outreach — each
step taken only if the last one justified it. Today the app spends the rep's
money on all three before they have decided the account is worth anything.

**It should fix decision-maker confabulation.** In the 2026-09-08 A/B, name
discovery competed for search budget against company research, timing inference
and email writing inside one call. Uncorroborated names across six runs: Sonnet
4.6 produced 1, Sonnet 5 produced 3–4. A dedicated call with its own `max_uses`
and a prompt that only has to find real people gives that job a budget it has
never had.

**The 300s Vercel ceiling stops binding.** The monolith runs 180–200s against a
300s cap that the Hobby plan will not raise. Two focused calls of ~120s and ~90s
each fit comfortably, and total work can exceed 300s because it spans
invocations. This removes the constraint rather than paying to raise it.

**Disqualification gets cheap.** Most prospects do not survive first look. Today
that costs ~$0.40. Staged, it costs stage 1 only.

Cost when both stages run is roughly a wash — two focused calls cost about what
one unfocused call did. The saving is entirely on the path where the rep says no.

---

## Stages

| stage | route | trigger | writes |
|---|---|---|---|
| 1. Assess company & need | `POST /api/research` | rep adds a prospect | brief + fit verdict |
| — gate — | | rep reads the fit verdict and decides | |
| 2. Identify decision makers | `POST /api/decision-makers` *(new)* | rep clicks the invitation | `decision_makers` rows |
| 3. Design outreach | `refresh-email`, `pitch-opener`, `case-studies/match` | rep clicks | unchanged |

The gate is not a UI of its own. **The button is the gate.** Stage 2 exists only
as an invitation the rep can decline by not clicking.

---

## Stage 1 — assess company and need

`POST /api/research`, largely as today, with three changes.

**Removed: the email draft.** Research stops producing `email`. The rep gets one
by clicking Draft email, which routes to `refresh-email` — the route that already
owns email generation properly. This also removes `EMAIL_RULES` from the research
prompt, which is where the 75-vs-120 word contradiction lives.

**Removed: decision makers and targeting tiers.** Moves wholesale to stage 2,
including the tier rules and the `team_config` seniority/function lookup.

**Added: an explicit fit verdict.** The rep needs something concrete to gate on.

```jsonc
"fit": {
  "verdict": "strong | moderate | weak",
  "rationale": "2–3 sentences: which confirmed actions or stated needs line up with which specific product capability",
  "budget_signal": "what suggests they can fund this — recent awards, published budget lines, funding, headcount growth. 'Unknown' if nothing found.",
  "what_would_change_it": "one line: the single missing fact that would most move this verdict"
}
```

Prompt rules for the verdict:

- Base it on **confirmed actions and stated needs**, never on what an organization
  of this type probably needs.
- Weigh **perceived budget** — evidence they can actually fund a purchase.
- **Do NOT factor fiscal-year timing or buy-window status into the verdict.**
  Timing answers *when*; fit answers *whether*. They are tracked separately and
  mixing them produces a verdict that is really a calendar reading. The existing
  `timing` block and the TimingBar continue to own that question.
- `weak` is a useful answer. Say weak when it is weak.
- If the signals are too thin to judge, say `weak` and put the reason in
  `what_would_change_it`.

`what_would_change_it` is deliberate: it tells the rep what to go looking for,
and keeps the verdict honest about its own uncertainty.

---

## Stage 2 — identify decision makers

`POST /api/decision-makers` (new). Rep-triggered, never automatic.

**Grounded in stage 1.** Loads the prospect's latest brief and passes the tech
signals, initiatives and pain signals as context, so the search targets the
functions that actually matter at this account rather than generic org-chart
roles. Uses the existing `loadProspectContext` loader.

**Reads `team_config`** for seniority bands and target functions, and assigns
`targeting_tier` + `tier_reasoning` exactly as the monolith does today. That
logic moves unchanged; only its home changes.

**Its own search budget.** A `DECISION_MAKERS_MAX_USES` constant in
`lib/web-search.ts`, sized for people-finding rather than inherited from company
research.

**Its own sourcing rules**, carrying the Phase 0 discipline:

- Every named individual needs a source you actually retrieved.
- Never infer a name from a role. If you cannot find who holds a position, return
  the role with `name: null` — the schema supports this and it is the correct
  answer.
- Returning an empty array is correct when no individuals are publicly
  identifiable. Do not pad the list to reach a count.

This is the fix for the confabulation measured on 2026-09-08. The old prompt
asked for "3–5 individuals", which pressures the model to produce five names
whether or not five are findable.

**Writes** to `decision_makers` using the existing insert-new-then-delete-old
pattern, and stamps `prospects.dm_researched_at`.

---

## Schema

```sql
-- Stage 1 fit verdict
alter table prospect_briefs add column if not exists fit jsonb;

-- Stage 2 completion. NULL = never run. Set even when zero people were found,
-- so "we looked and found nobody" is distinguishable from "we never looked" —
-- otherwise the rep is invited to pay for the same empty answer repeatedly.
alter table prospects add column if not exists dm_researched_at timestamptz;
```

`dm_researched_at` lives on `prospects`, not `prospect_briefs`, deliberately.
Re-running stage 1 replaces the brief row; decision makers should survive that,
since news changing does not change who works there. `decision_makers` is already
keyed to `prospect_id`, so this is consistent with what is already true.

`prospect_briefs.email` stays. Existing briefs keep their drafts; new ones leave
it null until the rep asks.

`jobs.kind` is plain `text` with no CHECK constraint — the new `decision_makers`
kind needs no migration.

---

## Metering

**Settled: the limit stays, raised to 50/day, with a per-rep manual override.**

It stops being a budget cap and becomes a runaway guard. On a BYOK product each
rep pays their own card, so the limit is not there to control spend — it is there
so a retry loop or a misconfigured client cannot make unbounded calls before
anyone notices. 50/day is high enough that it should never bind in real use:
staged, one full pipeline is two metered calls, so 50 allows ~25 complete
prospects a day, well beyond a realistic rep's throughput.

Changes:

- `DAILY_CALL_LIMIT` default `25` → `50`.
- New nullable column for the override:
  ```sql
  alter table rep_profiles add column if not exists daily_call_limit integer;
  -- NULL = use the DAILY_CALL_LIMIT env default. Set per rep to override.
  ```
- `checkDailyLimit` reads `rep_profiles.daily_call_limit` and falls back to the
  env default when it is null. It already fetches the profile in every calling
  route, so this costs no extra query if the value is passed in.
- `METERED_ENDPOINTS` gains `decision_makers` — it is a search-heavy Sonnet call
  and belongs in the same bucket as research and check-updates.
- Email, pitch opener and resolve stay **unmetered**, unchanged. They are cheap
  Haiku calls the rep is meant to iterate on freely; that rationale holds just as
  well at 50 as it did at 25.

Overriding is a manual admin action against the column for now. A UI control on
`/admin/users` is a reasonable follow-up but is not required for this work —
noted in `BACKLOG.md` rather than built here.

`lib/api-usage.ts` therefore keeps both halves: the cost ledger (`logUsage`,
`USAGE_ENDPOINT`) and the guard (`checkDailyLimit`, `METERED_ENDPOINTS`). The
2026-09-08 split between them still stands and is what makes raising the ceiling
safe — the cheap routes cannot consume it.

`CLAUDE.md`'s "Rate limiting" section needs updating to describe a guard rather
than a budget, and to document the per-rep override.

---

## UI

**Fit verdict** renders in the brief, immediately above the decision-makers
invitation, so the gate decision and the evidence for it are adjacent. Verdict as
a coloured chip reusing the tier palette (strong/green, moderate/blue,
weak/neutral), rationale as body text, `what_would_change_it` as a muted line.

**Decision makers section** has three states, replacing today's
`{dms.length > 0 && ...}` which renders nothing at all when empty:

| state | condition | renders |
|---|---|---|
| not researched | `dm_researched_at` is null | **invitation** — heading, one-line caption on what it does, cost hint, "Find decision makers" button |
| researched, found | rows exist | the list as today, with tier badges |
| researched, none found | `dm_researched_at` set, no rows | "No named individuals found publicly." plus a Retry button — a correct outcome, stated plainly, not an error |

Caption for the invitation, roughly: *"Search for named people at this
organization, ranked against your team's target seniority and functions. Worth
doing once the company itself looks like a fit."*

**Refresh per stage.** Today's "Rebuild brief" re-runs everything. It becomes
"Refresh company research" (stage 1 only, leaves decision makers intact) and the
decision-makers card gets its own refresh. Most of the value of splitting is
here: re-run people after a reorg without paying for company research, or refresh
company facts without re-discovering people.

---

## Smaller pieces

- `lib/costs.ts` gains `decisionMakers` — a Sonnet call with a focused search
  budget, order of `$0.10–$0.25`. Calibrate from the first real runs; the current
  `research` hint of `$0.10–$0.40` already measured low at $0.40–0.43.
- `JobKind` gains `decision_makers`; `JobsSection`'s `KIND_KEYS` gains a label;
  the six locale files each gain one message key.
- `vercel.json` gains a `maxDuration` for the new route. 120s is ample for a
  focused people search — well clear of the 300s ceiling.

---

## Migration path

Existing data must not be stranded.

1. **Backfill `dm_researched_at`** for prospects that already have decision
   makers, so established accounts show their list rather than being invited to
   pay for research that already ran:
   ```sql
   update prospects p
      set dm_researched_at = coalesce(p.last_refreshed_at, now())
    where dm_researched_at is null
      and exists (select 1 from decision_makers d where d.prospect_id = p.id);
   ```
2. **Prospects with a brief but no decision makers** correctly fall to the
   invitation state — under the old monolith a brief with zero DMs meant the
   model found none, and inviting the rep to try again with a dedicated,
   better-sourced call is the right offer.
3. **`fit` is null on every existing brief.** The fit card renders only when
   present; old briefs simply do not show one. Refreshing stage 1 populates it.
4. **Existing `email` drafts keep working** — the Draft email button already
   reads `brief.email` and falls back to generating one.

---

## Implementation order

Each step should build and be independently revertable.

1. Schema migration + backfill
2. Strip email and decision makers from the stage 1 prompt; add the fit verdict
3. `POST /api/decision-makers` with its own prompt and search budget
4. UI — fit card, three-state decision makers section, per-stage refresh, and
   **the Draft email button must stop being gated on `brief.email`**. Step 2
   stops stage 1 writing a draft, so `{brief?.email && <EmailDraftButton …/>}`
   hides the button entirely on every new brief. `EmailDraftButton` needs to
   accept a null `initialEmail` and generate on first open — it already has the
   refresh path, so this is a nullable prop plus an empty state, not new
   machinery. Tracked here because step 2 introduces the gap and step 4 closes
   it; the branch is functionally short an email button in between.
5. Remove metering
6. Docs — `CLAUDE.md` rate-limiting section, `.env.local.example`, `BACKLOG.md`

Steps 1–4 are the feature. 5 and 6 are cleanup that can land in the same PR or
follow it.

---

## What this does not change

- The A/B harness and `MODEL-UPGRADES.md` protocol still apply — but the harness
  currently exercises the *monolithic* prompt. Once stage 1 is company-only it
  would be measuring a prompt that no longer ships. **Settled: re-baseline after
  the split, not before.** The harness must first be updated to run stage 1 and
  stage 2 as separate measured calls, so cost, latency and the accuracy scorecard
  are reported per stage — a combined number would hide which stage regressed.
  This also means the Phase 0 prompt changes remain unmeasured until then, which
  is an accepted, temporary state rather than an oversight.
- Prompt caching, the cost ledger, targeting tier presentation, and the Phase 0
  sourcing rules all carry over unchanged.
- `check-updates` keeps its current scope: new developments about the company. It
  does not refresh decision makers. Whether a reorg should surface there is a
  separate question, left open deliberately.
