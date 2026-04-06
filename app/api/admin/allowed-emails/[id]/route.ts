// DELETE /api/admin/allowed-emails/[id] — remove an email from the allowlist
// Requires admin = true on rep_profiles.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await adminClient
    .from('allowed_emails')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: 'Failed to remove email' }, { status: 500 })
  return new Response(null, { status: 204 })
}
