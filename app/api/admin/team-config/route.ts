import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// GET — return the singleton team_config row (null if not yet seeded)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('team_config')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ config: data })
}

// PUT — admin-only upsert of the singleton row
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Admin gate
  const { data: profile } = await adminClient
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json() as { seniority_bands?: string[]; target_functions?: string[] }
  if (!Array.isArray(body.seniority_bands) || !Array.isArray(body.target_functions)) {
    return Response.json({ error: 'seniority_bands and target_functions must be arrays' }, { status: 400 })
  }

  // Fetch existing row id (if any) so we can upsert by id
  const { data: existing } = await adminClient
    .from('team_config')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const payload = {
    ...(existing?.id ? { id: existing.id } : {}),
    seniority_bands:  body.seniority_bands,
    target_functions: body.target_functions,
    updated_at:       new Date().toISOString(),
  }

  const { data, error } = await adminClient
    .from('team_config')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ config: data })
}
