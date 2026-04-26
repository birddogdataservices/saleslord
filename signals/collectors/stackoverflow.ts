import type { Collector, RawSignal } from './types'

// Stack Exchange API collector — no key needed (300 req/day/IP), optional key for 10k/day.
// Searches Stack Overflow for recent Pentaho/Kettle questions + answers (last 36 months).
//
// Org extraction — four paths in priority order:
//   A. website_url  → company domain  (domain_exact resolution, 0.90 confidence)
//   B. about_me     → employer mention regex (fuzzy resolution, 0.60–0.75)
//   C. question/answer body → employer mention regex (same)
//   D. fallback     → display_name as org_hint (creates a person-named org row;
//                     enrichment will classify it; rep can mark irrelevant)
export const stackoverflowCollector: Collector = async (config) => {
  return runStackOverflowSearch(config.stackoverflowApiKey)
}

// ─────────────────────────────────────────
// Noise filters
// ─────────────────────────────────────────

const PERSONAL_DOMAINS = new Set([
  'github.com', 'github.io', 'gitlab.com', 'gitlab.io',
  'linkedin.com', 'twitter.com', 'x.com', 'facebook.com',
  'medium.com', 'wordpress.com', 'blogspot.com', 'blogger.com',
  'tumblr.com', 'substack.com', 'hashnode.dev', 'dev.to',
  'youtube.com', 'twitch.tv', 'instagram.com',
  'stackoverflow.com', 'stackexchange.com',
  'gravatar.com', 'about.me',
])

const VENDOR_DOMAINS = new Set([
  'pentaho.com', 'hitachivantara.com', 'webdetails.pt',
  'clearpeaks.com', 'stratebi.com',
])

const SEARCH_TAGS          = ['pentaho', 'pentaho-kettle', 'pentaho-pdi', 'pentaho-cde']
const WINDOW_DAYS          = 365 * 3   // 36 months
const MAX_ACTIVITIES_PER_USER = 3
const MAX_PAGES_PER_TAG       = 2
const QUOTA_SAFETY_THRESHOLD  = 10

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

interface SOQuestion {
  question_id:   number
  title:         string
  tags:          string[]
  creation_date: number
  body?:         string
  owner: { user_id?: number; display_name: string; user_type?: string }
}

interface SOAnswer {
  answer_id:    number
  question_id:  number
  creation_date: number
  body?:        string
  owner: { user_id?: number; display_name: string; user_type?: string }
}

interface SOUser {
  user_id:      number
  display_name: string
  location?:    string
  website_url?: string
  about_me?:    string
}

interface SOWrapper<T> {
  items:           T[]
  has_more:        boolean
  quota_remaining: number
}

type Activity = {
  source_url:    string
  title:         string
  tags:          string[]
  creation_date: number
  body:          string | null
}

// ─────────────────────────────────────────
// Filter management
// ─────────────────────────────────────────

let aboutMeFilterString: string | null = null

