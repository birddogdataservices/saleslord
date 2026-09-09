// ─────────────────────────────────────────
// Org disambiguation (resolve route + dialog)
// ─────────────────────────────────────────

export type OrgCandidate = {
  name: string
  hq_region: string | null    // ISO 3166-2, e.g. 'US-CA' — matched against territories
  hq_display: string | null   // human-readable, e.g. 'Austin, TX'
  description: string         // one-liner: what they do + identifying detail
  disambiguated_query: string // enriched query passed to /api/research
  confidence: number          // 0.0–1.0; territory boost applied server-side before sort
}

// ─────────────────────────────────────────
// Database row types — keep in sync with supabase/schema.sql
// ─────────────────────────────────────────

// Product definition — lives in the `products` table, owned per-user.
// Every user must have at least one before ProspectLord pages unlock.
export type Product = {
  id: string           // DB-generated UUID
  user_id: string      // owner — RLS scopes all reads/writes to this user
  name: string
  description: string
  value_props: string
  competitors: string
  created_at: string
}

// Subset used when building prompts (no metadata needed)
export type ProductPromptContext = Pick<Product, 'name' | 'description' | 'value_props' | 'competitors'>

export type RepProfile = {
  id: string
  user_id: string
  // Legacy single-product fields — kept for backward compat, not used by app
  product_name: string
  product_description: string
  value_props: string
  competitors: string
  // Current fields
  icp_description: string
  rep_background: string
  voice_samples: string
  is_admin: boolean
  anthropic_api_key: string | null  // per-user BYOK — never sent to client as plaintext
  stripe_customer_id: string | null
  locale: string                    // BCP-47 — drives chrome + default generation language
  daily_call_limit: number | null   // null = DAILY_CALL_LIMIT env default (50); runaway guard, not a budget
  updated_at: string
}

export type Prospect = {
  id: string
  user_id: string
  name: string
  query: string
  created_at: string
  last_refreshed_at: string | null
  archived_at: string | null
  output_language_override: string | null  // BCP-47, nullable — sticky email/pitch language; null = use profile locale
  // Staged research: null = the decision-maker stage has never run for this
  // prospect. Set even when the stage ran and found nobody, so the UI can tell
  // "looked and found nobody" apart from "never looked".
  dm_researched_at: string | null
}

export type NewsItem = {
  date: string          // "Mon DD, YYYY" — always sorted desc, never re-sort client-side
  text: string
  source: string
  url: string
}

export type TimingData = {
  fy_end: string                                        // e.g. "January 31"
  recommended_outreach_window: string                   // e.g. "August–October"
  window_status: 'open' | 'approaching' | 'closed'
  reasoning: string
}

export type EmailDraft = {
  subject: string
  body: string
}

export type StatCard = {
  value: string    // e.g. "$3.4B", "~7,000", "47"
  context: string  // e.g. "+33% YoY", "14 in data / eng"
}

export type CompanyStats = {
  revenue:      StatCard | null
  headcount:    StatCard | null
  open_roles:   StatCard | null
  stage:        StatCard | null
  hq_location:  string | null   // e.g. "Atlanta, GA"
}

export type ProspectBrief = {
  id: string
  prospect_id: string
  snapshot: string | null
  initiatives: string[]
  pain_signals: string[]
  tech_signals: string[]
  news: NewsItem[]
  outreach_angle: string | null
  stats: CompanyStats | null
  timing: TimingData | null
  fit: FitVerdict | null      // stage 1 gate; null on briefs written before staging
  email: EmailDraft | null    // legacy — stage 1 no longer writes this; refresh-email owns it
  created_at: string
}

// ─────────────────────────────────────────
// Stage 1 fit verdict — what the rep gates the decision-maker stage on
// ─────────────────────────────────────────
// Deliberately excludes fiscal-year timing: timing answers "when", fit answers
// "whether". They are tracked separately (see TimingData) and mixing them
// produces a verdict that is really a calendar reading.
export type FitVerdict = {
  verdict: 'strong' | 'moderate' | 'weak'
  rationale: string              // which confirmed signals line up with which product capability
  budget_signal: string          // evidence they can fund it; 'Unknown' when nothing found
  what_would_change_it: string   // the single missing fact that would most move the verdict
}

