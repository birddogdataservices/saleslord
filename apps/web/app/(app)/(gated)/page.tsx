export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

// Root of the app: open the most recent prospect, or — when there are none —
// invite the rep to add their first one.
//
// This used to redirect to /setup when the prospect list was empty. That was
// only correct for a rep who had not finished setting up; the (gated) layout
// already sends anyone without products there. A fully configured rep who had
// simply archived everything, or who was starting a new week, got dropped into
// a settings form with no explanation and nothing to do.
export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const t = await getTranslations('Home')

  const { data: prospects } = await supabase
    .from('prospects')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (prospects && prospects.length > 0) {
    redirect(`/prospects/${prospects[0].id}`)
  }

  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto px-6 py-[18px]">
      <div
        className="rounded-[10px] px-8 py-10 text-center max-w-[440px] mt-[10vh]"
        style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
      >
        <p className="text-[14px] font-semibold" style={{ color: 'var(--sl-text)' }}>
          {t('emptyTitle')}
        </p>
        <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
          {/* Points at the sidebar input rather than duplicating it here — one
              way to add a prospect, not two that can drift apart. */}
          {t('emptyBody')}
        </p>
      </div>
    </div>
  )
}
