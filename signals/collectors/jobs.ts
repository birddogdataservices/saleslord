import type { Collector, RawSignal } from './types'

// Job postings collector — SerpApi (Google Jobs) with Adzuna as fallback.
// Returns [] when no API keys are configured.
export const jobsCollector: Collector = async (config) => {
  if (config.serpApiKey) return runSerpApi(config.serpApiKey)
  if (config.adzunaAppId && config.adzunaAppKey) {
    return runAdzuna(config.adzunaAppId, config.adzunaAppKey)
  }
  return []
}

// ─────────────────────────────────────────
// Noise filters
// ─────────────────────────────────────────

// Staffing agency / job aggregator names where company_name is the agency, not the employer.
// These orgs use Pentaho to staff for clients, not in their own infrastructure.
const STAFFING_AGENCY_RE = /randstad|manpower|adecco|kelly|robert half|insight global|tech mahindra|tcs|wipro|infosys|cognizant|capgemini|accenture|hcl|staffing|recruitment|recruiting|talent solutions/i

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface SerpApiJob {
  title: string
  company_name: string
  location: string
  description: string
  via?: string
  detected_extensions?: {
    posted_at?: string
    work_from_home?: boolean
  }
  apply_options?: Array<{ title: string; link: string }>
  job_id?: string
}

interface SerpApiResponse {
  jobs_results?: SerpApiJob[]
  error?: string
}

interface AdzunaJob {
  title: string
  company: { display_name: string }
  location: {
    display_name: string
    area: string[]
  }
  description: string
  redirect_url: string
  created: string
}

interface AdzunaResponse {
  results?: AdzunaJob[]
}

// ─────────────────────────────────────────
// SerpApi implementation
// ─────────────────────────────────────────

const SERPAPI_QUERIES = [
  'Pentaho Data Integration developer',
  'Pentaho Kettle ETL',
  'PDI Kettle developer',
]

async function runSerpApi(apiKey: string): Promise<RawSignal[]> {
  const signals: RawSignal[] = []
  const seen = new Set<string>()

  for (const q of SERPAPI_QUERIES) {
    let resp: Response
    try {
      resp = await fetch(
        `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(apiKey)}&num=10`,
      )
    } catch (err) {
      console.error('[CELord/jobs/serpapi] Network error', { query: q, err })
      continue
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      console.error('[CELord/jobs/serpapi] HTTP error', { query: q, status: resp.status, body: body.slice(0, 300) })
      if (resp.status === 429) console.warn('[CELord/jobs/serpapi] Quota exhausted — consider adding Adzuna as fallback')
      continue
    }

    const data = await resp.json() as SerpApiResponse
    if (data.error) {
      console.error('[CELord/jobs/serpapi] API error', { query: q, error: data.error })
      continue
    }
    if (!data.jobs_results?.length) continue

    const now = new Date().toISOString()

    for (const job of data.jobs_results) {
      if (STAFFING_AGENCY_RE.test(job.company_name)) continue

      const key = `${job.company_name.toLowerCase()}|${job.title.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)

      const applyUrl = job.apply_options?.[0]?.link
      const sourceUrl = applyUrl ?? `https://www.google.com/search?q=${encodeURIComponent(`${job.title} ${job.company_name} site:linkedin.com OR site:indeed.com`)}`

      const { country, stateProvince } = parseJobLocation(job.location)

      signals.push({
        source: 'jobs',
        source_url: sourceUrl,
        snippet: `${job.title} at ${job.company_name}, ${job.location}: ${job.description.slice(0, 300)}`,
        org_hint: job.company_name,
        org_domain: null,
        country,
        state_province: stateProvince,
        signal_date: parsePostedAt(job.detected_extensions?.posted_at),
        collected_at: now,
      })
    }
  }

  return signals
}

// ─────────────────────────────────────────
// Adzuna implementation
// ─────────────────────────────────────────

const ADZUNA_QUERIES = ['pentaho data integration', 'pentaho kettle']
const ADZUNA_COUNTRIES = ['us', 'ca', 'gb']

