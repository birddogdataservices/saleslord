import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/auth/callback', '/access-denied']

// Cron routes authenticate via Bearer CRON_SECRET — bypass Supabase auth
const CRON_PATHS = ['/api/celord/collect/']

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required for Server Components to pick up the session
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return supabaseResponse
  }

  // Cron routes use Bearer CRON_SECRET — skip Supabase auth
  if (CRON_PATHS.some(p => pathname.startsWith(p))) {
    return supabaseResponse
  }

  // Not logged in → send to login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // ── Access control ──────────────────────────────────────────────
  // Primary gate: company email domain (set ALLOWED_DOMAIN env var)
  // Fallback gate: allowed_emails table (for guests / contractors)
  const allowedDomain = process.env.ALLOWED_DOMAIN  // e.g. "yourcompany.com"
  const email = user.email ?? ''

  const domainAllowed = allowedDomain ? email.endsWith(`@${allowedDomain}`) : false

  if (!domainAllowed) {
    // Check the allowlist table via a direct fetch (avoids importing admin client in middleware)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const res = await fetch(
      `${supabaseUrl}/rest/v1/allowed_emails?email=eq.${encodeURIComponent(email)}&select=email`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    )

    const rows: { email: string }[] = await res.json()

    if (!rows?.length) {
      await supabase.auth.signOut()
      const deniedUrl = request.nextUrl.clone()
      deniedUrl.pathname = '/access-denied'
      return NextResponse.redirect(deniedUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  // Next.js 16 proxy (formerly middleware) matcher
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
