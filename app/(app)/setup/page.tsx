export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SetupForm from './SetupForm'
import type { RepProfile, Product, TeamConfig } from '@/lib/types'

export const metadata = { title: 'Profile & settings — SalesLord' }

export default async function SetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profileRaw }, { data: products }, { data: teamConfigRaw }] = await Promise.all([
    supabase.from('rep_profiles').select('*').eq('user_id', user.id).single(),
    supabase.from('products').select('*').order('created_at', { ascending: true }),
    supabase.from('team_config').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Strip API key before passing to client — only send whether one is set
  const hasApiKey = !!profileRaw?.anthropic_api_key
  const profile = profileRaw
    ? { ...profileRaw, anthropic_api_key: null } as RepProfile
    : null

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
          profile={profile}
          products={(products ?? []) as Product[]}
          hasApiKey={hasApiKey}
          teamConfig={(teamConfigRaw ?? null) as TeamConfig | null}
        />
      </div>
    </div>
  )
}
