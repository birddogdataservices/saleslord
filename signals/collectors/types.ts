// Collector interface — package-in-waiting for packages/signals at Stage 2.
// No imports from app code. Supabase client passed as dependency when needed.

import type { SignalSource } from '@/core/types'

// Pre-DB signal emitted by collectors before entity resolution.
export type RawSignal = {
  source: SignalSource
  source_url: string
  snippet: string
  org_hint: string            // raw org name from the signal source
  org_domain: string | null   // domain if extractable (e.g. from email/URL)
  country: string | null
  state_province: string | null
  signal_date: string | null  // ISO date of the underlying artifact
  collected_at: string        // ISO datetime of collection run
}

export type CollectorConfig = {
  githubToken?: string
  serpApiKey?: string
  adzunaAppId?: string
  adzunaAppKey?: string
  stackoverflowApiKey?: string
}

export type Collector = (config: CollectorConfig) => Promise<RawSignal[]>
