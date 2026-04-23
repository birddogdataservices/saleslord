import type { Collector, RawSignal } from './types'

// GitHub Code Search collector.
// Returns GITHUB_FIXTURES when no token is configured (stub-first pattern).
// With a token: searches for .ktr/.kjb files and pom.xml pentaho-kettle deps.
// Rate limit: 30 req/min authenticated — sleep 2.1s between requests.
export const githubCollector: Collector = async (config) => {
  if (!config.githubToken) return GITHUB_FIXTURES
  return runGitHubSearch(config.githubToken)
}

// ─────────────────────────────────────────
// Noise filters
// ─────────────────────────────────────────

const VENDOR_OWNERS = new Set([
  'pentaho', 'hitachivantara', 'webdetails', 'pentaho-community',
  'mdamour1976', 'wgorman', 'rfellows', 'ppatricio',
])

const NOISE_REPO_RE = /\b(tutorial|example|demo|sample|training|course|workshop|learn|how[-_]?to|guide|practice|book|template)\b/i

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface GHItem {
  html_url: string
  name: string
  repository: {
    full_name: string
    html_url: string
    fork: boolean
    owner: { login: string; type: string }
    description: string | null
  }
}

interface GHSearchResponse {
  total_count: number
  items: GHItem[]
}

interface RepoAccumulator {
  fullName: string
  ownerLogin: string
  htmlUrl: string
  description: string | null
  ktrCount: number
  kjbCount: number
  pomCount: number
}

// ─────────────────────────────────────────
// Real implementation
// ─────────────────────────────────────────

const QUERIES = [
  { q: 'extension:ktr NOT fork:true', field: 'ktrCount' },
  { q: 'extension:kjb NOT fork:true', field: 'kjbCount' },
  { q: 'pentaho-kettle filename:pom.xml', field: 'pomCount' },
] as const

async function runGitHubSearch(token: string): Promise<RawSignal[]> {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CELord-Signal-Collector/1.0',
  }

  const repoMap = new Map<string, RepoAccumulator>()

  for (const { q, field } of QUERIES) {
    for (let page = 1; page <= 2; page++) {
      await sleep(2100) // stay under 30 req/min

      let resp: Response
      try {
        resp = await fetch(
          `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=30&page=${page}`,
          { headers },
        )
      } catch {
        break
      }

      if (resp.status === 403 || resp.status === 429) {
        const resetAt = Number(resp.headers.get('X-RateLimit-Reset') ?? '0') * 1000
        const waitMs = Math.max(0, resetAt - Date.now()) + 1000
        await sleep(Math.min(waitMs, 65_000))
        break
      }
      if (!resp.ok) break

      const remaining = Number(resp.headers.get('X-RateLimit-Remaining') ?? '10')
      if (remaining < 3) await sleep(65_000)

      const data = await resp.json() as GHSearchResponse

      for (const item of data.items) {
        const repo = item.repository
        if (repo.fork) continue
        if (VENDOR_OWNERS.has(repo.owner.login.toLowerCase())) continue
        if (NOISE_REPO_RE.test(repo.full_name)) continue

        const acc = repoMap.get(repo.full_name)
        if (acc) {
          acc[field]++
        } else {
          repoMap.set(repo.full_name, {
            fullName: repo.full_name,
            ownerLogin: repo.owner.login,
            htmlUrl: repo.html_url,
            description: repo.description,
            ktrCount: field === 'ktrCount' ? 1 : 0,
            kjbCount: field === 'kjbCount' ? 1 : 0,
            pomCount: field === 'pomCount' ? 1 : 0,
          })
        }
      }

      if (data.items.length < 30) break
    }
  }

  const now = new Date().toISOString()
  return Array.from(repoMap.values()).map((repo): RawSignal => ({
    source: 'github',
    source_url: repo.htmlUrl,
    snippet: buildSnippet(repo),
    org_hint: repo.ownerLogin,
    org_domain: null,
    country: null,
    state_province: null,
    signal_date: null,
    collected_at: now,
  }))
}

function buildSnippet(repo: RepoAccumulator): string {
  const pdiCount = repo.ktrCount + repo.kjbCount
  const parts: string[] = []
  if (pdiCount > 0) parts.push(`${pdiCount} PDI file${pdiCount !== 1 ? 's' : ''} (.ktr/.kjb)`)
  if (repo.pomCount > 0) parts.push('pentaho-kettle Maven dependency')
  const desc = repo.description ? ` — ${repo.description}` : ''
  return `Repository ${repo.fullName} contains ${parts.join(' and ')}${desc}`
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

// ─────────────────────────────────────────
// Fixtures (used when no GITHUB_TOKEN)
// ─────────────────────────────────────────

const now = new Date().toISOString()

const GITHUB_FIXTURES: RawSignal[] = [
  {
    source: 'github',
    source_url: 'https://github.com/MaricopaCountyIT/etl-pipelines',
    snippet: 'Repository MaricopaCountyIT/etl-pipelines contains 47 PDI files (.ktr/.kjb) — ETL pipelines for county data warehouse loads.',
    org_hint: 'MaricopaCountyIT',
    org_domain: 'maricopa.gov',
    country: 'US',
    state_province: 'AZ',
    signal_date: '2026-04-01',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/GeisingerHealth/data-platform',
    snippet: 'Repository GeisingerHealth/data-platform contains pentaho-kettle Maven dependency — data integration module.',
    org_hint: 'GeisingerHealth',
    org_domain: 'geisinger.edu',
    country: 'US',
    state_province: 'PA',
    signal_date: '2026-03-18',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/pge-data-team/spde-etl',
    snippet: 'Repository pge-data-team/spde-etl contains 12 PDI files (.ktr/.kjb) — SPDE ETL framework built on Pentaho Data Integration CE 9.1.',
    org_hint: 'Pacific Gas and Electric',
    org_domain: 'pge.com',
    country: 'US',
    state_province: 'CA',
    signal_date: '2026-02-10',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/AmFamInsurance/dw-transforms',
    snippet: 'Repository AmFamInsurance/dw-transforms contains 8 PDI files (.ktr/.kjb) — claims data warehouse ETL using Pentaho Kettle.',
    org_hint: 'American Family Insurance',
    org_domain: 'amfam.com',
    country: 'US',
    state_province: 'WI',
    signal_date: '2026-01-29',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/CdASD-it/reporting-etl',
    snippet: 'Repository CdASD-it/reporting-etl contains 3 PDI files (.ktr/.kjb) — student information system reporting, Pentaho 9.x CE.',
    org_hint: "Coeur d'Alene School District",
    org_domain: null,
    country: 'US',
    state_province: 'ID',
    signal_date: '2025-11-04',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/AustinEnergyIT/mdm-pipeline',
    snippet: 'Repository AustinEnergyIT/mdm-pipeline contains 23 PDI files (.ktr/.kjb) — meter data management transformation pipeline using Pentaho PDI.',
    org_hint: 'Austin Energy',
    org_domain: 'austinenergy.com',
    country: 'US',
    state_province: 'TX',
    signal_date: '2025-09-12',
    collected_at: now,
  },
  {
    source: 'github',
    source_url: 'https://github.com/MeadJohnsonNutrition/supply-chain-bi',
    snippet: 'Repository MeadJohnsonNutrition/supply-chain-bi contains 5 PDI files (.ktr/.kjb) and pentaho-kettle Maven dependency — supply chain BI ETL.',
    org_hint: 'Mead Johnson Nutrition',
    org_domain: 'meadjohnson.com',
    country: 'US',
    state_province: 'IL',
    signal_date: '2025-07-20',
    collected_at: now,
  },
]
