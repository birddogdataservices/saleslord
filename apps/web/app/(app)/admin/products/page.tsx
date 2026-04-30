export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminProductsClient from './AdminProductsClient'
import type { Product } from '@/lib/types'

export const metadata = { title: 'Manage products — SalesLord' }

export default async function AdminProductsPage() {
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

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--sl-bg)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-[18px] font-semibold" style={{ color: 'var(--sl-text)' }}>
            Products
          </h1>
          <p className="text-[12px] mt-1" style={{ color: 'var(--sl-text2)' }}>
            All products are used in every research call across the team. All reps see all products.
          </p>
        </div>

        <AdminProductsClient
          initialProducts={(products ?? []) as Product[]}
          userId={user.id}
        />
      </div>
    </div>
  )
}
