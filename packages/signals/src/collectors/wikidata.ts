// Wikidata SPARQL collector for TerritoryLord.
// Finds business entities in a given ISO 3166-2 region via the public Wikidata
// SPARQL endpoint. No API key required — free for any use.
//
// Strategy:
//   1. Look up the region's Wikidata Q-ID via the ISO 3166-2 code (P300).
//   2. Find entities with P856 (official website) located in that region
//      via P131 (direct) or P131/P131 (one city hop).
//   3. Pull industry label (P452) and schema:description where available.
//   4. Order by sitelinks count (proxy for prominence) and cap at 500.
//
// Coverage: best for mid-to-large companies with web presence in Wikidata.
// Smaller / newer companies may be missing — expected for v0.

import type { RawSignal } from './types'

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'TerritoryLord/1.0 (SalesLord territory whitespace tool; https://github.com/birddogdataservices/saleslord)'
const RESULT_LIMIT = 500

export type WikidataCandidate = {
  signal: RawSignal
  wikidataId: string           // Q-number, e.g. "Q12345"
  industryLabel: string | null // from P452, English label
  description: string | null   // schema:description, English
}

// ── SPARQL query ──────────────────────────────────────────────

function buildQuery(regionCode: string): string {
  // Escape the region code for injection safety (should always be XX-XX format
  // but guard against anything unexpected reaching the SPARQL string).
  const safe = regionCode.replace(/[^A-Z0-9-]/g, '')
  return `
SELECT DISTINCT ?org ?orgLabel ?website ?industryLabel ?desc ?sitelinks WHERE {
  ?region wdt:P300 "${safe}" .
  {
    ?org wdt:P131 ?region .
  } UNION {
    ?org wdt:P131 ?city .
    ?city wdt:P131 ?region .
  }
  ?org wdt:P856 ?website .
  OPTIONAL {
    ?org wdt:P452 ?industry .
    ?industry rdfs:label ?industryLabel .
    FILTER(LANG(?industryLabel) = "en")
  }
  OPTIONAL { ?org schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?org wikibase:sitelinks ?sitelinks . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY DESC(?sitelinks)
LIMIT ${RESULT_LIMIT}
`.trim()
}

// ── SPARQL JSON response types ────────────────────────────────

type SparqlValue = { type: string; value: string }
type SparqlBinding = {
  org: SparqlValue
  orgLabel?: SparqlValue
  website?: SparqlValue
  industryLabel?: SparqlValue
  desc?: SparqlValue
  sitelinks?: SparqlValue
}
type SparqlResponse = { results: { bindings: SparqlBinding[] } }

// ── Domain extraction ─────────────────────────────────────────

function extractDomain(url: string | undefined): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return hostname.includes('.') ? hostname : null
  } catch {
    return null
  }
}

// ── Main export ───────────────────────────────────────────────

export async function wikidataCollector(params: {
  regionCode: string   // ISO 3166-2, e.g. 'US-CA', 'CA-ON'
}): Promise<WikidataCandidate[]> {
  const { regionCode } = params

  const query = buildQuery(regionCode)
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`

  let resp: Response
  try {
    resp = await fetch(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': USER_AGENT,
      },
    })
  } catch (err) {
    console.error('[TerritoryLord/wikidata] Fetch error', { regionCode, err })
    return []
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    console.error('[TerritoryLord/wikidata] HTTP', resp.status, { regionCode, body: body.slice(0, 200) })
    return []
  }

  let data: SparqlResponse
  try {
    data = await resp.json() as SparqlResponse
  } catch (err) {
    console.error('[TerritoryLord/wikidata] JSON parse error', { regionCode, err })
    return []
  }

  const bindings = data.results?.bindings ?? []
  console.info(`[TerritoryLord/wikidata] ${bindings.length} raw results for ${regionCode}`)

  const collectedAt = new Date().toISOString()
  const [countryCode, stateCode] = regionCode.split('-')

  // Deduplicate by Wikidata entity URI (SPARQL DISTINCT handles most cases but
  // UNION branches can occasionally produce duplicates in some SPARQL engines).
  const seen = new Set<string>()
  const candidates: WikidataCandidate[] = []

  for (const binding of bindings) {
    const entityUri = binding.org?.value
    if (!entityUri) continue
    if (seen.has(entityUri)) continue
    seen.add(entityUri)

    const orgName = binding.orgLabel?.value
    // Skip entries where the label is just the Q-number (no English label set)
    if (!orgName || /^Q\d+$/.test(orgName)) continue

    const websiteUrl  = binding.website?.value
    const orgDomain   = extractDomain(websiteUrl)
    const industryLabel = binding.industryLabel?.value ?? null
    const description   = binding.desc?.value ?? null
    const wikidataId    = entityUri.split('/').pop() ?? entityUri

    const snippetParts = [orgName]
    if (description) snippetParts.push(description.slice(0, 150))
    if (industryLabel) snippetParts.push(industryLabel)
    const snippet = snippetParts.join(' — ')

    const signal: RawSignal = {
      source:         'wikidata',
      source_url:     entityUri,
      snippet,
      org_hint:       orgName,
      org_domain:     orgDomain,
      country:        countryCode ?? null,
      state_province: stateCode ?? null,
      signal_date:    null,
      collected_at:   collectedAt,
    }

    candidates.push({ signal, wikidataId, industryLabel, description })
  }

  console.info(`[TerritoryLord/wikidata] ${candidates.length} unique named candidates for ${regionCode}`)
  return candidates
}
