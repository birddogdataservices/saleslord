import type { Collector, RawSignal } from './types'

// Shodan host search collector.
// Returns SHODAN_FIXTURES when no API key is configured (stub-first pattern).
// With a key: queries Shodan for Pentaho User Console login pages.
// Free-tier note: 1 page (100 results) per query. Upgrade to Freelancer ($70/mo)
// to unlock pagination and additional query credits.
export const shodanCollector: Collector = async (config) => {
  if (!config.shodanApiKey) return SHODAN_FIXTURES
  return runShodanSearch(config.shodanApiKey)
}

// ─────────────────────────────────────────
// Noise filters
// ─────────────────────────────────────────

// Cloud/hosting providers — the ASN org won't be the actual customer.
// For these, we fall back to PTR hostname for org identification.
const CLOUD_PROVIDER_RE = /amazon|amazonaws|google|microsoft|azure|digitalocean|linode|vultr|hetzner|rackspace|cloudflare|fastly|akamai|ovhcloud|leaseweb|choopa|softlayer|ibm cloud/i

const VENDOR_ORG_RE = /pentaho|hitachi|webdetails/i

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface ShodanHost {
  ip_str: string
  hostnames: string[]
  org: string
  isp: string
  port: number
  location: {
    country_code: string | null
    country_name: string | null
    region_code: string | null
    city: string | null
  }
  http?: {
    title?: string
    server?: string
  }
}

interface ShodanSearchResult {
  total: number
  matches: ShodanHost[]
}

// ─────────────────────────────────────────
// Real implementation
// ─────────────────────────────────────────

// Primary query: Pentaho User Console login page title (most specific fingerprint).
// Secondary query can be added when Shodan credits allow:
//   'http.html:"/pentaho/Home"' — catches servers that redirect before showing title.
const PRIMARY_QUERY = 'http.title:"Pentaho User Console"'

async function runShodanSearch(apiKey: string): Promise<RawSignal[]> {
  let resp: Response
  try {
    resp = await fetch(
      `https://api.shodan.io/shodan/host/search?key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(PRIMARY_QUERY)}&page=1`,
    )
  } catch {
    return SHODAN_FIXTURES
  }

  if (!resp.ok) return SHODAN_FIXTURES

  const data = await resp.json() as ShodanSearchResult
  const now = new Date().toISOString()

  return data.matches
    .filter(host => !VENDOR_ORG_RE.test(host.org))
    .map((host): RawSignal => {
      const domain = extractDomain(host.hostnames)
      const isCloud = CLOUD_PROVIDER_RE.test(host.org)
      const orgHint = isCloud
        ? (domain ? domainToName(domain) : host.org)
        : host.org

      return {
        source: 'shodan',
        source_url: `https://www.shodan.io/host/${host.ip_str}`,
        snippet: buildSnippet(host),
        org_hint: orgHint,
        org_domain: domain,
        country: host.location.country_code ?? null,
        state_province: host.location.region_code ?? null,
        signal_date: null,
        collected_at: now,
      }
    })
}

// Extract the registrable domain (e.g. 'company.com') from a list of PTR hostnames.
function extractDomain(hostnames: string[]): string | null {
  if (!hostnames.length) return null
  // Pick the first hostname with at least two parts
  for (const h of hostnames) {
    const parts = h.replace(/\.$/, '').split('.')
    if (parts.length >= 2) return parts.slice(-2).join('.')
  }
  return null
}

// 'company.com' → 'Company'
function domainToName(domain: string): string {
  const label = domain.split('.')[0]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function buildSnippet(host: ShodanHost): string {
  const parts: string[] = []
  if (host.http?.title) parts.push(`Title: ${host.http.title}`)
  if (host.http?.server) parts.push(`Server: ${host.http.server}`)
  parts.push(`Port: ${host.port}`)
  if (host.hostnames?.length) parts.push(`PTR: ${host.hostnames[0]}`)
  parts.push(`ASN org: ${host.org}`)
  return parts.join(' | ')
}

// ─────────────────────────────────────────
// Fixtures (used when no SHODAN_API_KEY)
// ─────────────────────────────────────────

const _now = new Date().toISOString()

const SHODAN_FIXTURES: RawSignal[] = [
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/198.51.100.42',
    snippet: 'Title: Pentaho User Console | Server: Apache-Coyote/1.1 | Port: 8080 | PTR: etl-prod.maricopa.gov | ASN org: Maricopa County',
    org_hint: 'Maricopa County',
    org_domain: 'maricopa.gov',
    country: 'US',
    state_province: 'AZ',
    signal_date: '2026-04-10',
    collected_at: _now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/203.0.113.77',
    snippet: 'Title: Pentaho User Console | Port: 8080 | PTR: pdi.intermountain.net | ASN org: Intermountain Health',
    org_hint: 'Intermountain Health',
    org_domain: 'intermountain.net',
    country: 'US',
    state_province: 'UT',
    signal_date: '2026-04-08',
    collected_at: _now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/192.0.2.155',
    snippet: 'Title: Pentaho User Console | Server: Apache-Coyote/1.1 | Port: 9090 | PTR: pge-etl-prod.pge.com | ASN org: Pacific Gas and Electric',
    org_hint: 'Pacific Gas and Electric',
    org_domain: 'pge.com',
    country: 'US',
    state_province: 'CA',
    signal_date: '2026-03-29',
    collected_at: _now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/198.51.100.201',
    snippet: 'Title: Pentaho User Console | Port: 8080 | PTR: etl.manitobahydro.com | ASN org: Manitoba Hydro',
    org_hint: 'Manitoba Hydro',
    org_domain: 'manitobahydro.com',
    country: 'CA',
    state_province: 'MB',
    signal_date: '2026-04-05',
    collected_at: _now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/203.0.113.98',
    snippet: 'Title: Pentaho User Console | Port: 8080 | PTR: pdi.dteedison.com | ASN org: DTE Energy',
    org_hint: 'DTE Energy',
    org_domain: 'dte-energy.com',
    country: 'US',
    state_province: 'MI',
    signal_date: '2026-03-14',
    collected_at: _now,
  },
]
