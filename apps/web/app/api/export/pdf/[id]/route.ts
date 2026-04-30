import { renderToStream } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BriefPdf } from '@/components/prospect/BriefPdf'
import type { ProspectBrief, DecisionMaker } from '@/lib/types'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const [prospectRes, briefRes, dmsRes] = await Promise.all([
    supabase.from('prospects').select('*').eq('id', id).single(),
    supabase.from('prospect_briefs').select('*').eq('prospect_id', id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('decision_makers').select('*').eq('prospect_id', id).order('sort_order'),
  ])

  if (!prospectRes.data) notFound()
  if (!briefRes.data)    return new Response('No brief found for this prospect', { status: 404 })

  const prospect = prospectRes.data
  const brief    = briefRes.data as ProspectBrief
  const dms      = (dmsRes.data ?? []) as DecisionMaker[]

  const exportedAt = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  // renderToStream requires a React element — createElement avoids JSX in a .ts file
  const element = createElement(BriefPdf, { prospectName: prospect.name, brief, dms, exportedAt })
  const stream  = await renderToStream(element as any)

  const filename = `${prospect.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-brief.pdf`

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
