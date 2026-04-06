export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/prospect/Sidebar'
import type { ProspectSidebarItem } from '@/lib/types'
import { computeWindowStatus } from '@/lib/utils'

// Fetches sidebar data (all prospects + monthly cost) once per layout render.
// Child pages (prospect detail, setup) render inside the {children} slot.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Sidebar prospects — join with latest brief to get window_status + fy_end
  const { data: prospects } = await supabase
    .from('prospects')
    .select(`
      id,
      name,
      last_refreshed_at,
      prospect_briefs (
        timing
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Monthly API cost
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data: usageRows } = await supabase
    .from('api_usage')
    .select('cost_usd')
    .eq('user_id', user.id)
    .gte('created_at', startOfMonth.toISOString())

  const monthlyCostUsd = (usageRows ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0)

  // Admin flag
  const { data: profile } = await supabase
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()
  const isAdmin = profile?.is_admin ?? false

  // Shape into ProspectSidebarItem[]
  const sidebarItems: ProspectSidebarItem[] = (prospects ?? []).map(p => {
    const briefs = (p as any).prospect_briefs as Array<{ timing: any }> | null
    const timing = briefs?.[0]?.timing ?? null
    return {
      id:               p.id,
      name:             p.name,
      last_refreshed_at: p.last_refreshed_at,
      // Compute window_status live — stored value goes stale as time passes
      window_status:    timing?.fy_end ? computeWindowStatus(timing.fy_end) : null,
      fy_end:           timing?.fy_end
                          ? new Date(`${timing.fy_end} 2000`).toLocaleString('en-US', { month: 'short' })
                          : null,
    }
  })

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar prospects={sidebarItems} monthlyCostUsd={monthlyCostUsd} isAdmin={isAdmin} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
