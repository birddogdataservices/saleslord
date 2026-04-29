// GET /api/celord/collect/github
// Vercel cron: daily at 02:00 UTC (see vercel.json).
// Runs the GitHub code search collector and persists new signals to the DB.
// Auth: Bearer $CRON_SECRET header (set automatically by Vercel cron).

import { createAdminClient } from '@/lib/supabase/admin'
import { githubCollector } from '@saleslord/signals/collectors/github'
import { persistSignals } from '@saleslord/signals/persist'

export const maxDuration = 60

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = { githubToken: process.env.GITHUB_TOKEN }
  const signals = await githubCollector(config)

  const adminClient = createAdminClient()
  const result = await persistSignals(signals, adminClient)

  return Response.json({
    ok: true,
    signals: signals.length,
    ...result,
  })
}
