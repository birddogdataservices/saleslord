import type { Collector, RawSignal } from './types'

// GitHub Code Search collector.
// Requires GITHUB_TOKEN — returns [] when not configured.
// Rate limit: 30 req/min authenticated — sleep 2.1s between requests.
export const githubCollector: Collector = async (config) => {
  if (!config.githubToken) return []
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
// Quality filters
// ─────────────────────────────────────────

// Repos not pushed to since this date are treated as stale (> ~4 years old).
const FRESHNESS_CUTOFF = '2021-01-01T00:00:00Z'

// Repos smaller than this (in KB) are likely toy / placeholder projects.
const MIN_REPO_SIZE_KB = 10

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

interface GHRepoMeta {
  pushed_at: string       // ISO timestamp of last push
  size: number            // repo size in KB
  stargazers_count: number
}

interface GHOwnerMeta {
  name: string | null     // display name ("Maricopa County IT")
  location: string | null // free-text ("Phoenix, AZ, USA")
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
  { q: 'extension:ktr NOT fork:true size:>500', field: 'ktrCount' },   // >500 bytes = non-trivial
  { q: 'extension:kjb NOT fork:true size:>500', field: 'kjbCount' },
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
      } catch (err) {
        console.error('[CELord/github] Network error', { query: q, page, err })
        break
      }

      if (resp.status === 403 || resp.status === 429) {
        const resetAt = Number(resp.headers.get('X-RateLimit-Reset') ?? '0') * 1000
        const waitMs = Math.max(0, resetAt - Date.now()) + 1000
        console.warn('[CELord/github] Rate limit hit — sleeping', { query: q, page, status: resp.status, waitMs })
        await sleep(Math.min(waitMs, 65_000))
        break
      }
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        console.error('[CELord/github] HTTP error', { query: q, page, status: resp.status, body: body.slice(0, 300) })
        break
      }

      const remaining = Number(resp.headers.get('X-RateLimit-Remaining') ?? '10')
      if (remaining < 3) await sleep(65_000)

      const data = await resp.json() as GHSearchResponse

      for (const item of data.items) {
        const repo = item.repository
        if (repo.fork) continue
        if (repo.owner.type !== 'Organization') continue
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

  // ── Fetch repo + owner metadata ───────────────────────────────────────────────
  // Repos API has a 5000/hr rate limit (vs 30/min for code search) — no sleep needed.
  // Owner profiles are cached — one call per unique owner, not per repo.

  const ownerCache = new Map<string, GHOwnerMeta>()
  const signals: RawSignal[] = []
  const collectedAt = new Date().toISOString()

  for (const repo of repoMap.values()) {
    const meta = await fetchRepoMeta(repo.fullName, headers)

    if (meta) {
      if (meta.pushed_at < FRESHNESS_CUTOFF) {
        console.info(`[CELord/github] Skipping stale repo: ${repo.fullName} (last pushed ${meta.pushed_at.slice(0, 10)})`)
        continue
      }
      if (meta.size < MIN_REPO_SIZE_KB) {
        console.info(`[CELord/github] Skipping tiny repo: ${repo.fullName} (${meta.size}KB)`)
        continue
      }
    }

    // Fetch owner profile (cached per login)
    if (!ownerCache.has(repo.ownerLogin)) {
      ownerCache.set(repo.ownerLogin, await fetchOwnerMeta(repo.ownerLogin, headers))
    }
    const owner = ownerCache.get(repo.ownerLogin)!

    const { country, stateProvince } = parseLocation(owner.location)

    signals.push({
      source: 'github',
      source_url: repo.htmlUrl,
      snippet: buildSnippet(repo, meta ?? null, owner),
      org_hint: owner.name ?? repo.ownerLogin,
      org_domain: null,
      country,
      state_province: stateProvince,
      signal_date: meta?.pushed_at ?? null,
      collected_at: collectedAt,
    })
  }

  return signals
}

async function fetchRepoMeta(fullName: string, headers: Record<string, string>): Promise<GHRepoMeta | null> {
  try {
    const resp = await fetch(`https://api.github.com/repos/${fullName}`, { headers })
    if (!resp.ok) return null
    const data = await resp.json() as { pushed_at: string; size: number; stargazers_count: number }
    return { pushed_at: data.pushed_at, size: data.size, stargazers_count: data.stargazers_count }
  } catch {
    return null
  }
}

async function fetchOwnerMeta(login: string, headers: Record<string, string>): Promise<GHOwnerMeta> {
  try {
    const resp = await fetch(`https://api.github.com/users/${login}`, { headers })
    if (!resp.ok) return { name: null, location: null }
    const data = await resp.json() as { name: string | null; location: string | null }
    return { name: data.name || null, location: data.location || null }
  } catch {
    return { name: null, location: null }
  }
}

// ── Location parsing ──────────────────────────────────────────────────────────
// GitHub location is free-text. Parse common patterns for US states and CA provinces.

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])

const CA_PROVINCES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'])

function parseLocation(raw: string | null): { country: string | null; stateProvince: string | null } {
  if (!raw) return { country: null, stateProvince: null }

  const upper = raw.toUpperCase()

  // Look for explicit country markers
  const isCanada  = /\bCANADA\b/.test(upper) || /\bCA\b/.test(raw.split(',').pop()?.trim() ?? '')
  const isUSA     = /\b(USA|UNITED STATES|U\.S\.A?\.?)\b/.test(upper)

  // Extract two-letter abbreviations from comma-separated parts (e.g. "Chicago, IL" or "Toronto, ON, Canada")
  const parts = raw.split(',').map(p => p.trim())
  for (const part of parts) {
    const abbr = part.toUpperCase().replace(/\.$/, '')
    if (US_STATES.has(abbr)) return { country: 'US', stateProvince: abbr }
    if (CA_PROVINCES.has(abbr)) return { country: 'CA', stateProvince: abbr }
  }

  // Fallback: country only
  if (isUSA)    return { country: 'US', stateProvince: null }
  if (isCanada) return { country: 'CA', stateProvince: null }

  return { country: null, stateProvince: null }
}

function buildSnippet(repo: RepoAccumulator, meta: GHRepoMeta | null, owner: GHOwnerMeta): string {
  const pdiCount = repo.ktrCount + repo.kjbCount
  const parts: string[] = []
  if (pdiCount > 0) parts.push(`${pdiCount} PDI file${pdiCount !== 1 ? 's' : ''} (.ktr/.kjb)`)
  if (repo.pomCount > 0) parts.push('pentaho-kettle Maven dep')

  const meta_parts: string[] = []
  if (meta) {
    meta_parts.push(`last updated ${meta.pushed_at.slice(0, 10)}`)
    const sizeStr = meta.size >= 1024 ? `${(meta.size / 1024).toFixed(1)} MB` : `${meta.size} KB`
    meta_parts.push(sizeStr)
    if (meta.stargazers_count > 0) meta_parts.push(`★${meta.stargazers_count}`)
  }

  const location = owner.location ? ` | ${owner.location}` : ''
  const desc = repo.description ? ` — ${repo.description}` : ''
  const metaStr = meta_parts.length > 0 ? ` (${meta_parts.join(', ')})` : ''

  return `Repository ${repo.fullName} contains ${parts.join(' and ')}${metaStr}${location}${desc}`
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

