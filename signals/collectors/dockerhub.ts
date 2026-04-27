import type { Collector, RawSignal } from './types'

// Docker Hub collector — no API key required.
// Searches public Docker Hub repos mentioning "pentaho" and emits signals for
// namespaces (orgs or users) that published images with meaningful pull counts.
// Org extraction: Docker Hub org/user profile → company + profile_url.
export const dockerhubCollector: Collector = async (_config) => {
  return runDockerHubSearch()
}

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

// Skip vendor namespaces — they publish Pentaho, not use it.
const VENDOR_NAMESPACES = new Set([
  'pentaho', 'hitachivantara', 'hitachivantaraeap', 'hitachi',
  'bitnami',  // packages software, not end users
])

// Skip repos whose description suggests non-production usage.
const NOISE_RE = /\b(tutorial|demo|poc|proof[ -]of[ -]concept|example|test|sample|learning|practice|exercise|playground|workshop|template|boilerplate|course)\b/i

const MIN_PULL_COUNT   = 100
const MAX_PAGES        = 10   // 1000 results max from search
const MIN_LAST_UPDATED = '2023-01-01T00:00:00.000Z'

// ─────────────────────────────────────────
// Docker Hub API types
// ─────────────────────────────────────────

interface SearchResult {
  repo_name:         string   // "namespace/name" or "name" for official
  short_description: string
  pull_count:        number
  star_count:        number
  is_official:       boolean
  // Note: last_updated is NOT returned by the search endpoint — fetched in Phase 1.5
}

interface RepoDetail {
  last_updated: string   // "2024-03-15T10:23:45.123456Z" — actual last image push
}

interface SearchPage {
  count:    number
  next:     string | null
  results:  SearchResult[]
}

interface HubProfile {
  full_name?:   string
  company?:     string
  location?:    string
  profile_url?: string
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

const PERSONAL_DOMAINS = new Set([
  'github.com', 'github.io', 'gitlab.com', 'linkedin.com',
  'twitter.com', 'x.com', 'facebook.com', 'medium.com',
  'wordpress.com', 'blogspot.com', 'blogger.com',
])

function extractDomain(url: string | undefined): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (!hostname.includes('.')) return null
    if (PERSONAL_DOMAINS.has(hostname)) return null
    if ([...PERSONAL_DOMAINS].some(d => hostname.endsWith(`.${d}`))) return null
    return hostname
  } catch {
    return null
  }
}

// Duplicated from github.ts / stackoverflow.ts — package-in-waiting discipline.
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
])
const CA_PROVINCES = new Set([
  'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT',
])

