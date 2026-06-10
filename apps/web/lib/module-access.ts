// Server-side module access lookup for rendering (ribbon tabs).
// Enforcement (blocking routes) lives in proxy.ts — this is display-only.
// Uses the RLS client: rep_profiles and module_access both have select-own
// policies, so no service role key is needed here.

import { createClient } from '@/lib/supabase/server'
import { MODULES, type ModuleSlug } from '@/lib/modules'

// Modules the current user can see. ProspectLord is always included for
// signed-in users; admins get everything; others get their module_access
// grants. Returns [] when not signed in (login / access-denied pages).
export async function getAccessibleModules(): Promise<ModuleSlug[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.is_admin) return MODULES.map(m => m.slug)

  const { data: grants } = await supabase
    .from('module_access')
    .select('module')
    .eq('email', (user.email ?? '').toLowerCase())

  const granted = new Set((grants ?? []).map(g => g.module))
  return MODULES.filter(m => !m.gated || granted.has(m.slug)).map(m => m.slug)
}
