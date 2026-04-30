// POST /api/case-studies/export-pdf
// Auth-gated. No Anthropic call. Does NOT log to api_usage.
// Fetches selected case study records + generates signed URLs for slide images,
// assembles a PDF using @react-pdf/renderer, and streams it as a download.
//
// Input: { case_study_ids: string[], prospect_name: string }
// Output: PDF binary stream with Content-Disposition: attachment

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import CaseStudiesPdf from '@/lib/pdf/CaseStudiesPdf'
import type { CaseStudy } from '@/lib/types'

const SIGNED_URL_EXPIRY_SECONDS = 300  // 5 minutes — enough for server-side render

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Parse body
  const { case_study_ids, prospect_name } = await request.json() as {
    case_study_ids?: string[]
    prospect_name?: string
  }

  if (!case_study_ids?.length) {
    return Response.json({ error: 'At least one case_study_id is required' }, { status: 400 })
  }
  const name = prospect_name?.trim() || 'Prospect'

  const adminClient = createAdminClient()

  // 3. Fetch selected case study records
  const { data: records, error: fetchError } = await adminClient
    .from('case_studies')
    .select('id, company_name, outcome, slide_image_path')
    .in('id', case_study_ids)

  if (fetchError || !records?.length) {
    return Response.json({ error: 'Could not fetch case study records' }, { status: 500 })
  }

  // Preserve selection order
  const orderedRecords = case_study_ids
    .map(id => records.find(r => r.id === id))
    .filter((r): r is CaseStudy => r !== null && r !== undefined)

  // 4. Generate signed URLs for each slide (in parallel)
  const slidesWithUrls = await Promise.all(
    orderedRecords.map(async record => {
      if (!record.slide_image_path) {
        return { imageUrl: null, company: record.company_name, outcome: record.outcome }
      }

      const { data: signedData } = await adminClient.storage
        .from('case-study-slides')
        .createSignedUrl(record.slide_image_path, SIGNED_URL_EXPIRY_SECONDS)

      return {
        imageUrl: signedData?.signedUrl ?? null,
        company:  record.company_name,
        outcome:  record.outcome,
      }
    })
  )

  // Filter out slides without images
  const validSlides = slidesWithUrls.filter(
    (s): s is { imageUrl: string; company: string | null; outcome: string | null } =>
      s.imageUrl !== null
  )

  if (validSlides.length === 0) {
    return Response.json({ error: 'None of the selected case studies have slide images.' }, { status: 422 })
  }

  // 5. Render PDF using the CaseStudiesPdf component (defined in lib/pdf/CaseStudiesPdf.tsx)
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  let pdfBuffer: Buffer
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfBuffer = await renderToBuffer(
      React.createElement(CaseStudiesPdf, { prospectName: name, slides: validSlides, date }) as any
    )
  } catch (err) {
    console.error('[export-pdf] Render error:', err)
    return Response.json({ error: 'Failed to render PDF' }, { status: 500 })
  }

  // 6. Return as download
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-case-studies.pdf`

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(pdfBuffer.length),
    },
  })
}
