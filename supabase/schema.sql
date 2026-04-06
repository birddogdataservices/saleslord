-- SalesLord — Supabase schema
-- Run in Supabase SQL editor in order. Enable RLS on all tables after creation.

-- ─────────────────────────────────────────
-- Rep profiles (one row per user)
-- ─────────────────────────────────────────
create table rep_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null unique,
  -- Legacy single-product fields (kept for backward compat — no longer used by app)
  product_name        text default '',
  product_description text default '',
  value_props         text default '',
  competitors         text default '',
  -- Current fields
  icp_description     text default '',
  rep_background      text default '',
  voice_samples       text default '',
  products            jsonb default '[]', -- deprecated: replaced by shared products table
  is_admin            boolean default false, -- grants access to /admin/* and product management
  anthropic_api_key   text,              -- per-user BYOK; required to run research/email — no platform fallback
  stripe_customer_id  text,              -- stubbed: populated when Stripe billing is wired
  updated_at          timestamptz default now()
);
alter table rep_profiles enable row level security;
create policy "Users manage own profile"
  on rep_profiles for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Access control — allowed users
-- ─────────────────────────────────────────
-- Seed this table with emails before sharing the app.
-- Middleware checks this table for users who don't match the primary domain.
create table allowed_emails (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  note       text,                      -- e.g. "contractor", "guest"
  created_at timestamptz default now()
);
alter table allowed_emails enable row level security;
-- Only service role (API routes) can read this — not client
-- No select policy = no client access

-- ─────────────────────────────────────────
-- Prospects
-- ─────────────────────────────────────────
create table prospects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  name             text not null,
  query            text not null,
  created_at       timestamptz default now(),
  last_refreshed_at timestamptz,
  unique (user_id, query)           -- required for ON CONFLICT upsert in research route
);
alter table prospects enable row level security;
create policy "Users manage own prospects"
  on prospects for all using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Prospect briefs (one active per prospect)
-- ─────────────────────────────────────────
create table prospect_briefs (
  id             uuid primary key default gen_random_uuid(),
  prospect_id    uuid references prospects on delete cascade not null,
  snapshot       text,
  initiatives    jsonb default '[]',    -- string[]
  pain_signals   jsonb default '[]',    -- string[]
  tech_signals   jsonb default '[]',    -- string[]
  news           jsonb default '[]',    -- {date, text, source, url}[] sorted desc — never re-sort client-side
  outreach_angle text,
  stats          jsonb,                 -- {revenue, headcount, open_roles, stage} each {value, context}
  timing         jsonb,                 -- {fy_end, recommended_outreach_window, window_status, reasoning}
  email          jsonb,                 -- {subject, body}
  created_at     timestamptz default now()
);
alter table prospect_briefs enable row level security;
create policy "Users access briefs via prospect"
  on prospect_briefs for all
  using (exists (
    select 1 from prospects p
    where p.id = prospect_id and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────
-- Decision makers
-- ─────────────────────────────────────────
create table decision_makers (
  id               uuid primary key default gen_random_uuid(),
  prospect_id      uuid references prospects on delete cascade not null,
  name             text,
  title            text,
  role             text,                -- champion | economic_buyer | gatekeeper | end_user | influencer | custom
  role_label       text,                -- display label; supports custom names
  avatar_initials  text,
  avatar_color_bg  text,
  avatar_color_text text,
  cares_about      text,
  suggested_angle  text,
  sort_order       integer default 0,
  created_at       timestamptz default now()
);
alter table decision_makers enable row level security;
create policy "Users access decision makers via prospect"
  on decision_makers for all
  using (exists (
    select 1 from prospects p
    where p.id = prospect_id and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────
-- Prospect notes (log)
-- ─────────────────────────────────────────
create table prospect_notes (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid references prospects on delete cascade not null,
  text        text not null,
  state       text,                     -- e.g. 'IL', 'CA'
  industry    text,                     -- e.g. 'fintech', 'data-infra'
  created_at  timestamptz default now()
);
alter table prospect_notes enable row level security;
create policy "Users access notes via prospect"
  on prospect_notes for all
  using (exists (
    select 1 from prospects p
    where p.id = prospect_id and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────
-- Follow-up touches
-- ─────────────────────────────────────────
create table follow_ups (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid references prospects on delete cascade not null,
  touch_num   integer not null,
  reason      text not null,            -- why now — required, must be >= 10 words
  subject     text,
  body        text,
  created_at  timestamptz default now()
);
alter table follow_ups enable row level security;
create policy "Users access follow-ups via prospect"
  on follow_ups for all
  using (exists (
    select 1 from prospects p
    where p.id = prospect_id and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────
-- API usage tracking (cost recovery)
-- ─────────────────────────────────────────
create table api_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  prospect_id   uuid references prospects on delete set null,  -- null for cron runs
  endpoint      text not null,          -- 'research' | 'follow-up' | 'refresh' | 'cron'
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd      numeric(10,6) not null default 0,
  created_at    timestamptz default now()
);
alter table api_usage enable row level security;
-- Users can read their own usage (for the "my usage" UI badge)
create policy "Users view own usage"
  on api_usage for select using (auth.uid() = user_id);
-- Inserts happen only via service role key in API routes — no client insert policy

-- ─────────────────────────────────────────
-- Shared products (admin-managed, all reps read)
-- ─────────────────────────────────────────
create table products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text default '',
  value_props text default '',
  competitors text default '',
  created_by  uuid references auth.users not null,
  created_at  timestamptz default now()
);
alter table products enable row level security;

-- All authenticated users can read
create policy "All users read products"
  on products for select
  using (auth.uid() is not null);

-- Only admins can write (is_admin checked on rep_profiles)
create policy "Admins insert products"
  on products for insert
  with check (
    exists (select 1 from rep_profiles where user_id = auth.uid() and is_admin = true)
  );
create policy "Admins update products"
  on products for update
  using (
    exists (select 1 from rep_profiles where user_id = auth.uid() and is_admin = true)
  );
create policy "Admins delete products"
  on products for delete
  using (
    exists (select 1 from rep_profiles where user_id = auth.uid() and is_admin = true)
  );

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
create index on products           (created_at asc);
create index on prospects          (user_id, created_at desc);
create index on prospect_notes     (prospect_id, created_at desc);
create index on follow_ups         (prospect_id, touch_num asc);
create index on decision_makers    (prospect_id, sort_order asc);
create index on api_usage          (user_id, created_at desc);
create index on api_usage          (user_id, created_at desc) where endpoint != 'cron';
