// POST /api/territorylord/runs
// Session-authenticated. Creates a run, executes Wikidata collection,
// resolves/creates orgs via shared persist.ts, classifies industries
// via Haiku 4.5, and writes territorylord_candidates rows.
// One region per run in v0.

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { decryptApiKey } from '@/lib/crypto'
import { wikidataCollector } from '@saleslord/signals/collectors/wikidata'
import { persistSignals } from '@saleslord/signals/persist'
import { classifyIndustry } from '@saleslord/signals/classifyIndustry'

export const maxDuration = 300

const REGION_CODE_RE = /^[A-Z]{2}-[A-Z]{2,3}$/

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { region_code?: string; icp_profile_id?: string }
  const { region_code, icp_profile_id } = body

  if (!region_code || !REGION_CODE_RE.test(region_code)) {
    return Response.json({ error: 'Invalid region_code — expected ISO 3166-2 e.g. US-CA' }, { status: 400 })
  }
  if (!icp_profile_id) {
    return Response.json({ error: 'icp_profile_id required' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: repProfile } = await adminClient
    .from('rep_profiles')
    .select('id, anthropic_api_key')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!repProfile) return Response.json({ error: 'Rep profile not found' }, { status: 422 })

  let anthropicKey: string | null = null
  if (repProfile.anthropic_api_key) {
    try { anthropicKey = decryptApiKey(repProfile.anthropic_api_key) } catch { /* malformed key */ }
  }

  // Verify ICP profile belongs to this rep
  const { data: icpProfile } = await adminClient
    .from('icp_profiles')
    .select('id')
    .eq('id', icp_profile_id)
    .eq('rep_id', repProfile.id)
    .maybeSingle()

  if (!icpProfile) return Response.json({ error: 'ICP profile not found' }, { status: 404 })

  // Create run row
  const { data: run, error: runError } = await adminClient
    .from('territorylord_runs')
    .insert({ rep_id: repProfile.id, icp_profile_id, region_code, status: 'running' })
    .select('id')
    .single()

  if (runError || !run) {
    return Response.json({ error: runError?.message ?? 'Failed to create run' }, { status: 500 })
  }

  const runId = run.id

  try {
    // 1. Collect from Wikidata
    const wikidataCandidates = await wikidataCollector({ regionCode: region_code })

    if (wikidataCandidates.length === 0) {
      await adminClient
        .from('territorylord_runs')
        .update({ status: 'complete', candidate_count: 0, completed_at: new Date().toISOString() })
        .eq('id', runId)
      return Response.json({ ok: true, run_id: runId, candidate_count: 0 })
    }

    // 2. Persist signals → entity resolution → orgMap (source_url → org_id)
    const signals = wikidataCandidates.map(c => c.signal)
    const { orgMap } = await persistSignals(signals, adminClient)

    // Build reverse lookup: org_id → WikidataCandidate metadata
    const metaByOrgId = new Map<string, { industryLabel: string | null; description: string | null; orgName: string }>()
    for (const candidate of wikidataCandidates) {
      const orgId = orgMap[candidate.signal.source_url]
      if (orgId && !metaByOrgId.has(orgId)) {
        metaByOrgId.set(orgId, {
          industryLabel: candidate.industryLabel,
          description:   candidate.description,
          orgName:       candidate.signal.org_hint,
        })
      }
    }

    const orgIds = [...metaByOrgId.keys()]

    // 3. For orgs without an industry: fill from Wikidata label, or classify via Haiku
    if (orgIds.length > 0) {
      const { data: orgs } = await adminClient
        .from('organizations')
        .select('id, name, industry')
        .in('id', orgIds)

      for (const org of orgs ?? []) {
        if (org.industry) continue   // already classified

        const meta = metaByOrgId.get(org.id)

        if (meta?.industryLabel) {
          await adminClient
            .from('organizations')
            .update({ industry: meta.industryLabel, updated_at: new Date().toISOString() })
            .eq('id', org.id)
        } else if (anthropicKey) {
          const { naicsLabel } = await classifyIndustry(org.name, meta?.description ?? null, anthropicKey)
          await adminClient
            .from('organizations')
            .update({ industry: naicsLabel, updated_at: new Date().toISOString() })
            .eq('id', org.id)
        }
      }
    }

    // 4. Write territorylord_candidates (unique per run+org)
    const seenOrgIds = new Set<string>()
    const candidateRows = orgIds
      .filter(orgId => {
        if (seenOrgIds.has(orgId)) return false
        seenOrgIds.add(orgId)
        return true
      })
      .map(orgId => ({ run_id: runId, org_id: orgId, status: 'new' }))

    if (candidateRows.length > 0) {
      await adminClient
        .from('territorylord_candidates')
        .upsert(candidateRows, { onConflict: 'run_id,org_id', ignoreDuplicates: true })
    }

    // 5. Mark run complete
    await adminClient
      .from('territorylord_runs')
      .update({
        status: 'complete',
        candidate_count: candidateRows.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)

    return Response.json({ ok: true, run_id: runId, candidate_count: candidateRows.length })
  } catch (err) {
    await adminClient
      .from('territorylord_runs')
      .update({ status: 'failed', error: (err as Error).message ?? 'Unknown error' })
      .eq('id', runId)

    return Response.json({ error: (err as Error).message ?? 'Run failed' }, { status: 500 })
  }
}
