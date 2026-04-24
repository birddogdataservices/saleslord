// GET /api/celord/collect/jobs
// Vercel cron: daily at 03:00 UTC (see vercel.json).
// Runs the job postings collector (SerpApi or Adzuna) and persists new signals.
// Auth: Bearer $CRON_SECRET header (set automatically by Vercel cron).

import { createAdminClient } from '@/lib/supabase/admin'
import { jobsCollector } from '@/signals/collectors/jobs'
import { persistSignals } from '@/signals/persist'

export const maxDuration = 30

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = {
    serpApiKey:   process.env.SERPAPI_KEY,
    adzunaAppId:  process.env.ADZUNA_APP_ID,
    adzunaAppKey: process.env.ADZUNA_APP_KEY,
  }

  const signals = await jobsCollector(config)

  const adminClient = createAdminClient()
  const result = await persistSignals(signals, adminClient)

  const provider = config.serpApiKey ? 'serpapi' : config.adzunaAppId ? 'adzuna' : 'fixture'
  return Response.json({
    ok: true,
    provider,
    signals: signals.length,
    ...result,
  })
}
