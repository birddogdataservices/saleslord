// GET /api/celord/collect/shodan
// Vercel cron: daily at 02:30 UTC (see vercel.json).
// Runs the Shodan host search collector and persists new signals to the DB.
// Auth: Bearer $CRON_SECRET header (set automatically by Vercel cron).

import { createAdminClient } from '@/lib/supabase/admin'
import { shodanCollector } from '@/signals/collectors/shodan'
import { persistSignals } from '@/signals/persist'

export const maxDuration = 30

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = { shodanApiKey: process.env.SHODAN_API_KEY }
  const signals = await shodanCollector(config)

  const adminClient = createAdminClient()
  const result = await persistSignals(signals, adminClient)

  return Response.json({
    ok: true,
    signals: signals.length,
    ...result,
  })
}
