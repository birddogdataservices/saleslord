import type { Collector, RawSignal } from './types'

// Returns GITHUB_FIXTURES when no token is configured.
// Swap: when config.githubToken is present, replace the early-return with
// real GitHub code search API calls (search/code?q=extension:ktr+extension:kjb).
export const githubCollector: Collector = async (config) => {
  if (!config.githubToken) return GITHUB_FIXTURES
  // TODO: implement real GitHub code search
  return GITHUB_FIXTURES
}

const now = new Date().toISOString()

const GITHUB_FIXTURES: RawSignal[] = [
  {
    source: 'github',
    source_url: 'https://github.com/MaricopaCountyIT/etl-pipelines/tree/main/jobs',
    snippet: 'Repository contains 47 .ktr transformation files and 12 .kjb job files for data warehouse loads. Last commit 3 weeks ago.',
    org_hint: 'Maricopa County IT',
    org_domain: 'maricopa.gov',
    country: 'US',
    state_province: 'AZ',
    signal_date: '2026-04-01',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/GeisingerHealth/data-platform/blob/main/pom.xml',
    snippet: 'pom.xml includes pentaho-kettle dependency version 9.3.0.0-428 in data integration module.',
    org_hint: 'Geisinger Health System',
    org_domain: 'geisinger.edu',
    country: 'US',
    state_province: 'PA',
    signal_date: '2026-03-18',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/pge-data-team/spde-etl/blob/main/README.md',
    snippet: 'SPDE ETL framework built on Pentaho Data Integration CE 9.1. Contains carte.sh cluster configuration for 4-node deployment.',
    org_hint: 'Pacific Gas and Electric',
    org_domain: 'pge.com',
    country: 'US',
    state_province: 'CA',
    signal_date: '2026-02-10',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/AmFamInsurance/dw-transforms/blob/dev/kettle/load_claims.ktr',
    snippet: 'Pentaho Kettle transformation for claims data warehouse load. Uses PDI step DatabaseLookup against Oracle source.',
    org_hint: 'American Family Insurance',
    org_domain: 'amfam.com',
    country: 'US',
    state_province: 'WI',
    signal_date: '2026-01-29',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/CdASD-it/reporting-etl/blob/main/jobs/nightly_sync.kjb',
    snippet: 'Nightly sync job file (.kjb) for student information system reporting. Pentaho 9.x CE.',
    org_hint: 'Coeur d\'Alene School District',
    org_domain: null,
    country: 'US',
    state_province: 'ID',
    signal_date: '2025-11-04',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/AustinEnergyIT/mdm-pipeline/blob/main/transforms/meter_agg.ktr',
    snippet: 'Meter data management transformation pipeline using Pentaho PDI. 23 .ktr files in transforms/ directory.',
    org_hint: 'Austin Energy',
    org_domain: 'austinenergy.com',
    country: 'US',
    state_province: 'TX',
    signal_date: '2025-09-12',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/MeadJohnsonNutrition/supply-chain-bi/blob/main/etl/pdi_jobs/daily_load.kjb',
    snippet: 'Supply chain BI ETL using Pentaho Data Integration. References CE server at internal hostname.',
    org_hint: 'Mead Johnson Nutrition',
    org_domain: 'meadjohnson.com',
    country: 'US',
    state_province: 'IL',
    signal_date: '2025-07-20',
    collected_at: now,
  },
]