export type DmRole = 'champion' | 'economic_buyer' | 'gatekeeper' | 'end_user' | 'influencer' | 'custom'

export type TargetingTier = 'prime_target' | 'intel_only' | 'low_signal'

export type DecisionMaker = {
  id: string
  prospect_id: string
  name: string | null
  title: string | null
  role: DmRole
  role_label: string
  avatar_initials: string
  avatar_color_bg: string
  avatar_color_text: string
  cares_about: string | null
  suggested_angle: string | null
  sort_order: number
  targeting_tier: TargetingTier   // prime_target | intel_only | low_signal; null rows treated as prime_target
  tier_reasoning: string | null   // one-line model rationale
  created_at: string
}

export type TeamConfig = {
  id: string
  seniority_bands: string[]   // ordered list — preset + custom
  target_functions: string[]  // ordered list — preset + custom
  updated_at: string
}

export type ProspectNote = {
  id: string
  prospect_id: string
  text: string
  state: string | null
  industry: string | null
  created_at: string
}

export type FollowUp = {
  id: string
  prospect_id: string
  touch_num: number
  reason: string
  subject: string | null
  body: string | null
  created_at: string
}

export type ProspectUpdate = {
  id: string
  prospect_id: string
  user_id: string
  summary: string        // 2–3 sentence blurb of what changed and why it matters
  news_items: NewsItem[] // new items found; same shape as brief news
  created_at: string
}

export type ApiUsage = {
  id: string
  user_id: string
  prospect_id: string | null
  endpoint: 'research' | 'follow-up' | 'refresh' | 'email' | 'cron' | 'check-updates' | 'case-study-match'
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_at: string
}

export type CaseStudy = {
  id: string
  title: string
  company_name: string | null
  industry: string | null
  company_size: string | null   // "Enterprise" | "Mid-market" | "SMB"
  pain_solved: string | null
  product_used: string | null
  outcome: string | null        // 2–3 sentence result summary
  tags: string[]
  slide_image_path: string | null  // Supabase Storage path — bucket: case-study-slides
  source_deck: string | null       // original PDF filename, for provenance
  created_at: string
}

// Returned by /api/case-studies/match — case study + relevance info merged
export type CaseStudyMatch = CaseStudy & {
  relevance_score: number
  match_reasons: string[]
}

// ─────────────────────────────────────────
// Composite view types used by the UI
// ─────────────────────────────────────────

// Full prospect view: everything needed to render the summary page
export type ProspectFull = Prospect & {
  brief: ProspectBrief | null
  decision_makers: DecisionMaker[]
  notes: ProspectNote[]
  follow_ups: FollowUp[]
}

// Sidebar item — lightweight, no brief content
export type ProspectSidebarItem = Pick<Prospect, 'id' | 'name' | 'last_refreshed_at'> & {
  window_status: TimingData['window_status'] | null
  fy_end: string | null
  archived_at: string | null
}

// ─────────────────────────────────────────
// Admin — allowlist invites
// ─────────────────────────────────────────

// Outcome of the invite email fired when an admin adds an allowlist entry.
// Three states, not a boolean: "already_registered" is a success — the person
// has an auth user (they signed in with Google, or were allowlisted before) so
// Supabase declines to invite them again, and nothing is wrong. Reporting that
// as a failure told admins to retry something that had already worked.
export type InviteStatus = 'sent' | 'already_registered' | 'failed'

// ─────────────────────────────────────────
// Jobs — AI job history (sidebar Jobs section)
// ─────────────────────────────────────────

export type JobKind = 'research' | 'email_draft' | 'pitch_opener' | 'check_updates' | 'case_study_match'

export type Job = {
  id: string
  prospect_id: string | null
  company_name: string
  kind: JobKind
  status: 'running' | 'success' | 'failed'
  error: string | null
  cost_usd: number | null
  started_at: string
  finished_at: string | null
}
