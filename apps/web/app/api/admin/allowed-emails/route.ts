// GET  /api/admin/allowed-emails — list all pre-authorized emails
// POST /api/admin/allowed-emails — add an email to the allowlist
// Both require admin = true on rep_profiles.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/utils'
import type { InviteStatus } from '@/lib/types'

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

  // Format check before the insert. The allowlist is permanent and now also
  // triggers mail, so a typo like "jon@compnay.com" would be stored forever and
  // silently emailed into the void. allowed_emails.email carries a matching
  // CHECK constraint — this is the layer that produces a usable error message.
  if (!isValidEmail(email)) {
    return Response.json({ error: 'That doesn\'t look like a valid email address.' }, { status: 400 })
  }

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

  // Fire the invite email (one-click login link → /auth/callback). Non-fatal:
  // the email is already on the allowlist, so a send failure (rate limits, SMTP)
  // must not roll back the add. Admins can resend from the allowlist UI.
  let invite: InviteStatus = 'sent'
  const { error: inviteError } = await adminClient!.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  })

  if (inviteError) {
    // Supabase refuses to invite an address that already has an auth user —
    // the normal case for anyone who has signed in with Google, or who was
    // allowlisted, removed and re-added. That is not a failure: they can
    // already sign in. Only a genuine send problem should prompt a retry.
    const alreadyRegistered =
      inviteError.code === 'email_exists' ||
      inviteError.code === 'user_already_exists' ||
      /already.*(registered|exists)/i.test(inviteError.message)

    invite = alreadyRegistered ? 'already_registered' : 'failed'
    if (!alreadyRegistered) console.error('[allowed-emails] invite failed:', inviteError.message)
  }

  return Response.json({ email: data, invite }, { status: 201 })
}
