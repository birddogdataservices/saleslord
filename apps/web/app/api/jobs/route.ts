// GET /api/jobs — the current user's running jobs plus everything finished in
// the last 24 hours. Polled by the sidebar Jobs section.
//
// Also sweeps stale 'running' rows older than 10 minutes (past any Vercel
// function timeout) to 'failed' — a crashed or killed function never gets to
// finalize its row, and without the sweep it would spin in the sidebar forever.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const STALE_RUNNING_MS = 10 * 60 * 1000
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const now = Date.now()

  await adminClient
    .from('jobs')
    .update({
      status: 'failed',
      error: 'Timed out',
      finished_at: new Date(now).toISOString(),
    })
    .eq('user_id', user.id)
    .eq('status', 'running')
    .lt('started_at', new Date(now - STALE_RUNNING_MS).toISOString())

  const historyCutoff = new Date(now - HISTORY_WINDOW_MS).toISOString()
  const { data, error } = await adminClient
    .from('jobs')
    .select('id, prospect_id, company_name, kind, status, error, cost_usd, started_at, finished_at')
    .eq('user_id', user.id)
    .or(`status.eq.running,finished_at.gte.${historyCutoff}`)
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) return Response.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  return Response.json({ jobs: data ?? [] })
}
