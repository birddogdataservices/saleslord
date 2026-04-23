import type { Collector, RawSignal } from './types'

// Returns SHODAN_FIXTURES when no API key is configured.
// Swap: when config.shodanApiKey is present, replace the early-return with
// real Shodan API calls (search for Pentaho server fingerprints).
// Probe actual Pentaho server HTTP banners to confirm query strings before
// committing to production queries — see docs/celord/HANDOFF.md open questions.
export const shodanCollector: Collector = async (config) => {
  if (!config.shodanApiKey) return SHODAN_FIXTURES
  // TODO: implement real Shodan search
  return SHODAN_FIXTURES
}

const now = new Date().toISOString()

const SHODAN_FIXTURES: RawSignal[] = [
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/198.51.100.42',
    snippet: 'HTTP/1.1 200 OK\nServer: Apache-Coyote/1.1\nLocation: /pentaho/Home\nX-Pentaho-Version: 9.1.0.0-324\nHost: 198.51.100.42:8080 — resolves to maricopa.gov IP block.',
    org_hint: 'Maricopa County IT',
    org_domain: 'maricopa.gov',
    country: 'US',
    state_province: 'AZ',
    signal_date: '2026-04-10',
    collected_at: now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/203.0.113.77',
    snippet: 'HTTP banner on port 8080: title="Pentaho User Console" — Pentaho Data Integration 9.3 CE. Host PTR resolves to intermountain.net.',
    org_hint: 'Intermountain Health',
    org_domain: 'intermountain.net',
    country: 'US',
    state_province: 'UT',
    signal_date: '2026-04-08',
    collected_at: now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/192.0.2.155',
    snippet: 'Port 9090 — Carte (Pentaho PDI slave server) responding with status XML. Version string: 9.1.0.0-324 CE. PTR: pge-etl-prod.pge.com.',
    org_hint: 'Pacific Gas and Electric',
    org_domain: 'pge.com',
    country: 'US',
    state_province: 'CA',
    signal_date: '2026-03-29',
    collected_at: now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/198.51.100.201',
    snippet: 'HTTP/1.1 302 Found redirect to /pentaho/Login on port 8080. Server: Apache-Coyote/1.1. PTR resolves to manitobahydro.com subnet.',
    org_hint: 'Manitoba Hydro',
    org_domain: 'manitobahydro.com',
    country: 'CA',
    state_province: 'MB',
    signal_date: '2026-04-05',
    collected_at: now,
  },
  {
    source: 'shodan',
    source_url: 'https://www.shodan.io/host/203.0.113.98',
    snippet: 'Pentaho User Console login page on port 8080. No version string visible. PTR resolves to dteedison.com. Server certificate SAN includes detroit.dteedison.com.',
    org_hint: 'Detroit Edison',
    org_domain: 'dte-energy.com',
    country: 'US',
    state_province: 'MI',
    signal_date: '2026-03-14',
    collected_at: now,
  },
]
