import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch current state — must be owned by this user
  const { data: prospect } = await supabase
    .from('prospects')
    .select('id, archived_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!prospect) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const adminClient = createAdminClient()
  const newArchivedAt = prospect.archived_at ? null : new Date().toISOString()

  const { error } = await adminClient
    .from('prospects')
    .update({ archived_at: newArchivedAt })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ archived: newArchivedAt !== null })
}
