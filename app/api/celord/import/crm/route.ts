// POST /api/celord/import/crm
// CSV import for bulk customer_status updates.
// CSV columns: org_name (or name), domain (optional), status, note (optional)
// Matching: domain exact → normalized name ≥ 0.70 → create new org.
// Auth: Supabase session (standard user route).

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { CustomerStatus } from '@/core/types'

const VALID_STATUSES: CustomerStatus[] = [
  'unknown',
  'prospect',
  'active_customer',
  'former_customer',
  'failed_enterprise_conversion',
  'do_not_contact',
]

// ── Name normalization ─────────────────────────────────────────────────────────

const LEGAL_SUFFIXES = /\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|gmbh|ag|bv|sa|plc|pty|limited|incorporated|corporation|company)\b/gi

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function jaccardSimilarity(a: string, b: string): number {
  const tokA = new Set(a.split(' ').filter(Boolean))
  const tokB = new Set(b.split(' ').filter(Boolean))
  const intersection = [...tokA].filter(t => tokB.has(t)).length
  const union = new Set([...tokA, ...tokB]).size
  return union === 0 ? 0 : intersection / union
}

// ── CSV parsing ────────────────────────────────────────────────────────────────

type CsvRow = {
  org_name: string
  domain: string | null
  status: CustomerStatus
  note: string | null
}

type ParseError = { line: number; reason: string }

function parseCsv(text: string): { rows: CsvRow[]; errors: ParseError[] } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const rows: CsvRow[] = []
  const errors: ParseError[] = []

  if (lines.length === 0) return { rows, errors: [{ line: 0, reason: 'Empty file' }] }

  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim())
  const colIdx = {
    nameA:  header.indexOf('org_name'),
    nameB:  header.indexOf('name'),
    domain: header.indexOf('domain'),
    status: header.indexOf('status'),
    note:   header.indexOf('note'),
  }

  const nameIdx = colIdx.nameA >= 0 ? colIdx.nameA : colIdx.nameB
  if (nameIdx < 0) {
    return { rows, errors: [{ line: 1, reason: 'Missing required column: org_name or name' }] }
  }
  if (colIdx.status < 0) {
    return { rows, errors: [{ line: 1, reason: 'Missing required column: status' }] }
  }

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1
    const cols = splitCsvLine(lines[i])

    const org_name = (cols[nameIdx] ?? '').trim()
    if (!org_name) {
      errors.push({ line: lineNum, reason: 'Empty org_name — skipped' })
      continue
    }

    const rawStatus = (cols[colIdx.status] ?? '').trim().toLowerCase() as CustomerStatus
    if (!VALID_STATUSES.includes(rawStatus)) {
      errors.push({ line: lineNum, reason: `Invalid status "${rawStatus}" for "${org_name}"` })
      continue
    }

    const domain = colIdx.domain >= 0 ? ((cols[colIdx.domain] ?? '').trim() || null) : null
    const note   = colIdx.note >= 0   ? ((cols[colIdx.note]   ?? '').trim() || null) : null

    rows.push({ org_name, domain, status: rawStatus, note })
  }

  return { rows, errors }
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let inQuote = false
  let current = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ── Import handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const text = await request.text()
  const { rows: csvRows, errors: parseErrors } = parseCsv(text)

  if (csvRows.length === 0) {
    return Response.json({ error: 'No valid rows to import', parseErrors }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Load all existing orgs once for in-memory matching
  const { data: existingOrgs } = await adminClient
    .from('organizations')
    .select('id, name, domain')
  const orgs = (existingOrgs ?? []) as { id: string; name: string; domain: string | null }[]

  let matched = 0
  let created = 0
  const rowErrors: string[] = parseErrors.map(e => `Line ${e.line}: ${e.reason}`)
  const now = new Date().toISOString()

  for (const row of csvRows) {
    let orgId: string | null = null
    let isNew = false

    // Pass 1: exact domain match
    if (row.domain) {
      const clean = row.domain.toLowerCase().replace(/^www\./, '')
      const hit = orgs.find(o => o.domain?.toLowerCase().replace(/^www\./, '') === clean)
      if (hit) orgId = hit.id
    }

    // Pass 2: fuzzy name match
    if (!orgId) {
      const normRow = normalizeName(row.org_name)
      let bestSim = 0
      let bestId: string | null = null
      for (const o of orgs) {
        const sim = jaccardSimilarity(normRow, normalizeName(o.name))
        if (sim > bestSim) { bestSim = sim; bestId = o.id }
      }
      if (bestSim >= 0.70 && bestId) orgId = bestId
    }

    // Pass 3: create new org
    if (!orgId) {
      const { data: newOrg, error: insertError } = await adminClient
        .from('organizations')
        .insert({
          name:                   row.org_name,
          domain:                 row.domain ?? null,
          org_type:               'unknown',
          customer_status:        row.status,
          customer_status_source: 'csv_import',
          customer_status_at:     now,
          updated_at:             now,
        })
        .select('id')
        .single()

      if (insertError || !newOrg) {
        rowErrors.push(`Could not create org for "${row.org_name}": ${insertError?.message ?? 'unknown error'}`)
        continue
      }

      const newId = newOrg.id
      orgId = newId
      isNew = true
      created++
      orgs.push({ id: newId, name: row.org_name, domain: row.domain ?? null })
    }

    // Update status on matched orgs (created orgs already have it set)
    if (!isNew) {
      matched++
      await adminClient
        .from('organizations')
        .update({
          customer_status:        row.status,
          customer_status_source: 'csv_import',
          customer_status_at:     now,
          updated_at:             now,
        })
        .eq('id', orgId)
    }

    // Always write status history
    await adminClient.from('org_status_history').insert({
      org_id:     orgId,
      status:     row.status,
      source:     'csv_import',
      note:       row.note ?? null,
      changed_at: now,
    })
  }

  return Response.json({
    ok: true,
    imported: csvRows.length,
    matched,
    created,
    errors: rowErrors,
  })
}
