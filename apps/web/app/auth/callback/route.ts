import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Google OAuth callback — exchanges the code for a session, then redirects.
// Supabase handles the PKCE exchange; we just need to call exchangeCodeForSession.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')

  if (error) {
    console.error('[auth/callback] OAuth error:', error, searchParams.get('error_description'))
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('[auth/callback] Exchange error:', exchangeError.message)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    // Ensure the rep profile row exists (upsert with empty defaults)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('rep_profiles')
        .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
