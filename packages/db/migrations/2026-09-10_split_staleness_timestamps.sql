-- Migration: separate "when was the brief built" from "when did we last scan
-- for news". Run once in the Supabase SQL editor. Safe to rerun.
--
-- prospects.last_refreshed_at was written by BOTH /api/research (a full brief
-- rebuild) and /api/check-updates (a news scan). One column, two very different
-- facts, and no way to tell which had happened. The only place it surfaced was
-- a hover tooltip reading "Last checked <date>" — which was wrong half the time,
-- since the date might mean the brief was rebuilt, not checked.
--
-- After this:
--   last_refreshed_at — the brief. Written ONLY by /api/research.
--   last_checked_at   — the news scan. Written ONLY by /api/check-updates.
--
-- A rep deciding whether to trust a brief on a call needs the first one. A rep
-- deciding whether to scan again needs the second.

begin;

alter table prospects
  add column if not exists last_checked_at timestamptz;

-- Backfill: a prospect with update blurbs has been checked, and the newest
-- blurb is when. Prospects that were only ever researched keep NULL here —
-- correctly, since they have never been checked.
update prospects p
   set last_checked_at = u.latest
  from (
    select prospect_id, max(created_at) as latest
      from prospect_updates
     group by prospect_id
  ) u
 where u.prospect_id = p.id
   and p.last_checked_at is null;

commit;

-- ── Why the UI does not read last_refreshed_at ──────────────────────────────
-- Existing last_refreshed_at values are unreliable: for any prospect checked
-- more recently than it was researched, the column holds the CHECK date. That
-- makes a brief look FRESHER than it is — the dangerous direction for a
-- staleness indicator, since a rep would trust a stale brief on a call. It is
-- not repairable, because the two events were never distinguished.
--
-- So the UI reads prospect_briefs.created_at instead, which is the moment that
-- brief row was actually written and is therefore correct for every existing
-- prospect with no backfill at all. last_refreshed_at stays as a prospect-level
-- convenience and becomes accurate going forward, now that only /api/research
-- writes it.
--
-- last_checked_at earns its place separately: check-updates that finds nothing
-- writes no blurb, so "we looked yesterday and there was nothing new" is
-- otherwise invisible. The backfill above recovers it only where a blurb
-- exists; checks that found nothing are lost, which is acceptable.
--
-- Verify:
--   select
--     count(*) filter (where last_refreshed_at is not null) as researched,
--     count(*) filter (where last_checked_at   is not null) as checked
--   from prospects;
