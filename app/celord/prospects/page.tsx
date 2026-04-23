export const dynamic = 'force-dynamic'

import { githubCollector } from '@/signals/collectors/github'
import { shodanCollector } from '@/signals/collectors/shodan'
import { jobsCollector } from '@/signals/collectors/jobs'
import { groupAndScore } from '@/signals/scoring'
import { ProspectsTable } from '@/components/celord/ProspectsTable'

export default async function CelordProspectsPage() {
  const config = {
    githubToken:   process.env.GITHUB_TOKEN,
    shodanApiKey:  process.env.SHODAN_API_KEY,
    serpApiKey:    process.env.SERPAPI_KEY,
    adzunaAppId:   process.env.ADZUNA_APP_ID,
    adzunaAppKey:  process.env.ADZUNA_APP_KEY,
  }

  const [github, shodan, jobs] = await Promise.all([
    githubCollector(config),
    shodanCollector(config),
    jobsCollector(config),
  ])

  const all = [...github, ...shodan, ...jobs]
  const orgs = groupAndScore(all)

  const isStub = !config.githubToken && !config.shodanApiKey && !config.serpApiKey

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pentaho CE Prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Organizations showing signals of Pentaho Community Edition usage
          </p>
        </div>
        {isStub && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-amber-300 bg-amber-50">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            <span className="text-sm text-amber-700">Fixture data — no collector keys configured</span>
          </div>
        )}
      </div>

      {/* Table */}
      <ProspectsTable orgs={orgs} />
    </div>
  )
}
