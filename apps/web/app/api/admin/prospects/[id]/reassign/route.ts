import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('rep_profiles').select('is_admin').eq('user_id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { to_user_id } = await request.json()
  if (!to_user_id) return NextResponse.json({ error: 'to_user_id required' }, { status: 400 })

  const adminClient = createAdminClient()

  // Verify target user exists
  const { data: targetUser, error: userErr } = await adminClient.auth.admin.getUserById(to_user_id)
  if (userErr || !targetUser.user) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })

  const { error } = await adminClient
    .from('prospects')
    .update({ user_id: to_user_id })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
