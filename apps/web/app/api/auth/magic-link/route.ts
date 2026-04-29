import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { email } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      shouldCreateUser: true, // proxy.ts handles access control after session is established
    },
  })

  if (error) {
    console.error('[magic-link] OTP error:', error.message)
    // Return success regardless to avoid email enumeration
  }

  return NextResponse.json({ ok: true })
}
