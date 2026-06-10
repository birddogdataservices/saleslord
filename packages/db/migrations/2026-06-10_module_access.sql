-- Migration: per-user module visibility (CELord / TerritoryLord tabs).
-- Run once in the Supabase SQL editor. Safe to rerun — all steps are guarded.
--
-- Default: every user sees ProspectLord only. Admins always see everything.
-- A row in module_access grants one user (keyed by email, like allowed_emails)
-- one gated module. Grants can be created before the user's first sign-in.

begin;

create table if not exists module_access (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  module     text not null,            -- 'celord' | 'territorylord' | future slugs
  granted_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (email, module)
);

alter table module_access enable row level security;

-- Users may read their own grants (ribbon rendering). All writes go through
-- admin API routes with the service role key — no client write policy.
drop policy if exists "Users read own module grants" on module_access;
create policy "Users read own module grants"
  on module_access for select
  using (lower(email) = lower(auth.email()));

-- Optional: existing users currently see all tabs. Uncomment to preserve that
-- by seeding grants for everyone who has already signed in. Leave commented
-- to start everyone (except admins) at ProspectLord-only.
-- insert into module_access (email, module)
-- select u.email, m.module
-- from auth.users u
-- cross join (values ('celord'), ('territorylord')) as m(module)
-- where u.email is not null
-- on conflict (email, module) do nothing;

commit;
