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
  archived_at      timestamptz,     -- null = active; set = archived (soft delete)
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
  targeting_tier   text not null default 'prime_target', -- prime_target | intel_only | low_signal
  tier_reasoning   text,                                 -- one-line model rationale; null for legacy rows
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
-- Prospect updates (check-for-updates blurb history)
-- One row per "Check for Updates" run that found relevant intel.
-- Sorted descending — freshest intel on top. Never overwrites the original brief.
-- ─────────────────────────────────────────
create table prospect_updates (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid references prospects(id) on delete cascade not null,
  user_id      uuid references auth.users not null,
  summary      text not null,          -- 2–3 sentence blurb: what changed and why it matters
  news_items   jsonb default '[]',     -- {date, text, source, url}[] new items found; sorted desc
  created_at   timestamptz default now()
);
alter table prospect_updates enable row level security;
create policy "Users access updates via prospect"
  on prospect_updates for all
  using (exists (
    select 1 from prospects p
    where p.id = prospect_id and p.user_id = auth.uid()
  ));

-- ─────────────────────────────────────────
-- Case studies (admin-managed shared library)
-- Slide images stored in Supabase Storage bucket: case-study-slides (PRIVATE)
-- Bucket must be created manually in Supabase dashboard before import route is used.
-- ─────────────────────────────────────────
create table case_studies (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  company_name     text,
  industry         text,
  company_size     text,                    -- "Enterprise" | "Mid-market" | "SMB"
  pain_solved      text,
  product_used     text,
  outcome          text,                    -- 2–3 sentence result summary
  tags             text[] default '{}',
  slide_image_path text,                    -- Supabase Storage path — e.g. "{id}.png"
  source_deck      text,                    -- original PDF filename (provenance)
  created_at       timestamptz default now()
);
alter table case_studies enable row level security;

-- All authenticated users can read (needed by prospect matching + export)
create policy "Authenticated users can read case studies"
  on case_studies for select
  using (auth.role() = 'authenticated');
-- No client writes — admin routes use service role only

-- ─────────────────────────────────────────
-- Team config (singleton — one row for the whole team)
-- Admin-managed. Stores ordered lists of targeting options (preset + custom).
-- Research route reads from here; no per-rep targeting override.
-- ─────────────────────────────────────────
create table team_config (
  id                uuid primary key default gen_random_uuid(),
  seniority_bands   jsonb not null default '[]',  -- string[] ordered preset + custom
  target_functions  jsonb not null default '[]',  -- string[] ordered preset + custom
  updated_at        timestamptz default now()
);
alter table team_config enable row level security;

-- All authenticated users can read (needed by setup page + research route)
create policy "Authenticated users can read team config"
  on team_config for select
  using (auth.role() = 'authenticated');
-- No client writes — admin routes use service role only

-- ─────────────────────────────────────────
-- Storage bucket: case-study-slides
-- Run these steps in Supabase dashboard (Storage → New bucket):
--   1. Name: case-study-slides
--   2. Public: OFF (private — signed URLs only)
--   3. File size limit: 20MB per file
-- No SQL equivalent — buckets are created via Supabase dashboard or Management API.
-- ─────────────────────────────────────────

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
create index on prospect_updates   (prospect_id, created_at desc);
create index on case_studies       (created_at asc);
create index on team_config        (updated_at desc);

-- ═════════════════════════════════════════
-- CELord — Shared platform tables
-- Shared across ProspectLord and CELord.
-- All writes go through API routes (service role).
-- RLS allows authenticated reads only.
-- ═════════════════════════════════════════

-- ─────────────────────────────────────────
-- Organizations
-- ─────────────────────────────────────────
create table organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  domain                 text,
  org_type               text not null default 'unknown',  -- end_user | integrator | vendor | training_provider | unknown
  industry               text,
  approx_size            text,                             -- Enterprise | Mid-market | SMB
  customer_status        text not null default 'unknown',  -- unknown | prospect | active_customer | former_customer | failed_enterprise_conversion | do_not_contact | irrelevant | lead_created_in_crm
  customer_status_source text,                             -- csv_import | crm_sync | manual
  customer_status_at     timestamptz,
  parent_org_id          uuid references organizations(id),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);
