// GET /api/celord/collect/stackoverflow
// Vercel cron: monthly on the 1st at 02:15 UTC (see vercel.json).
// Runs the Stack Overflow collector and persists new signals.
// Auth: Bearer $CRON_SECRET header (set automatically by Vercel cron).

import { createAdminClient } from '@/lib/supabase/admin'
import { stackoverflowCollector } from '@saleslord/signals/collectors/stackoverflow'
import { persistSignals } from '@saleslord/signals/persist'

export const maxDuration = 30

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = {
    stackoverflowApiKey: process.env.STACKOVERFLOW_API_KEY,
  }

  const signals = await stackoverflowCollector(config)

  const adminClient = createAdminClient()
  const result = await persistSignals(signals, adminClient)

  return Response.json({
    ok:      true,
    signals: signals.length,
    ...result,
  })
}
