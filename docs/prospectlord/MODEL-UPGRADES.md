# ProspectLord — model upgrade protocol

How to decide whether to move research onto a newer Claude model, and how to
keep the prompt from silently degrading as models change underneath it.

Written after the 2026-09-08 Sonnet 4.6 vs Sonnet 5 comparison, which produced
a clear answer to a badly-posed question. Both halves of that are recorded here.

---

## The core problem this protocol exists to solve

The research prompt specifies **output shape** in roughly a hundred lines and
**research behaviour** in one. Until Phase 0 landed, the only search instruction
in the entire prompt was:

> "Use web search to find named individuals where publicly available"

— scoped to decision makers only. Nothing set a sourcing bar, nothing required a
retrieved URL per claim, and `max_uses` was never set on the search tool.

So search depth was never instructed; it was **emergent**. Sonnet 4.6 happened to
be exhaustive by disposition (6 continuations, ~160k cached tokens per run).
Sonnet 5 is more decisive and concludes earlier (as few as 2 continuations,
~6.7k cached tokens). Neither model disobeyed anything, because nothing was asked.

**Models keep getting more token-efficient and more willing to stop early. A
prompt that relies on a model's incidental thoroughness gets worse with every
release.** That is the failure mode this document is designed to prevent.

Corollary: `MAX_CONTINUATIONS` is not the control point. Sonnet 5 never
approached the cap of 6 — it stopped on its own judgement. Only the prompt
reaches that decision.

---

## Phase 0 — make the prompt model-agnostic

Do this **before** any model comparison. Every defect below confounds an A/B,
because it changes how much a given model's disposition matters.

- [x] State research effort and a sourcing bar explicitly in the prompt
- [x] Require a specific retrieved article URL per news item — never a section
      index, landing page, or paginated news listing
- [x] Extend the "prefer null over a guess" rule beyond decision-maker names
- [x] Public-sector stats variant — revenue / headcount / funding stage are a
      corporate schema and do not apply to a state government
- [x] Set `max_uses` explicitly so the search budget is a decision, not a default
- [x] Move to `web_search_20260209` (dynamic result filtering; supported on
      Sonnet 4.6 and later)
- [x] Raise `max_tokens` on the emit call — briefs were landing within ~10% of
      the 4096 cap, so a richer prospect would have truncated

After Phase 0, **re-baseline the current model.** That new run is the reference
point; pre-Phase-0 numbers are not comparable.

---

## Phase 1 — turn the harness into a real eval

**Done (2026-09-11): the harness measures the two stages separately.** It had
still been running the pre-v1.7.0 combined flow, so this protocol described
something that could not actually be run. `apps/web/scripts/ab-research.ts` now
times and prices `POST /api/research` (stage 1) and `POST /api/decision-makers`
(stage 2) independently, calls the real `generateStructured` and the real
prompts, and prints per-stage shape counts alongside cost and latency.

```bash
pnpm ab:research "State of Massachusetts" --repeat 2   # both stages
pnpm ab:research "Broadridge Financial" --stages 2     # stage 2 on the stored brief
```

Splitting it immediately corrected a number this document had wrong: **stage 2
costs about the same as stage 1**, so a complete brief is ~$0.75, not the ~$0.34
the v1.7.x notes implied. Those figures were stage 1 alone.

Quality still needs a human reading JSON. Two gaps remain:

**A fixed prospect panel.** One prospect and two passes cannot settle much. Use
5–8 prospects spanning the segments actually sold to, including:

- a public-sector entity (exposed the corporate-stats defect)
- an enterprise SaaS company
- a mid-market private company with thin public coverage
- one deliberately ambiguous name (tests the resolve step)

**An automated scorecard.** Every accuracy signal used on 2026-09-08 computes
mechanically from the run JSON — none of it needs a human:

| metric | how | why it matters |
|---|---|---|
| corroboration rate | share of names/facts appearing in only one run of N | confabulation proxy — a name no other run finds is a name to distrust |
| citation depth | article URLs vs index/landing pages; HTTP resolvability | a rep clicking a news index during a call has nothing to open |
| schema completeness | required fields present | caught an intermittently missing `email` field |
| cross-run contradiction | same field, incompatible values across runs | one run said AWS, another said Azure, same config |

Note on resolvability: mass.gov and nascio.org return 403 to scripted requests.
That is bot-blocking, **not** a dead link — do not score it as one.

---

## Phase 2 — the adoption protocol

Run this whenever a new model ships, or a current one is deprecated.

1. **Test at documented defaults first.** Omit `thinking`, omit `effort`, let the
   model run as designed. Only then sweep dials. See the cautionary tale below.
2. **Sweep one dial at a time** — `effort` low → high → xhigh, then `max_tokens`
   sized to leave room for thinking.
3. **Never change the prompt and the model in the same run.** Prompt is
   versioned; model is the variable under test.

   **This extends past the model.** On 2026-09-09 Phase 0 changed the search
   tool version, the search budget (`max_uses`), and the search instructions in
   one commit, and deferred measuring them. A research call then ran 15.2
   minutes and returned a 500 — in production Vercel would have killed it at
   300s with nothing to show. Three plausible causes, no way to tell them apart,
   and the whole lot had to be reverted to get back to working.

   Treat **search tool version, `max_uses`, and search-effort prompt rules** as
   one interacting group with the model: change one, measure, then the next.
   `max_uses` in particular is not a harmless ceiling — the model spends the
   budget it is given, and `web_search_20260209` runs code execution internally
   for its filtering, so each search costs more than a search used to.
4. **Ship on the scorecard, not on cost.** Corroboration and citation quality are
   gates. Cost and latency are tiebreakers between candidates that both pass.
