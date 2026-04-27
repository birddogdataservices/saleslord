// PATCH /api/celord/orgs/[id]/status
// Sets customer_status on an organization and records it in org_status_history.
// Auth: Supabase session (standard user route — not a cron route).

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
  'irrelevant',
  'lead_created_in_crm',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Verify session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const status: CustomerStatus = body.status
  const note: string | undefined = body.note

  if (!VALID_STATUSES.includes(status)) {
    return Response.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { error: updateError } = await adminClient
    .from('organizations')
    .update({
      customer_status:        status,
      customer_status_source: 'manual',
      customer_status_at:     new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

  await adminClient.from('org_status_history').insert({
    org_id:     id,
    status,
    source:     'manual',
    note:       note ?? null,
    changed_at: new Date().toISOString(),
  })

  return Response.json({ ok: true, status })
}
