import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { CandidateList } from './CandidateList'

export const dynamic = 'force-dynamic'

type Candidate = {
  id: string
  status: string
  reject_reason: string | null
  notes: string | null
  org: {
    id: string
    name: string
    domain: string | null
    industry: string | null
    approx_size: string | null
  }
  source_url: string | null
}

async function getRunWithCandidates(runId: string, userId: string) {
  const adminClient = createAdminClient()

  const { data: repProfile } = await adminClient
    .from('rep_profiles').select('id').eq('user_id', userId).maybeSingle()
  if (!repProfile) return null

  const { data: run } = await adminClient
    .from('territorylord_runs')
    .select('id, region_code, status, candidate_count, error, created_at, completed_at, rep_id, icp_profiles ( name )')
    .eq('id', runId)
    .eq('rep_id', repProfile.id)
    .maybeSingle()

  if (!run) return null

  const { data: candidateRows } = await adminClient
    .from('territorylord_candidates')
    .select('id, status, reject_reason, notes, org_id, organizations ( id, name, domain, industry, approx_size )')
    .eq('run_id', runId)
    .order('created_at')

  // Fetch the Wikidata source URLs for each org
  const orgIds = (candidateRows ?? []).map((c: { org_id: string }) => c.org_id)
  const sourceUrlByOrgId: Record<string, string> = {}

  if (orgIds.length > 0) {
    const { data: links } = await adminClient
      .from('signal_links')
      .select('org_id, signals ( source_url )')
      .in('org_id', orgIds)

    type LinkRow = { org_id: string; signals: { source_url: string } | { source_url: string }[] | null }
    for (const link of (links ?? []) as unknown as LinkRow[]) {
      const sig = Array.isArray(link.signals) ? link.signals[0] : link.signals
      if (sig?.source_url?.includes('wikidata.org') && !sourceUrlByOrgId[link.org_id]) {
        sourceUrlByOrgId[link.org_id] = sig.source_url
      }
    }
  }

  type CandidateRow = {
    id: string; status: string; reject_reason: string | null; notes: string | null; org_id: string
    organizations: { id: string; name: string; domain: string | null; industry: string | null; approx_size: string | null } | { id: string; name: string; domain: string | null; industry: string | null; approx_size: string | null }[] | null
  }
  const candidates: Candidate[] = ((candidateRows ?? []) as unknown as CandidateRow[]).map(c => {
    const org = Array.isArray(c.organizations) ? c.organizations[0] : c.organizations
    return {
      id:            c.id,
      status:        c.status,
      reject_reason: c.reject_reason,
      notes:         c.notes,
      org: {
        id:          org?.id ?? c.org_id,
        name:        org?.name ?? '—',
        domain:      org?.domain ?? null,
        industry:    org?.industry ?? null,
        approx_size: org?.approx_size ?? null,
      },
      source_url: sourceUrlByOrgId[c.org_id] ?? null,
    }
  })

  return { run, candidates }
}

export default async function RunResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const result = await getRunWithCandidates(runId, user.id)
  if (!result) return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white p-6 text-sm text-gray-500">
      Run not found.{' '}
      <Link href="/territorylord/runs" className="underline">Back to runs</Link>
    </div>
  )

  const { run, candidates } = result
  const icpRaw = run.icp_profiles as { name: string } | { name: string }[] | null
  const icpName = (Array.isArray(icpRaw) ? icpRaw[0]?.name : icpRaw?.name) ?? '—'

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0">
        <Link href="/territorylord/runs" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
          ← Back to runs
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{run.region_code} — {icpName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
              {' · '}
              {new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      <CandidateList candidates={candidates} />
    </div>
  )
}
