import type { Collector, RawSignal } from './types'

// Returns JOBS_FIXTURES when no API key is configured.
// Swap: when config.serpApiKey or Adzuna keys are present, replace the early-return
// with real job search API calls. Queries: "Pentaho", "Kettle ETL",
// "Pentaho Data Integration", "PDI developer".
// Job signals decay faster than other sources (half-weight at 6 months).
export const jobsCollector: Collector = async (config) => {
  if (!config.serpApiKey && (!config.adzunaAppId || !config.adzunaAppKey)) {
    return JOBS_FIXTURES
  }
  // TODO: implement real job search (SerpApi or Adzuna)
  return JOBS_FIXTURES
}

const now = new Date().toISOString()

const JOBS_FIXTURES: RawSignal[] = [
  {
    source: 'jobs',
    source_url: 'https://www.linkedin.com/jobs/view/3987641022',
    snippet: 'Senior ETL Developer — Maricopa County, Phoenix AZ. Required: Pentaho Data Integration (PDI/Kettle) 5+ years. Experience with Pentaho CE in production environment preferred.',
    org_hint: 'Maricopa County',
    org_domain: 'maricopa.gov',
    country: 'US',
    state_province: 'AZ',
    signal_date: '2026-04-03',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://careers.intermountainhealth.org/jobs/data-engineer-pdi',
    snippet: 'Data Integration Engineer — Intermountain Health, Salt Lake City UT. Must have hands-on Pentaho PDI (Kettle) experience. Will maintain and extend existing CE-based ETL infrastructure.',
    org_hint: 'Intermountain Health',
    org_domain: 'intermountainhealth.org',
    country: 'US',
    state_province: 'UT',
    signal_date: '2026-03-28',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://jobs.amfam.com/etl-developer-2026',
    snippet: 'ETL Developer — American Family Insurance, Madison WI. Technologies: Pentaho Kettle, Oracle Data Integrator. Experience migrating Pentaho CE workflows strongly preferred.',
    org_hint: 'American Family Insurance',
    org_domain: 'amfam.com',
    country: 'US',
    state_province: 'WI',
    signal_date: '2026-04-11',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://jobs.cityofcolumbus.gov/data-engineer',
    snippet: 'Data Engineer — City of Columbus, Columbus OH. Current stack includes Pentaho PDI for all nightly ETL processes. Candidate will support and extend existing Pentaho CE deployment.',
    org_hint: 'City of Columbus',
    org_domain: 'columbus.gov',
    country: 'US',
    state_province: 'OH',
    signal_date: '2026-03-19',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://www.linkedin.com/jobs/view/4011982745',
    snippet: 'BI/ETL Developer — Blue Cross Blue Shield of Minnesota, Eagan MN. Required skills include Pentaho Data Integration. Experience with Pentaho CE ETL pipelines in healthcare data environment.',
    org_hint: 'Blue Cross Blue Shield of Minnesota',
    org_domain: 'bluecrossmn.com',
    country: 'US',
    state_province: 'MN',
    signal_date: '2026-04-07',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://jobs.sha.sk.ca/data-integration-specialist',
    snippet: 'Data Integration Specialist — Saskatchewan Health Authority, Regina SK. Maintain existing Pentaho Kettle ETL environment supporting provincial health data warehouse. PDI CE experience required.',
    org_hint: 'Saskatchewan Health Authority',
    org_domain: 'sha.sk.ca',
    country: 'CA',
    state_province: 'SK',
    signal_date: '2026-03-25',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://careers.wpsic.com/etl-developer',
    snippet: 'ETL Developer — WPS Insurance, Green Bay WI. Pentaho PDI (Kettle) experience required. Will develop and maintain PDI transformations and jobs for insurance data warehouse.',
    org_hint: 'WPS Insurance',
    org_domain: 'wpsic.com',
    country: 'US',
    state_province: 'WI',
    signal_date: '2026-02-14',
    collected_at: now,
  },
  {
    source: 'jobs',
    source_url: 'https://careers.transalta.com/data-engineer-calgary',
    snippet: 'Data Engineer — TransAlta Corporation, Calgary AB. Experience with Pentaho Data Integration (CE or EE). Will build and maintain ETL processes for energy trading and generation reporting.',
    org_hint: 'TransAlta Corporation',
    org_domain: 'transalta.com',
    country: 'CA',
    state_province: 'AB',
    signal_date: '2026-01-30',
    collected_at: now,
  },
]
