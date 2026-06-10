export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Root of the app: redirect to the first prospect, or to setup if none exist yet.
export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: prospects } = await supabase
    .from('prospects')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (prospects && prospects.length > 0) {
    redirect(`/prospects/${prospects[0].id}`)
  }

  redirect('/setup')
}