alter table organizations enable row level security;
create policy "Authenticated users can read organizations"
  on organizations for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- Signals (raw evidence from collectors)
-- ─────────────────────────────────────────
create table signals (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,         -- github | shodan | jobs | forum | stackoverflow | conference
  source_url     text not null,
  snippet        text not null,
  org_hint       text not null,         -- raw org name/domain before entity resolution
  org_domain     text,                  -- domain extracted from signal (if any)
  country        text,
  state_province text,
  signal_date    timestamptz,           -- date of the underlying artifact
  collected_at   timestamptz default now()
);
alter table signals enable row level security;
create policy "Authenticated users can read signals"
  on signals for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- Signal links (org ↔ signal with provenance)
-- ─────────────────────────────────────────
create table signal_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references organizations(id) on delete cascade not null,
  signal_id  uuid references signals(id) on delete cascade not null,
  confidence numeric(3,2) not null default 1.0,  -- 0.00–1.00
  method     text not null,                       -- domain_exact | fuzzy_name | llm_assisted | manual
  created_at timestamptz default now(),
  unique (org_id, signal_id)
);
alter table signal_links enable row level security;
create policy "Authenticated users can read signal links"
  on signal_links for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- Locations (billing HQ, offices, signal origins)
-- Territory filters match against billing_hq rows.
-- ─────────────────────────────────────────
create table locations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references organizations(id) on delete cascade not null,
  label          text not null,  -- billing_hq | office | signal_origin
  country        text not null,
  state_province text,
  city           text,
  created_at     timestamptz default now()
);
alter table locations enable row level security;
create policy "Authenticated users can read locations"
  on locations for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- Enrichment runs (LLM enrichment cache)
-- Keyed by org + run date. Haiku 4.5 first pass;
-- Sonnet 4.6 re-run for high-value orgs (post-v0).
-- ─────────────────────────────────────────
create table enrichment_runs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid references organizations(id) on delete cascade not null,
  model              text not null,
  billing_hq_country text,
  billing_hq_state   text,
  billing_hq_city    text,
  org_type           text,
  parent_org_name    text,
  confidence         numeric(3,2) not null default 0.50,
  ran_at             timestamptz default now()
);
alter table enrichment_runs enable row level security;
create policy "Authenticated users can read enrichment runs"
  on enrichment_runs for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- Org status history
-- Tracks every status change for re-engagement targeting.
-- failed_enterprise_conversion orgs with fresh CE signals are
-- prime re-engagement candidates.
-- ─────────────────────────────────────────
create table org_status_history (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references organizations(id) on delete cascade not null,
  status     text not null,  -- matches customer_status values
  source     text not null,  -- csv_import | crm_sync | manual | celord_signal
  note       text,
  changed_at timestamptz default now()
);
alter table org_status_history enable row level security;
create policy "Authenticated users can read org status history"
  on org_status_history for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- CELord indexes
-- ─────────────────────────────────────────
create index on organizations      (customer_status, updated_at desc);
create index on organizations      (domain) where domain is not null;
create index on signals            (source, collected_at desc);
create index on signals            (country, state_province);
create index on signal_links       (org_id, signal_id);
create index on signal_links       (signal_id);
create index on locations          (org_id, label);
create index on enrichment_runs    (org_id, ran_at desc);
create index on org_status_history (org_id, changed_at desc);

-- ═════════════════════════════════════════
-- Migration: Session 3 enrichment expansion
-- Run in Supabase SQL editor (safe to run once — columns may already exist if re-run).
-- ═════════════════════════════════════════
alter table enrichment_runs
  add column if not exists industry   text,
  add column if not exists approx_size text;  -- Enterprise | Mid-market | SMB | unknown