function parseLocation(raw: string | null): { country: string | null; stateProvince: string | null } {
  if (!raw) return { country: null, stateProvince: null }
  const upper = raw.toUpperCase()
  const isUSA    = /\b(USA|UNITED STATES|U\.S\.A?\.?)\b/.test(upper)
  const isCanada = /\bCANADA\b/.test(upper)
  for (const part of raw.split(',').map(p => p.trim())) {
    const abbr = part.toUpperCase().replace(/\.$/, '')
    if (US_STATES.has(abbr))    return { country: 'US', stateProvince: abbr }
    if (CA_PROVINCES.has(abbr)) return { country: 'CA', stateProvince: abbr }
  }
  if (isUSA)    return { country: 'US', stateProvince: null }
  if (isCanada) return { country: 'CA', stateProvince: null }
  return { country: null, stateProvince: null }
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

async function runDockerHubSearch(): Promise<RawSignal[]> {
  // Phase 1: paginate search, collect qualifying repos by namespace
  type RepoEntry = { repoName: string; pullCount: number; description: string; lastUpdated: string | null }
  const byNamespace = new Map<string, RepoEntry[]>()

  for (let page = 1; page <= MAX_PAGES; page++) {
    await sleep(300)
    const url = `https://hub.docker.com/v2/search/repositories/?query=pentaho&page_size=100&page=${page}`
    let resp: Response
    try { resp = await fetch(url) }
    catch (err) { console.error('[CELord/dockerhub] Search fetch error', { page, err }); break }

    if (!resp.ok) {
      console.error('[CELord/dockerhub] Search HTTP', resp.status, { page })
      break
    }

    const data = await resp.json() as SearchPage

    for (const r of data.results) {
      if (r.is_official)                 continue   // pentaho/pentaho etc.
      if (r.pull_count < MIN_PULL_COUNT) continue
      if (NOISE_RE.test(r.short_description)) continue

      const slash = r.repo_name.indexOf('/')
      if (slash < 0) continue   // official images have no namespace
      const namespace = r.repo_name.slice(0, slash).toLowerCase()

      if (VENDOR_NAMESPACES.has(namespace)) continue

      if (!byNamespace.has(namespace)) byNamespace.set(namespace, [])
      byNamespace.get(namespace)!.push({
        repoName:    r.repo_name,
        pullCount:   r.pull_count,
        description: r.short_description,
        lastUpdated: null,   // filled in Phase 1.5
      })
    }

    console.info(`[CELord/dockerhub] Page ${page} — ${data.results.length} results, ${byNamespace.size} namespaces so far`)

    if (!data.next) break
  }

  console.info(`[CELord/dockerhub] Phase 1 — ${byNamespace.size} unique namespaces`)

  if (byNamespace.size === 0) return []

  // Phase 1.5: fetch repo detail for each qualifying repo to get last_updated,
  // then filter out repos not updated since MIN_LAST_UPDATED.
  // The search endpoint does not return last_updated — only /v2/repositories/{ns}/{repo} does.
  for (const [namespace, repos] of byNamespace) {
    for (let i = repos.length - 1; i >= 0; i--) {
      const repo = repos[i]
      const [, repoName] = repo.repoName.split('/')
      await sleep(100)
      try {
        const resp = await fetch(
          `https://hub.docker.com/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repoName)}`
        )
        if (resp.ok) {
          const detail = await resp.json() as RepoDetail
          if (detail.last_updated < MIN_LAST_UPDATED) {
            repos.splice(i, 1)   // drop — too old
          } else {
            repos[i] = { ...repo, lastUpdated: detail.last_updated }
          }
        }
        // If fetch fails, keep the repo (fail open)
      } catch {
        // keep on error
      }
    }
    if (repos.length === 0) byNamespace.delete(namespace)
  }

  const reposAfterDateFilter = [...byNamespace.values()].reduce((n, r) => n + r.length, 0)
  console.info(`[CELord/dockerhub] Phase 1.5 — ${reposAfterDateFilter} repos after date filter (cutoff ${MIN_LAST_UPDATED.slice(0, 10)})`)

  if (byNamespace.size === 0) return []

  // Phase 2: fetch org/user profile for each namespace
  const profileCache = new Map<string, HubProfile>()

  for (const namespace of byNamespace.keys()) {
    await sleep(200)
    let profile: HubProfile | null = null

    // Try org endpoint first
    try {
      const resp = await fetch(`https://hub.docker.com/v2/orgs/${encodeURIComponent(namespace)}`)
      if (resp.ok) {
        profile = await resp.json() as HubProfile
      } else if (resp.status !== 404) {
        console.warn('[CELord/dockerhub] Org profile HTTP', resp.status, { namespace })
      }
    } catch (err) {
      console.warn('[CELord/dockerhub] Org profile error', { namespace, err })
    }

    // Fall back to user endpoint
    if (!profile) {
      try {
        const resp = await fetch(`https://hub.docker.com/v2/users/${encodeURIComponent(namespace)}`)
        if (resp.ok) {
          profile = await resp.json() as HubProfile
        }
      } catch {
        // ok — will use namespace as org_hint
      }
    }

    profileCache.set(namespace, profile ?? {})
  }

  console.info(`[CELord/dockerhub] Phase 2 — ${profileCache.size} profiles fetched`)

  // Phase 3: flatten + sort by pull count descending, then emit signals
  type FlatRepo = RepoEntry & { namespace: string }
  const flatRepos: FlatRepo[] = []
  for (const [namespace, repos] of byNamespace) {
    for (const repo of repos) flatRepos.push({ ...repo, namespace })
  }
  flatRepos.sort((a, b) => b.pullCount - a.pullCount)

  const signals: RawSignal[] = []
  const collectedAt = new Date().toISOString()

  for (const repo of flatRepos) {
    const profile   = profileCache.get(repo.namespace) ?? {}
    const orgDomain = extractDomain(profile.profile_url)
    const orgHint   = profile.company?.trim() || profile.full_name?.trim() || repo.namespace
    const { country, stateProvince } = parseLocation(profile.location ?? null)

    const pullsLabel = repo.pullCount >= 1_000_000
      ? `${(repo.pullCount / 1_000_000).toFixed(1)}M pulls`
      : repo.pullCount >= 1_000
      ? `${Math.round(repo.pullCount / 1_000)}k pulls`
      : `${repo.pullCount} pulls`

    const updatedLabel = repo.lastUpdated
      ? `, updated ${repo.lastUpdated.slice(0, 7)}`  // "YYYY-MM"
      : ''

    const snippetParts = [`${repo.repoName} (${pullsLabel}${updatedLabel})`]
    if (repo.description) snippetParts.push(repo.description.slice(0, 120))
    const snippet = snippetParts.join(' — ')

    signals.push({
      source:         'docker',
      source_url:     `https://hub.docker.com/r/${repo.repoName}`,
      snippet,
      org_hint:       orgHint,
      org_domain:     orgDomain,
      country,
      state_province: stateProvince,
      signal_date:    repo.lastUpdated ?? null,
      collected_at:   collectedAt,
    })
  }

  console.info(`[CELord/dockerhub] Phase 3 — ${signals.length} signals from ${byNamespace.size} namespaces`)
  return signals
}
