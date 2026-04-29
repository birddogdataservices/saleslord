// GET  /api/admin/case-studies — list all case studies
// POST /api/admin/case-studies — create one manually
// DELETE /api/admin/case-studies?id=<uuid> — delete by id (also removes storage file)
// All endpoints: admin-only via service role

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { CaseStudy } from '@/lib/types'

async function assertAdmin(userId: string): Promise<boolean> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('rep_profiles')
    .select('is_admin')
    .eq('user_id', userId)
    .single()
  return data?.is_admin === true
}

// ── GET: list all ─────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdmin(user.id))) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('case_studies')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as CaseStudy[])
}

// ── POST: create one ──────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdmin(user.id))) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json() as Partial<CaseStudy>
  if (!body.title?.trim()) return Response.json({ error: 'title is required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('case_studies')
    .insert({
      title:            body.title.trim(),
      company_name:     body.company_name ?? null,
      industry:         body.industry ?? null,
      company_size:     body.company_size ?? null,
      pain_solved:      body.pain_solved ?? null,
      product_used:     body.product_used ?? null,
      outcome:          body.outcome ?? null,
      tags:             body.tags ?? [],
      slide_image_path: body.slide_image_path ?? null,
      source_deck:      body.source_deck ?? null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as CaseStudy, { status: 201 })
}

// ── DELETE: remove by id ──────────────────────────────────────────
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertAdmin(user.id))) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const adminClient = createAdminClient()

  // Fetch the record first to get slide_image_path for storage cleanup
  const { data: record } = await adminClient
    .from('case_studies')
    .select('slide_image_path')
    .eq('id', id)
    .single()

  // Delete from DB
  const { error } = await adminClient
    .from('case_studies')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Best-effort: remove storage file if it exists
  if (record?.slide_image_path) {
    await adminClient.storage
      .from('case-study-slides')
      .remove([record.slide_image_path])
  }

  return Response.json({ deleted: id })
}
