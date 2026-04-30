// PATCH /api/territorylord/candidates/[id]
// Accept, reject, or promote a TerritoryLord candidate.
// Ownership verified: candidate → run → rep → user.
// Promote creates a prospects row (upsert) and returns the prospect ID.

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type PatchBody =
  | { action: 'accept' }
  | { action: 'reject'; reason: string; notes?: string }
  | { action: 'promote' }

const VALID_REJECT_REASONS = ['wrong_industry', 'too_small', 'not_real', 'duplicate', 'other'] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: candidateId } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Load candidate with run's rep_id for ownership check
  const { data: candidate } = await adminClient
    .from('territorylord_candidates')
    .select('id, org_id, status, territorylord_runs ( rep_id )')
    .eq('id', candidateId)
    .maybeSingle()

  if (!candidate) return Response.json({ error: 'Candidate not found' }, { status: 404 })

  const { data: repProfile } = await adminClient
    .from('rep_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!repProfile) return Response.json({ error: 'Rep profile not found' }, { status: 422 })

  const run = (candidate as unknown as { territorylord_runs: { rep_id: string } | { rep_id: string }[] | null }).territorylord_runs
  const runRepId = Array.isArray(run) ? run[0]?.rep_id : run?.rep_id
  if (runRepId !== repProfile.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json() as PatchBody

  if (body.action === 'accept') {
    await adminClient
      .from('territorylord_candidates')
      .update({ status: 'accepted' })
      .eq('id', candidateId)
    return Response.json({ ok: true, status: 'accepted' })
  }

  if (body.action === 'reject') {
    const reason = (body as { action: 'reject'; reason: string }).reason
    if (!VALID_REJECT_REASONS.includes(reason as typeof VALID_REJECT_REASONS[number])) {
      return Response.json({ error: `reason must be one of: ${VALID_REJECT_REASONS.join(', ')}` }, { status: 400 })
    }
    const notes = (body as { action: 'reject'; reason: string; notes?: string }).notes
    await adminClient
      .from('territorylord_candidates')
      .update({ status: 'rejected', reject_reason: reason, notes: notes ?? null })
      .eq('id', candidateId)
    return Response.json({ ok: true, status: 'rejected' })
  }

  if (body.action === 'promote') {
    const { data: org } = await adminClient
      .from('organizations')
      .select('id, name')
      .eq('id', (candidate as { org_id: string }).org_id)
      .maybeSingle()

    if (!org) return Response.json({ error: 'Org not found' }, { status: 404 })

    // Upsert prospect — may already exist if rep previously researched this company
    const { data: prospect, error: prospectError } = await adminClient
      .from('prospects')
      .upsert(
        { user_id: user.id, name: org.name, query: org.name },
        { onConflict: 'user_id,query', ignoreDuplicates: false },
      )
      .select('id')
      .single()

    if (prospectError || !prospect) {
      return Response.json({ error: prospectError?.message ?? 'Failed to create prospect' }, { status: 500 })
    }

    await adminClient
      .from('territorylord_candidates')
      .update({ status: 'promoted' })
      .eq('id', candidateId)

    return Response.json({ ok: true, status: 'promoted', prospect_id: prospect.id })
  }

  return Response.json({ error: 'action must be accept | reject | promote' }, { status: 400 })
}
