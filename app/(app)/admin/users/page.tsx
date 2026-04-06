export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminUsersClient from './AdminUsersClient'

export const metadata = { title: 'Manage team — SalesLord' }

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin gate — redirect non-admins
  const { data: profile } = await supabase
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/setup')

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--sl-bg)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-[18px] font-semibold" style={{ color: 'var(--sl-text)' }}>
            Team access
          </h1>
          <p className="text-[12px] mt-1" style={{ color: 'var(--sl-text2)' }}>
            Pre-authorize teammates by email. They must sign in with the matching Google account.
            Each person uses their own Anthropic API key — add it in their Profile &amp; Settings.
          </p>
        </div>

        <AdminUsersClient />
      </div>
    </div>
  )
}
