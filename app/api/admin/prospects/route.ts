import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET — admin: list all prospects with owner email + name
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('rep_profiles').select('is_admin').eq('user_id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()

  const [prospectsRes, usersRes] = await Promise.all([
    adminClient.from('prospects').select('id, user_id, name, archived_at, created_at').order('created_at', { ascending: false }),
    adminClient.auth.admin.listUsers(),
  ])

  if (prospectsRes.error) return NextResponse.json({ error: prospectsRes.error.message }, { status: 500 })

  const userMap = new Map(
    (usersRes.data?.users ?? []).map(u => [u.id, u.email ?? u.id])
  )

  const prospects = (prospectsRes.data ?? []).map(p => ({
    ...p,
    owner_email: userMap.get(p.user_id) ?? p.user_id,
  }))

  // Also return user list for the reassign dropdown
  const users = (usersRes.data?.users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? u.id,
  }))

  return NextResponse.json({ prospects, users })
}
