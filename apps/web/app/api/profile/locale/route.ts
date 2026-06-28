// POST /api/profile/locale
// Sets the rep's chrome + default generation language.
// Writes rep_profiles.locale AND mirrors it to the NEXT_LOCALE cookie, which is
// what the next-intl chrome resolver (i18n/request.ts) reads. Keeping the DB and
// the cookie in lockstep here is why /setup can change the UI language with a
// single router.refresh(). Called from the /setup language selector.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isSupportedLocale, LOCALE_COOKIE } from '@/lib/i18n/languages'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { locale?: string }
  const locale = body.locale
  // Validate against the shared lookup — adding a language is a code change there,
  // never a schema/validation change here.
  if (!isSupportedLocale(locale)) {
    return Response.json({ error: 'Unsupported locale' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('rep_profiles')
    .upsert(
      { user_id: user.id, locale, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('[profile/locale] DB write error:', error)
    return Response.json({ error: 'Failed to update language.' }, { status: 500 })
  }

  const res = Response.json({ ok: true, locale })
  // 1-year cookie; lax so it rides normal navigations. Mirrors the stored locale.
  res.headers.append(
    'Set-Cookie',
    `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`,
  )
  return res
}
