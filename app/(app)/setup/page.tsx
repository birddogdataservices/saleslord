export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SetupForm from './SetupForm'
import type { RepProfile, Product } from '@/lib/types'

export const metadata = { title: 'Profile & settings — SalesLord' }

export default async function SetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: products }] = await Promise.all([
    supabase.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    supabase.from('products').select('*').order('created_at', { ascending: true }),
  ])

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--sl-bg)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[18px] font-semibold text-[var(--sl-text)]">Profile &amp; settings</h1>
          <p className="text-[12px] text-[var(--sl-text2)] mt-1">
            This context is injected into every research and email generation call.
            The more complete it is, the better the output.
          </p>
        </div>

        <SetupForm
          profile={profile as RepProfile | null}
          products={(products ?? []) as Product[]}
        />
      </div>
    </div>
  )
}
