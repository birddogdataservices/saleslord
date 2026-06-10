-- Migration: jobs table — AI job history for the ProspectLord sidebar.
-- Run once in the Supabase SQL editor. Safe to rerun — all steps are guarded.
--
-- One row per AI action (research, email draft, update check, case study
-- match). Inserted as 'running' when the route starts the AI work, finalized
-- with status/cost/finished_at when the route returns. Rows for requests that
-- failed validation (rate limit, missing key) are deleted, not kept as failures.

begin;

create table if not exists jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users not null,
  prospect_id  uuid references prospects on delete set null,
  company_name text not null,
  kind         text not null,              -- research | email_draft | check_updates | case_study_match
  status       text not null default 'running',  -- running | success | failed
  error        text,
  cost_usd     numeric,
  started_at   timestamptz default now(),
  finished_at  timestamptz
);

alter table jobs enable row level security;

-- Users read their own job history (sidebar polling). All writes go through
-- API routes with the service role key — no client write policy.
drop policy if exists "Users read own jobs" on jobs;
create policy "Users read own jobs"
  on jobs for select using (auth.uid() = user_id);

create index if not exists jobs_user_started_idx
  on jobs (user_id, started_at desc);

commit;
