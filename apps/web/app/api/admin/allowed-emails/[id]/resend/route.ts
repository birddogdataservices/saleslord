// POST /api/admin/allowed-emails/[id]/resend — re-send a login link to an
// allowlisted email. Uses a magic-link (signInWithOtp) rather than
// inviteUserByEmail: the invitee's auth user already exists once they've been
// invited, and inviteUserByEmail errors for existing users. signInWithOtp works
// whether or not they've signed in yet. Requires admin = true on rep_profiles.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(
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

  // Resolve the email from the allowlist row — don't trust a client-supplied address.
  const { data: entry } = await adminClient
    .from('allowed_emails')
    .select('email')
    .eq('id', id)
    .single()

  if (!entry) return Response.json({ error: 'Email not found' }, { status: 404 })

  // Reuse the same magic-link path as the login page.
  const { error } = await supabase.auth.signInWithOtp({
    email: entry.email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      shouldCreateUser: true,
    },
  })

  if (error) {
    console.error('[allowed-emails/resend] OTP error:', error.message)
    return Response.json({ error: 'Failed to send invite' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
