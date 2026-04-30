// GET /api/case-studies/slide-url/[id]
// Returns a short-lived signed URL for a single case study slide image.
// Auth-gated. Never exposes the bucket URL directly.
// Slide images are private — always served via signed URLs.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const SIGNED_URL_EXPIRY_SECONDS = 3600  // 1 hour

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth — any authenticated user can request a slide URL
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()

  // Fetch the slide_image_path for this case study
  const { data: record, error } = await adminClient
    .from('case_studies')
    .select('slide_image_path')
    .eq('id', id)
    .single()

  if (error || !record) return Response.json({ error: 'Case study not found' }, { status: 404 })
  if (!record.slide_image_path) return Response.json({ error: 'No slide image for this case study' }, { status: 404 })

  // Generate short-lived signed URL via admin client (service role)
  const { data: signedData, error: signError } = await adminClient.storage
    .from('case-study-slides')
    .createSignedUrl(record.slide_image_path, SIGNED_URL_EXPIRY_SECONDS)

  if (signError || !signedData?.signedUrl) {
    console.error('[slide-url] Signed URL error:', signError)
    return Response.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  return Response.json({ url: signedData.signedUrl })
}