async function runAdzuna(appId: string, appKey: string): Promise<RawSignal[]> {
  const signals: RawSignal[] = []
  const seen = new Set<string>()

  for (const country of ADZUNA_COUNTRIES) {
    for (const q of ADZUNA_QUERIES) {
      let resp: Response
      try {
        resp = await fetch(
          `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&what=${encodeURIComponent(q)}&results_per_page=20&content-type=application/json`,
        )
      } catch (err) {
        console.error('[CELord/jobs/adzuna] Network error', { query: q, country, err })
        continue
      }

      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        console.error('[CELord/jobs/adzuna] HTTP error', { query: q, country, status: resp.status, body: body.slice(0, 300) })
        if (resp.status === 429) console.warn('[CELord/jobs/adzuna] Quota exhausted')
        continue
      }

      const data = await resp.json() as AdzunaResponse
      if (!data.results?.length) continue

      const now = new Date().toISOString()

      for (const job of data.results) {
        const companyName = job.company.display_name
        if (STAFFING_AGENCY_RE.test(companyName)) continue

        const key = `${companyName.toLowerCase()}|${job.title.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)

        // Adzuna area: ['US', 'Arizona', 'Phoenix'] or ['GB', 'London']
        const area = job.location.area
        const countryCode = area[0] ?? null
        const stateName = area[1] ?? null
        const stateProvince = stateName ? STATE_NAME_TO_CODE[stateName] ?? stateName : null

        signals.push({
          source: 'jobs',
          source_url: job.redirect_url,
          snippet: `${job.title} at ${companyName}, ${job.location.display_name}: ${job.description.slice(0, 300)}`,
          org_hint: companyName,
          org_domain: null,
          country: countryCode,
          state_province: stateProvince,
          signal_date: job.created.slice(0, 10),
          collected_at: now,
        })
      }
    }
  }

  return signals
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

// Parse SerpApi location string: "Phoenix, AZ" → {country: 'US', stateProvince: 'AZ'}
function parseJobLocation(location: string): { country: string | null; stateProvince: string | null } {
  if (!location || location.toLowerCase() === 'remote') return { country: null, stateProvince: null }

  // "City, ST, Country" or "City, ST" or "City, Province, Canada"
  const parts = location.split(',').map(p => p.trim())

  if (parts.length >= 3) {
    const countryPart = parts[parts.length - 1]
    const statePart = parts[parts.length - 2]
    if (/^canada$/i.test(countryPart)) return { country: 'CA', stateProvince: PROVINCE_NAME_TO_CODE[statePart] ?? statePart }
    if (/^united kingdom|uk$/i.test(countryPart)) return { country: 'GB', stateProvince: null }
    if (/^australia$/i.test(countryPart)) return { country: 'AU', stateProvince: null }
    // Default: US
    return { country: 'US', stateProvince: statePart.length === 2 ? statePart : null }
  }

  if (parts.length === 2) {
    const second = parts[1]
    if (second.length === 2 && /^[A-Z]{2}$/.test(second)) {
      // US state abbreviation
      return { country: 'US', stateProvince: second }
    }
    if (PROVINCE_NAME_TO_CODE[second] || /^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/.test(second)) {
      return { country: 'CA', stateProvince: PROVINCE_NAME_TO_CODE[second] ?? second }
    }
  }

  return { country: 'US', stateProvince: null }
}

// Parse SerpApi "X days/weeks/months ago" to ISO date string
function parsePostedAt(postedAt: string | undefined): string | null {
  if (!postedAt) return null
  const match = postedAt.match(/(\d+)\s+(hour|day|week|month)s?\s+ago/i)
  if (!match) return null
  const n = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const d = new Date()
  if (unit === 'hour') d.setHours(d.getHours() - n)
  else if (unit === 'day') d.setDate(d.getDate() - n)
  else if (unit === 'week') d.setDate(d.getDate() - n * 7)
  else if (unit === 'month') d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  'Alberta': 'AB', 'British Columbia': 'BC', 'Manitoba': 'MB',
  'New Brunswick': 'NB', 'Newfoundland and Labrador': 'NL',
  'Nova Scotia': 'NS', 'Northwest Territories': 'NT', 'Nunavut': 'NU',
  'Ontario': 'ON', 'Prince Edward Island': 'PE', 'Quebec': 'QC',
  'Saskatchewan': 'SK', 'Yukon': 'YT',
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY',
  ...PROVINCE_NAME_TO_CODE,
}

