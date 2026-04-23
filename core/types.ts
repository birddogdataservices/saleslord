// Shared domain model — package-in-waiting for packages/core at Stage 2.
// No imports from app/(app)/, app/(celord)/, components/, or lib/.
// No Supabase client imports — pass clients as dependencies.

export type OrgType =
  | 'end_user'
  | 'integrator'
  | 'vendor'
  | 'training_provider'
  | 'unknown'

export type CustomerStatus =
  | 'unknown'
  | 'prospect'
  | 'active_customer'
  | 'former_customer'
  | 'failed_enterprise_conversion'
  | 'do_not_contact'

export type SignalSource =
  | 'github'
  | 'shodan'
  | 'jobs'
  | 'forum'
  | 'stackoverflow'
  | 'conference'

export type ResolutionMethod =
  | 'domain_exact'
  | 'fuzzy_name'
  | 'llm_assisted'
  | 'manual'

// ── DB row types ──────────────────────────────────────────────────────────────

export type Organization = {
  id: string
  name: string
  domain: string | null
  org_type: OrgType
  industry: string | null
  approx_size: 'Enterprise' | 'Mid-market' | 'SMB' | null
  customer_status: CustomerStatus
  customer_status_source: string | null
  customer_status_at: string | null
  parent_org_id: string | null
  created_at: string
  updated_at: string
}

export type Signal = {
  id: string
  source: SignalSource
  source_url: string
  snippet: string
  org_hint: string        // raw org name/domain before resolution
  org_domain: string | null
  country: string | null
  state_province: string | null
  signal_date: string | null
  collected_at: string
}

export type SignalLink = {
  id: string
  org_id: string
  signal_id: string
  confidence: number      // 0.00–1.00
  method: ResolutionMethod
  created_at: string
}

export type Location = {
  id: string
  org_id: string
  label: 'billing_hq' | 'office' | 'signal_origin'
  country: string
  state_province: string | null
  city: string | null
  created_at: string
}

export type EnrichmentRun = {
  id: string
  org_id: string
  model: string
  billing_hq_country: string | null
  billing_hq_state: string | null
  billing_hq_city: string | null
  org_type: OrgType | null
  parent_org_name: string | null
  confidence: number
  ran_at: string
}

export type OrgStatusHistory = {
  id: string
  org_id: string
  status: CustomerStatus
  source: string
  note: string | null
  changed_at: string
}
