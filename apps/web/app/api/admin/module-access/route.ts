// GET  /api/admin/module-access — list users (signed-in + allowlisted) with their module grants
// POST /api/admin/module-access — grant or revoke one module for one email
// Both require is_admin = true on rep_profiles.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isGatedModuleSlug } from '@/lib/modules'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, adminClient: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) {
    return { user: null, adminClient: null, error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user, adminClient, error: null }
}

export async function GET() {
  const { adminClient, error } = await requireAdmin()
  if (error) return error

  const [usersRes, allowlistRes, grantsRes, profilesRes] = await Promise.all([
    adminClient!.auth.admin.listUsers(),
    adminClient!.from('allowed_emails').select('email'),
    adminClient!.from('module_access').select('email, module'),
    adminClient!.from('rep_profiles').select('user_id, is_admin'),
  ])

  const adminIds = new Set(
    (profilesRes.data ?? []).filter(p => p.is_admin).map(p => p.user_id)
  )

  // Union of everyone who has signed in and everyone pre-authorized by email
  const byEmail = new Map<string, { email: string; is_admin: boolean; signed_up: boolean }>()
  for (const u of usersRes.data?.users ?? []) {
    if (!u.email) continue
    byEmail.set(u.email.toLowerCase(), {
      email: u.email.toLowerCase(),
      is_admin: adminIds.has(u.id),
      signed_up: true,
    })
  }
  for (const row of allowlistRes.data ?? []) {
    const email = row.email.toLowerCase()
    if (!byEmail.has(email)) byEmail.set(email, { email, is_admin: false, signed_up: false })
  }

  const users = Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email))
  const grants = (grantsRes.data ?? []).map(g => ({ email: g.email.toLowerCase(), module: g.module }))

  return Response.json({ users, grants })
}

export async function POST(request: Request) {
  const { user, adminClient, error } = await requireAdmin()
  if (error) return error

  const body = await request.json() as { email?: string; module?: string; granted?: boolean }
  const email = body.email?.trim().toLowerCase()
  const module = body.module?.trim()

  if (!email || !module || typeof body.granted !== 'boolean') {
    return Response.json({ error: 'email, module, and granted are required' }, { status: 400 })
  }
  if (!isGatedModuleSlug(module)) {
    return Response.json({ error: `Unknown module: ${module}` }, { status: 400 })
  }

  if (body.granted) {
    const { error: dbError } = await adminClient!
      .from('module_access')
      .upsert({ email, module, granted_by: user!.id }, { onConflict: 'email,module' })
    if (dbError) return Response.json({ error: 'Failed to grant module' }, { status: 500 })
  } else {
    const { error: dbError } = await adminClient!
      .from('module_access')
      .delete()
      .eq('email', email)
      .eq('module', module)
    if (dbError) return Response.json({ error: 'Failed to revoke module' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
