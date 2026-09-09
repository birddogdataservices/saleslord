-- Migration: staged research — split the monolithic research call into
-- rep-triggered stages. See docs/prospectlord/STAGED-RESEARCH.md.
-- Run once in the Supabase SQL editor. Safe to rerun — all steps are guarded.
--
-- Stage 1 (company + fit) runs when the rep adds a prospect. Stage 2 (decision
-- makers) runs only when the rep asks for it. Nothing chains automatically.

begin;

-- ── Stage 1: the fit verdict the rep gates on ───────────────────────────────
-- {verdict, rationale, budget_signal, what_would_change_it}. Null on every
-- brief written before this migration; the UI renders the card only when set.
alter table prospect_briefs
  add column if not exists fit jsonb;

-- ── Stage 2 completion marker ───────────────────────────────────────────────
-- NULL = the decision-maker stage has never run for this prospect.
-- Set even when zero people were found, so "we looked and found nobody" is
-- distinguishable from "we never looked" — otherwise the rep is invited to pay
-- for the same empty answer over and over.
--
-- Lives on prospects, not prospect_briefs, deliberately: re-running stage 1
-- replaces the brief row, and decision makers should survive that. News
-- changing does not change who works there. decision_makers is already keyed to
-- prospect_id, so this is consistent with what was already true.
alter table prospects
  add column if not exists dm_researched_at timestamptz;

-- ── Per-rep override for the daily call guard ───────────────────────────────
-- NULL = use the DAILY_CALL_LIMIT env default (50). Set per rep to override.
-- The limit is a runaway guard, not a budget: BYOK means each rep pays their
-- own card, so this exists only so a retry loop cannot make unbounded calls.
alter table rep_profiles
  add column if not exists daily_call_limit integer;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Prospects that already have decision makers were researched under the old
-- monolith. Mark stage 2 complete so established accounts show their list
-- instead of inviting the rep to pay for research that already ran.
--
-- Prospects with a brief but no decision makers are deliberately left NULL:
-- under the monolith that meant the model found none, and offering a dedicated,
-- better-sourced retry is the right thing to put in front of the rep.
update prospects p
   set dm_researched_at = coalesce(p.last_refreshed_at, p.created_at, now())
 where p.dm_researched_at is null
   and exists (select 1 from decision_makers d where d.prospect_id = p.id);

commit;

-- ── Verification ────────────────────────────────────────────────────────────
-- Should show every prospect that has decision makers now marked complete,
-- and none marked complete without them:
--
--   select
--     count(*) filter (where dm_researched_at is not null) as stage2_done,
--     count(*) filter (where dm_researched_at is null)     as stage2_pending
--   from prospects;
--
--   select count(*) as should_be_zero
--   from prospects p
--   where p.dm_researched_at is null
--     and exists (select 1 from decision_makers d where d.prospect_id = p.id);
