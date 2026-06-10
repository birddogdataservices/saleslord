export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Mandatory-product gate. Every ProspectLord route in this group requires the
// user to have created at least one product — briefs, emails, and research are
// all generated against product context, so the app is unusable without one.
// /setup lives outside this group: it's where the redirect lands and where
// products are created, so it must never be gated itself.
export default async function ProductGateLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if ((count ?? 0) === 0) redirect('/setup')

  return <>{children}</>
}