async function getAboutMeFilter(keyParam: string): Promise<string | null> {
  if (aboutMeFilterString) return aboutMeFilterString
  try {
    const resp = await fetch(
      `https://api.stackexchange.com/2.3/filters/create` +
      `?include=user.about_me;user.location;user.website_url&unsafe=true&base=default${keyParam}`
    )
    if (!resp.ok) return null
    const data = await resp.json() as { items: { filter: string }[] }
    aboutMeFilterString = data.items[0]?.filter ?? null
    return aboutMeFilterString
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// Real implementation
// ─────────────────────────────────────────

async function runStackOverflowSearch(apiKey?: string): Promise<RawSignal[]> {
  const fromdate = Math.floor((Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000)
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : ''
  let   quotaLow = false

  const userFilter = await getAboutMeFilter(keyParam)

  // ── Phase 1: questions (with body) ───────────────────────────────────────────
  const activitiesByUser  = new Map<number, Activity[]>()
  const displayNameByUser = new Map<number, string>()
  const questionMeta      = new Map<number, { title: string; tags: string[] }>()

  function addActivity(userId: number, displayName: string, activity: Activity) {
    displayNameByUser.set(userId, displayName)
    if (!activitiesByUser.has(userId)) activitiesByUser.set(userId, [])
    const bucket = activitiesByUser.get(userId)!
    if (bucket.length < MAX_ACTIVITIES_PER_USER) bucket.push(activity)
  }

  outer:
  for (const tag of SEARCH_TAGS) {
    for (let page = 1; page <= MAX_PAGES_PER_TAG; page++) {
      await sleep(500)

      const url =
        `https://api.stackexchange.com/2.3/questions` +
        `?tagged=${encodeURIComponent(tag)}` +
        `&site=stackoverflow&sort=creation&order=desc` +
        `&fromdate=${fromdate}&pagesize=100&page=${page}` +
        `&filter=withbody` +
        keyParam

      let resp: Response
      try { resp = await fetch(url) }
      catch (err) { console.error('[CELord/stackoverflow] Question fetch error', { tag, page, err }); break }

      if (!resp.ok) { console.error('[CELord/stackoverflow] Question HTTP', resp.status, { tag, page }); break }

      const data = await resp.json() as SOWrapper<SOQuestion>

      if (data.quota_remaining < QUOTA_SAFETY_THRESHOLD) {
        console.warn('[CELord/stackoverflow] Quota low', data.quota_remaining)
        quotaLow = true; break outer
      }

      for (const q of data.items) {
        const { user_id, display_name, user_type } = q.owner
        if (!user_id || user_type === 'does_not_exist' || user_type === 'unregistered') continue

        questionMeta.set(q.question_id, { title: q.title, tags: q.tags })
        addActivity(user_id, display_name, {
          source_url:    `https://stackoverflow.com/questions/${q.question_id}`,
          title:         q.title,
          tags:          q.tags,
          creation_date: q.creation_date,
          body:          q.body ?? null,
        })
      }

      if (!data.has_more) break
    }
    if (quotaLow) break
  }

  // ── Phase 1b: answers to those questions ─────────────────────────────────────
  const questionIds = [...questionMeta.keys()]
  for (let i = 0; i < questionIds.length && !quotaLow; i += 100) {
    await sleep(500)
    const ids = questionIds.slice(i, i + 100).join(';')
    const url =
      `https://api.stackexchange.com/2.3/questions/${ids}/answers` +
      `?site=stackoverflow&sort=creation&order=desc&pagesize=100` +
      `&filter=withbody` +
      keyParam

    try {
      const resp = await fetch(url)
      if (!resp.ok) continue

      const data = await resp.json() as SOWrapper<SOAnswer>
      for (const a of data.items) {
        const { user_id, display_name, user_type } = a.owner
        if (!user_id || user_type === 'does_not_exist' || user_type === 'unregistered') continue

        const meta = questionMeta.get(a.question_id)
        addActivity(user_id, display_name, {
          source_url:    `https://stackoverflow.com/a/${a.answer_id}`,
          title:         meta?.title ?? 'Pentaho answer',
          tags:          meta?.tags ?? ['pentaho'],
          creation_date: a.creation_date,
          body:          a.body ?? null,
        })
      }

      if (data.quota_remaining < QUOTA_SAFETY_THRESHOLD) quotaLow = true
    } catch {
      continue
    }
  }

  console.info(`[CELord/stackoverflow] Phase 1+1b — ${activitiesByUser.size} users, ${[...activitiesByUser.values()].reduce((n, a) => n + a.length, 0)} activities; filter=${userFilter ?? 'none'}`)

  if (activitiesByUser.size === 0) return []

  // ── Phase 2: user profiles ────────────────────────────────────────────────────
  const userIds = [...activitiesByUser.keys()]
  const userMap = new Map<number, SOUser>()

  for (let i = 0; i < userIds.length && !quotaLow; i += 100) {
    await sleep(500)
    const ids      = userIds.slice(i, i + 100).join(';')
    const filterQS = userFilter ? `&filter=${encodeURIComponent(userFilter)}` : ''
    const url      = `https://api.stackexchange.com/2.3/users/${ids}?site=stackoverflow${filterQS}${keyParam}`

    try {
      const resp = await fetch(url)
      if (!resp.ok) continue
      const data = await resp.json() as SOWrapper<SOUser>
      for (const user of data.items) userMap.set(user.user_id, user)
      if (data.quota_remaining < QUOTA_SAFETY_THRESHOLD) quotaLow = true
    } catch { continue }
  }

  const sample = userMap.values().next().value as SOUser | undefined
  console.info(`[CELord/stackoverflow] Phase 2 — ${userMap.size} profiles; sample: website_url=${sample?.website_url ?? 'none'} location=${sample?.location ?? 'none'} about_me_len=${sample?.about_me?.length ?? 0}`)

  // ── Phase 3: emit signals ─────────────────────────────────────────────────────
  const signals: RawSignal[] = []
  const collectedAt           = new Date().toISOString()
  let pathA = 0, pathB = 0, pathC = 0, pathD = 0

  for (const [userId, activities] of activitiesByUser) {
    const user        = userMap.get(userId)
    const displayName = displayNameByUser.get(userId) ?? `SO user ${userId}`

    const { country, stateProvince } = parseLocation(user?.location ?? null)

    for (const activity of activities) {
      // Path A: company domain from website_url
      const orgDomain = user?.website_url ? extractOrgDomain(user.website_url) : null

      // Path B: employer from about_me
      const fromBio = !orgDomain && user?.about_me
        ? extractEmployerFromText(user.about_me)
        : null

      // Path C: employer from question/answer body
      const fromBody = !orgDomain && !fromBio && activity.body
        ? extractEmployerFromText(activity.body)
        : null

      // Path D: fallback — use display_name (creates person-named org row)
      const orgHint   = orgDomain ?? fromBio ?? fromBody ?? displayName
      const orgDomainFinal = orgDomain  // only set when Path A matched

      if      (orgDomain) pathA++
      else if (fromBio)   pathB++
      else if (fromBody)  pathC++
      else                pathD++

      signals.push({
        source:         'stackoverflow',
        source_url:     activity.source_url,
        snippet:        buildSnippet(activity.title, activity.tags, user?.location ?? null),
        org_hint:       orgHint,
        org_domain:     orgDomainFinal,
        country,
        state_province: stateProvince,
        signal_date:    new Date(activity.creation_date * 1000).toISOString(),
        collected_at:   collectedAt,
      })
    }
  }

  console.info(`[CELord/stackoverflow] Phase 3 — pathA=${pathA} pathB=${pathB} pathC=${pathC} pathD(display_name)=${pathD} signals=${signals.length}`)
  return signals
}

// ─────────────────────────────────────────
// Org extraction
// ─────────────────────────────────────────

function extractOrgDomain(websiteUrl: string): string | null {
  try {
    const hostname = new URL(websiteUrl).hostname.replace(/^www\./, '').toLowerCase()
    if (!hostname.includes('.')) return null
    if (PERSONAL_DOMAINS.has(hostname)) return null
    if ([...PERSONAL_DOMAINS].some(d => hostname.endsWith(`.${d}`))) return null
    if (VENDOR_DOMAINS.has(hostname)) return null
    return hostname
  } catch {
    return null
  }
}

// Strip HTML and parse for common employer mention patterns.
// Used for both about_me and question/answer body fields.
function extractEmployerFromText(html: string): string | null {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const PATTERNS = [
    /\b(?:work(?:ing)?\s+(?:at|for)|employed\s+(?:at|by))\s+([A-Z][A-Za-z0-9 &.,'\-()]{2,50}?)(?=[,;.\n]|$)/i,
    /\b(?:software\s+)?(?:engineer|developer|architect|consultant|analyst|manager|director|lead|scientist|designer|devops)\s+at\s+([A-Z][A-Za-z0-9 &.,'\-()]{2,50}?)(?=[,;.\n]|$)/i,
    /@\s+([A-Z][A-Za-z0-9 &.,'\-()]{2,50}?)(?=[,;.\n]|$)/,
    /([A-Z][A-Za-z0-9 &.,'\-()]{2,50}?)\s+employee\b/i,
  ]

  const STOP_WORDS = /^(the|a|an|my|our|your|this|that|here|there|now|then|home|remote|self|freelance)$/i

  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const candidate = match[1].trim().replace(/[,;.]+$/, '')
    if (candidate.length < 3 || STOP_WORDS.test(candidate)) continue
    return candidate
  }
  return null
}

// ─────────────────────────────────────────
// Snippet + location helpers
// ─────────────────────────────────────────

function buildSnippet(title: string, tags: string[], location: string | null): string {
  return `"${title}" [${tags.join(', ')}]${location ? ` | ${location}` : ''}`
}

// Duplicated from github.ts — package-in-waiting discipline.
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
  const upper    = raw.toUpperCase()
  const isUSA    = /\b(USA|UNITED STATES|U\.S\.A?\.?)\b/.test(upper)
  const isCanada = /\bCANADA\b/.test(upper) || /\bCA\b/.test(raw.split(',').pop()?.trim() ?? '')
  for (const part of raw.split(',').map(p => p.trim())) {
    const abbr = part.toUpperCase().replace(/\.$/, '')
    if (US_STATES.has(abbr))    return { country: 'US', stateProvince: abbr }
    if (CA_PROVINCES.has(abbr)) return { country: 'CA', stateProvince: abbr }
  }
  if (isUSA)    return { country: 'US', stateProvince: null }
  if (isCanada) return { country: 'CA', stateProvince: null }
  return { country: null, stateProvince: null }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}
