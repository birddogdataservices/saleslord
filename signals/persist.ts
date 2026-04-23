// Signal persistence — writes RawSignals to the CELord DB tables.
// Called by cron routes; receives admin Supabase client as a dependency
// (no Supabase imports here — package-in-waiting discipline).
//
// Entity resolution strategy (v0 — simple, deterministic):
//   1. If org_domain present: match on organizations.domain (exact)
//   2. Otherwise: match on organizations.name (case-insensitive exact)
//   3. Create org row if no match found
// Full fuzzy + LLM-assisted resolution is Session 3.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawSignal } from './collectors/types'

export type PersistResult = {
  inserted: number   // new signals written
  skipped: number    // signals already in DB (deduped by source_url)
  orgsCreated: number
}

export async function persistSignals(
  signals: RawSignal[],
  client: SupabaseClient,
): Promise<PersistResult> {
  let inserted = 0
  let skipped = 0
  let orgsCreated = 0

  for (const signal of signals) {
    // ── 1. Dedupe by source_url ──────────────────────────────────
    const { data: existing } = await client
      .from('signals')
      .select('id')
      .eq('source_url', signal.source_url)
      .maybeSingle()

    let signalId: string

    if (existing) {
      skipped++
      signalId = existing.id
    } else {
      const { data: inserted_, error } = await client
        .from('signals')
        .insert({
          source:         signal.source,
          source_url:     signal.source_url,
          snippet:        signal.snippet,
          org_hint:       signal.org_hint,
          org_domain:     signal.org_domain,
          country:        signal.country,
          state_province: signal.state_province,
          signal_date:    signal.signal_date,
          collected_at:   signal.collected_at,
        })
        .select('id')
        .single()

      if (error || !inserted_) continue
      signalId = inserted_.id
      inserted++
    }

    // ── 2. Resolve or create organization ────────────────────────
    const { orgId, created } = await resolveOrg(signal, client)
    if (!orgId) continue
    if (created) orgsCreated++

    // ── 3. Upsert signal_link ─────────────────────────────────────
    await client
      .from('signal_links')
      .upsert(
        {
          org_id:     orgId,
          signal_id:  signalId,
          confidence: signal.org_domain ? 0.90 : 0.70,
          method:     signal.org_domain ? 'domain_exact' : 'fuzzy_name',
        },
        { onConflict: 'org_id,signal_id' },
      )
  }

  return { inserted, skipped, orgsCreated }
}

// ─────────────────────────────────────────
// Org resolution
// ─────────────────────────────────────────

async function resolveOrg(
  signal: RawSignal,
  client: SupabaseClient,
): Promise<{ orgId: string | null; created: boolean }> {
  // 1. Domain exact match
  if (signal.org_domain) {
    const { data } = await client
      .from('organizations')
      .select('id')
      .eq('domain', signal.org_domain)
      .maybeSingle()

    if (data) return { orgId: data.id, created: false }

    const { data: created } = await client
      .from('organizations')
      .insert({ name: signal.org_hint, domain: signal.org_domain })
      .select('id')
      .single()

    return { orgId: created?.id ?? null, created: true }
  }

  // 2. Case-insensitive name match
  const { data } = await client
    .from('organizations')
    .select('id')
    .ilike('name', signal.org_hint)
    .maybeSingle()

  if (data) return { orgId: data.id, created: false }

  // 3. Create without domain
  const { data: created } = await client
    .from('organizations')
    .insert({ name: signal.org_hint })
    .select('id')
    .single()

  return { orgId: created?.id ?? null, created: true }
}