5. **Update `PRICING` in `lib/utils.ts` before switching.** An unlisted model ID
   falls through to the fallback and mis-reports cost. `calculateCost` strips a
   trailing `-YYYYMMDD`, so dated snapshots resolve to their family's rate.
6. **Re-run the panel** — roughly $2 and 15 minutes.

### Cautionary tale: how to invalidate your own A/B

The 2026-09-08 comparison ran Sonnet 5 in two configurations, **neither at the
model's defaults**:

| config | set | Sonnet 5 default | effect |
|---|---|---|---|
| `b` | `thinking: disabled` | adaptive **on** | ran a thinking model with thinking off |
| `c` | `effort: 'medium'` | **`high`** | ran a notch *below* default |

`medium` reads like a sensible middle but is below the default — omitting the
parameter entirely would have given *more* effort than was asked for. Sonnet 5
was therefore never tested at full strength, and an unknown share of the observed
gap is test design rather than model capability.

**Rule: if you are setting a parameter, know what the default is first.**

---

## Baseline record — 2026-09-11 (current reference point)

**This is the number to compare against.** Post-split, per stage, on the prompt
and search tool that ship at v1.8.0.

Prospect: "State of Massachusetts". `claude-sonnet-4-6`, `web_search_20250305`,
model defaults (no `thinking`, no `effort`). Two runs per side.

| SDK | stage 1 research | stage 2 decision-makers | total |
|---|---|---|---|
| 0.81 | 115.9s / $0.3552 | 112.5s / $0.4063 | 228.5s / $0.7615 |
| 0.81 | 119.8s / $0.3223 | 127.7s / $0.4389 | 247.5s / $0.7612 |
| 0.125 | 123.6s / $0.3487 | 129.0s / $0.4121 | 252.6s / $0.7608 |
| 0.125 | 117.7s / $0.3220 | 114.7s / $0.3907 | 232.5s / $0.7127 |

The SDK upgrade moved cost −3.2% and wall time +1.9% — both inside run-to-run
spread. **Take the 0.125 rows as the reference**: ~$0.72–$0.76 and ~230–250s
for a complete brief, against a budget of $0.50–$1.00 and 5–10 minutes.

Quality was stable across all four runs: `fit: moderate` every time,
`revenue: "N/A — state government"` every time (the public-sector rule holds),
and the same four people — Yajurvedi (CDO), Cole (CTO), Snyder (Secretary/CIO),
Bradshaw (Deputy Secretary) — surfaced in every run. That last point is the
corroboration signal Phase 1 wants, arrived at by hand.

Two caveats, both load-bearing:

- **The `pause_turn` path was never exercised by these runs.** Every stage made
  exactly **one** search call — the server-side loop completed inside a single
  API call. Search volume was high (96k–186k cache-read tokens per stage), it
  just all happened internally. The 2026-09-08 record below shows *six*
  continuations, but that was the pre-split monolith doing roughly twice the work
  in one call, so this is expected, not a regression.
  **Live runs are the wrong tool for that loop** — the ceiling is undocumented,
  so triggering it is guesswork at ~$0.75 a run. It is covered offline instead by
  `apps/web/lib/web-search.test.ts` (`pnpm --filter @saleslord/web test`), and
  the `StopReason` union carries `pause_turn` identically in 0.81 and 0.125.
- **`statsFilled` in the harness output counts non-null, not correct.**
  `"N/A — state government"` scores the same as a dollar figure. It is a change
  detector, not a quality score. Read `stats` in the JSON.

---

## Baseline record — 2026-09-08 (superseded; pre-split, pre-Phase-0 prompt)

Prospect: "State of Massachusetts". Two passes per config. Pre-Phase-0 prompt,
`web_search_20250305`, `max_tokens: 4096`.

| config | model | time | cost | pain | news | singleton DMs |
|---|---|---|---|---|---|---|
| `a` | claude-sonnet-4-6 | 180–200s | $0.40–0.43 | 7–8 | 5 | 1 |
| `b` | claude-sonnet-5, thinking off | 82–84s | $0.24–0.25 | 5 | 2–3 | 3 |
| `c` | claude-sonnet-5, adaptive, effort medium | 70–78s | $0.15–0.18 | 4 | 2 | 4 |

**Outcome: stayed on Sonnet 4.6.** Sonnet 5 was 41–65% cheaper and 2.4× faster,
but produced more uncorroborated decision-maker names and materially worse
citations — one run cited the same paginated news index for two distinct dated
claims. For discovery-call use, a brief that cannot be trusted is worth less than
one that takes two extra minutes.

Two caveats on that verdict, both recorded honestly:

- Sonnet 5 ran below defaults (see cautionary tale). The comparison is not a fair
  read of the model.
- Sonnet 4.6 was *more* accurate on names and citations but *less* accurate on
  stats: it reported "$61B revenue" for a state government, which is the
  appropriations budget mislabelled. Sonnet 5 correctly returned "N/A (state
  gov't)" plus the budget figure. Filling a field is not the same as being right,
  and an early version of that scorecard wrongly rewarded it.

Prompt caching (shipped the same day) saved 37–47% on the Sonnet 4.6 runs. The
saving scales with continuation count — a short run recovers less than the cache
write premium costs, so a two-continuation run came out 2% *worse*.

---

## Standing rules

- Cost and latency never outrank accuracy for a tool whose output is spoken aloud
  in a sales conversation.
- A confidently-stated wrong fact is worse than a missing one. Prompt rules
  should always make omission the cheap option.
- Prefer prompt fixes to model changes. Most of what looked like a model gap on
  2026-09-08 traced back to instructions that were never written down.
