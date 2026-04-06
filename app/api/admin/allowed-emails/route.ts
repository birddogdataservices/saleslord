// GET  /api/admin/allowed-emails — list all pre-authorized emails
// POST /api/admin/allowed-emails — add an email to the allowlist
// Both require admin = true on rep_profiles.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error: dbError } = await adminClient!
    .from('allowed_emails')
    .select('id, email, note, created_at')
    .order('created_at', { ascending: true })

  if (dbError) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  return Response.json({ emails: data ?? [] })
}

export async function POST(request: Request) {
  const { adminClient, error } = await requireAdmin()
  if (error) return error

  const body = await request.json() as { email?: string; note?: string }
  const email = body.email?.trim().toLowerCase()
  if (!email) return Response.json({ error: 'email is required' }, { status: 400 })

  const { data, error: dbError } = await adminClient!
    .from('allowed_emails')
    .insert({ email, note: body.note?.trim() || null })
    .select('id, email, note, created_at')
    .single()

  if (dbError) {
    if (dbError.code === '23505') {
      return Response.json({ error: 'That email is already on the allowlist.' }, { status: 409 })
    }
    return Response.json({ error: 'Failed to add email' }, { status: 500 })
  }

  return Response.json({ email: data }, { status: 201 })
}
