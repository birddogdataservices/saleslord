export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminCaseStudiesClient from './AdminCaseStudiesClient'
import type { CaseStudy } from '@/lib/types'

export const metadata = { title: 'Case studies — SalesLord' }

export default async function AdminCaseStudiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin gate
  const { data: profile } = await supabase
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/setup')

  // Fetch case studies via admin client (service role) — consistent with write routes
  const adminClient = createAdminClient()
  const { data: caseStudies } = await adminClient
    .from('case_studies')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--sl-bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-[18px] font-semibold" style={{ color: 'var(--sl-text)' }}>
            Case studies
          </h1>
          <p className="text-[12px] mt-1" style={{ color: 'var(--sl-text2)' }}>
            Upload your customer success deck to seed the library. Reps can then match relevant case studies to prospects in one click.
          </p>
        </div>

        <AdminCaseStudiesClient
          initialCaseStudies={(caseStudies ?? []) as CaseStudy[]}
        />
      </div>
    </div>
  )
}
