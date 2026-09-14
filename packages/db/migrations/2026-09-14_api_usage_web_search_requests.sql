-- Migration: record web searches in the cost ledger. Run once in the Supabase
-- SQL editor. Safe to rerun.
--
-- Anthropic bills the server-side web search tool at $10 per 1,000 searches, ON
-- TOP of tokens. api_usage only ever recorded tokens, so cost_usd — the monthly
-- spend badge, the per-job cost in the sidebar, and the figure a rep is handed
-- after every run — has under-reported research, decision-makers and
-- check-updates. The one measured run (check-updates on California, 2026-09-13)
-- recorded $0.26 against a real ~$0.35: nine searches the ledger never saw.
--
-- After this, api_usage.web_search_requests holds the raw count per call, and
-- cost_usd includes it (lib/utils.ts calculateCost, via lib/api-usage.ts
-- logUsage). The count is stored raw rather than only folded into cost_usd, so
-- rows stay re-pricable if the per-search rate changes and search volume can be
-- read per route.
--
-- NULLABLE ON PURPOSE. NULL means "not recorded", which is true of:
--   - every row written before this migration, and
--   - CELord's enrichment rows, which insert into api_usage directly instead of
--     going through logUsage — and whose enrichment can also run web search.
-- A default of 0 would assert "this call made no searches" for rows where
-- nobody knows. That is the mislabelled-figure failure the research prompt
-- spends a paragraph forbidding. ProspectLord routes always write an explicit
-- number, 0 included.

begin;

alter table api_usage
  add column if not exists web_search_requests integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'api_usage_web_search_requests_nonneg'
  ) then
    alter table api_usage
      add constraint api_usage_web_search_requests_nonneg
      check (web_search_requests is null or web_search_requests >= 0);
  end if;
end $$;

commit;

-- ── No backfill, and historical cost_usd stays understated ──────────────────
-- Search counts were never captured, so there is nothing to backfill from.
-- Existing rows keep their token-only cost_usd. The monthly spend badge will
-- read low for the month this ships in and be accurate from the next.
--
-- ── Deploy order: this migration FIRST, then the code ───────────────────────
-- The column is nullable, so the currently deployed code keeps working once
-- this has run. The reverse order is not safe: an insert that names a missing
-- column fails, and api_usage rows also feed the daily runaway guard
-- (checkDailyLimit counts them). Local dev writes to this same Supabase
-- project, so run it before testing the new code on localhost as well.
--
-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'api_usage' and column_name = 'web_search_requests';
--
--   -- after the first search route runs on the new code:
--   select endpoint, web_search_requests, cost_usd, created_at
--     from api_usage
--    order by created_at desc
--    limit 5;
