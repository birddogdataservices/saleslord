// ─────────────────────────────────────────
// Database row types — keep in sync with supabase/schema.sql
// ─────────────────────────────────────────

// Shared product definition — lives in the `products` table, admin-managed
export type Product = {
  id: string           // DB-generated UUID
  name: string
  description: string
  value_props: string
  competitors: string
  created_by: string   // user_id of the admin who created it
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
  revenue:    StatCard | null
  headcount:  StatCard | null
  open_roles: StatCard | null
  stage:      StatCard | null
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
  email: EmailDraft | null
  created_at: string
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
