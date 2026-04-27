// GET /api/celord/collect/dockerhub
// Vercel cron: monthly on the 1st at 02:30 UTC (see vercel.json).
// Runs the Docker Hub collector and persists new signals.
// Auth: Bearer $CRON_SECRET header (set automatically by Vercel cron).

import { createAdminClient } from '@/lib/supabase/admin'
import { dockerhubCollector } from '@/signals/collectors/dockerhub'
import { persistSignals } from '@/signals/persist'

export const maxDuration = 60

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const signals = await dockerhubCollector({})

  const adminClient = createAdminClient()
  const result = await persistSignals(signals, adminClient)

  return Response.json({
    ok:      true,
    signals: signals.length,
    ...result,
  })
}
