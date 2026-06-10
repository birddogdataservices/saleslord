// Job tracking for AI actions — server-side only (imported by API routes).
//
// withJob brackets an AI route handler: it inserts a 'running' row in the
// jobs table before the handler runs, then finalizes the row from the
// handler's Response (success/fail, error message, cost_usd). The sidebar
// Jobs section polls GET /api/jobs to display these rows.
//
// The admin client is passed in from the route — lib code must not import
// lib/supabase/admin.ts (platform rule).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { JobKind } from '@/lib/types'

type WithJobOpts = {
  kind: JobKind
  adminClient: SupabaseClient
  // Resolve display context from the request body: a company name directly
  // (research passes the query) or a prospect_id to look the name up.
  getContext: (body: any) => { companyName?: string | null; prospectId?: string | null }
}

// Responses where the job never actually ran (bad input, rate limit, missing
// API key, missing brief). The row is deleted instead of shown as a failure —
// these fail instantly and already surface as toasts.
const VALIDATION_STATUSES = new Set([400, 401, 402, 404, 429])

export async function withJob(
  request: Request,
  run: (request: Request) => Promise<Response>,
  opts: WithJobOpts
): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return run(request) // handler returns its own 401

  // Read the body from a clone — the handler reads the original
  const body = await request.clone().json().catch(() => null)
  const ctx = opts.getContext(body ?? {})

  let companyName = ctx.companyName?.trim() || null
  if (!companyName && ctx.prospectId) {
    // Scoped to the caller — never leak another user's prospect name into a job row
    const { data } = await opts.adminClient
      .from('prospects').select('name')
      .eq('id', ctx.prospectId).eq('user_id', user.id)
      .single()
    companyName = data?.name ?? null
  }

  const { data: jobRow } = await opts.adminClient
    .from('jobs')
    .insert({
      user_id:      user.id,
      prospect_id:  ctx.prospectId ?? null,
      company_name: companyName ?? 'Unknown',
      kind:         opts.kind,
      status:       'running',
    })
    .select('id')
    .single()
  const jobId: string | undefined = jobRow?.id

  let res: Response
  try {
    res = await run(request)
  } catch (err) {
    if (jobId) {
      await opts.adminClient.from('jobs').update({
        status:      'failed',
        error:       err instanceof Error ? err.message : 'Unexpected error',
        finished_at: new Date().toISOString(),
      }).eq('id', jobId)
    }
    throw err
  }

  if (!jobId) return res

  if (!res.ok && VALIDATION_STATUSES.has(res.status)) {
    await opts.adminClient.from('jobs').delete().eq('id', jobId)
    return res
  }

  const resBody = await res.clone().json().catch(() => null)
  await opts.adminClient.from('jobs').update({
    status:       res.ok ? 'success' : 'failed',
    error:        res.ok ? null : (resBody?.error ?? `HTTP ${res.status}`),
    cost_usd:     resBody?.cost_usd ?? null,
    // Research creates the prospect mid-job and returns the canonical name
    prospect_id:  resBody?.prospect_id ?? ctx.prospectId ?? null,
    company_name: resBody?.prospect?.name ?? companyName ?? 'Unknown',
    finished_at:  new Date().toISOString(),
  }).eq('id', jobId)

  return res
}
