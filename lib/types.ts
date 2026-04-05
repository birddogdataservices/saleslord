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
  created_at: string
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

export type ApiUsage = {
  id: string
  user_id: string
  prospect_id: string | null
  endpoint: 'research' | 'follow-up' | 'refresh' | 'email' | 'cron'
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_at: string
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
}
