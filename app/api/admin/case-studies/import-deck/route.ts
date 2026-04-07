// POST /api/admin/case-studies/import-deck
// Admin-only. Accepts a PDF upload, converts each page to PNG via pdf-to-img,
// calls Claude vision per page to extract case study metadata, uploads qualifying
// PNGs to Supabase Storage (case-study-slides bucket), inserts into case_studies.
//
// Import is ADDITIVE — never wipes existing records.
// Re-uploading the same filename creates new records; admin deletes duplicates inline.
//
// Timeout note: Vercel Hobby plan limits serverless functions to 60s.
// Large decks (50+ slides) may exceed this. If so, split the PDF and upload in parts.
// maxDuration is set in vercel.json for this route.
//
// pdf-to-img uses pdfjs-dist under the hood — no system binaries required (Vercel-safe).

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { decryptApiKey } from '@/lib/crypto'
import { pdf } from 'pdf-to-img'

const MODEL = 'claude-sonnet-4-6'
// Per-import slide cap — prevents timeouts on large decks. Import is additive;
// run again with the remainder if needed.
const MAX_SLIDES_PER_RUN = 30

// ─────────────────────────────────────────
// Vision prompt
// ─────────────────────────────────────────
const VISION_SYSTEM = `You are analyzing a slide from a B2B software sales deck.
Determine whether this slide is a customer case study or success story.
If it is, extract the structured metadata. If not, mark it as not a case study.

Return ONLY valid JSON in this exact shape:
{
  "is_case_study": true | false,
  "title": "short descriptive title for this case study",
  "company_name": "customer company name or null",
  "industry": "industry vertical or null (e.g. Manufacturing, Financial Services, Healthcare)",
  "company_size": "Enterprise" | "Mid-market" | "SMB" | null,
  "pain_solved": "1–2 sentences: what problem did they have before",
  "product_used": "which product or feature solved it or null",
  "outcome": "2–3 sentences: measurable results and business impact",
  "tags": ["array", "of", "relevant", "keywords"]
}

If is_case_study is false, you may omit all other fields.
No markdown fencing, no preamble.`

// ─────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────
export async function POST(request: Request) {
  // 1. Auth + admin check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('rep_profiles')
    .select('is_admin, anthropic_api_key')
    .eq('user_id', user.id)
    .single()

  if (!profile?.is_admin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  // BYOK hard gate
  const storedKey = profile?.anthropic_api_key?.trim()
  if (!storedKey) {
    return Response.json(
      { error: 'No Anthropic API key configured. Add your key in Profile & Settings.' },
      { status: 402 }
    )
  }
  let userApiKey: string
  try {
    userApiKey = decryptApiKey(storedKey)
  } catch {
    return Response.json(
      { error: 'Failed to decrypt your API key. Please re-enter it in Profile & Settings.' },
      { status: 500 }
    )
  }

  // 2. Parse file from FormData
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || file.type !== 'application/pdf') {
    return Response.json({ error: 'A PDF file is required.' }, { status: 400 })
  }

  const sourceDeck = file.name
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 3. Convert PDF pages to PNG buffers
  let pages: Buffer[]
  try {
    const doc = await pdf(buffer, { scale: 2.0 })
    const allPages: Buffer[] = []
    for await (const page of doc) {
      allPages.push(page as Buffer)
    }
    // Cap at MAX_SLIDES_PER_RUN
    pages = allPages.slice(0, MAX_SLIDES_PER_RUN)
  } catch (err) {
    console.error('[import-deck] PDF conversion error:', err)
    return Response.json({ error: 'Failed to convert PDF to images. Is the file a valid PDF?' }, { status: 422 })
  }

  if (pages.length === 0) {
    return Response.json({ error: 'PDF has no pages.' }, { status: 422 })
  }

  // 4. Process each page with Claude vision
  const client = new Anthropic({ apiKey: userApiKey })
  let imported = 0

  for (const pageBuffer of pages) {
    const base64 = pageBuffer.toString('base64')

    let parsed: {
      is_case_study: boolean
      title?: string
      company_name?: string
      industry?: string
      company_size?: string
      pain_solved?: string
      product_used?: string
      outcome?: string
      tags?: string[]
    }

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: VISION_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: base64 },
            },
            {
              type: 'text',
              text: 'Analyze this slide. Return only the JSON.',
            },
          ],
        }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') continue

      const raw   = textBlock.text
      const start = raw.indexOf('{')
      const end   = raw.lastIndexOf('}')
      if (start === -1 || end === -1 || end <= start) continue

      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch (err) {
      console.error('[import-deck] Vision call error:', err)
      continue  // skip this slide, continue with rest
    }

    // Skip non-case-study slides
    if (!parsed.is_case_study || !parsed.title) continue

    // 5. Insert DB record first to get the ID for the storage path
    const { data: record, error: insertError } = await adminClient
      .from('case_studies')
      .insert({
        title:        parsed.title.trim(),
        company_name: parsed.company_name ?? null,
        industry:     parsed.industry ?? null,
        company_size: parsed.company_size ?? null,
        pain_solved:  parsed.pain_solved ?? null,
        product_used: parsed.product_used ?? null,
        outcome:      parsed.outcome ?? null,
        tags:         parsed.tags ?? [],
        source_deck:  sourceDeck,
      })
      .select('id')
      .single()

    if (insertError || !record) {
      console.error('[import-deck] DB insert error:', insertError)
      continue
    }

    // 6. Upload PNG to Supabase Storage using the new record's ID
    const storagePath = `${record.id}.png`
    const { error: uploadError } = await adminClient.storage
      .from('case-study-slides')
      .upload(storagePath, pageBuffer, { contentType: 'image/png', upsert: false })

    if (uploadError) {
      console.error('[import-deck] Storage upload error:', uploadError)
      // Keep the DB record but without a slide_image_path — admin can see it in the list
      continue
    }

    // 7. Update the record with the storage path
    await adminClient
      .from('case_studies')
      .update({ slide_image_path: storagePath })
      .eq('id', record.id)

    imported++
  }

  return Response.json({
    imported,
    total_pages_processed: pages.length,
    message: pages.length === MAX_SLIDES_PER_RUN
      ? `Processed first ${MAX_SLIDES_PER_RUN} pages. If your deck has more slides, upload the remaining pages as a separate PDF.`
      : `Processed all ${pages.length} pages.`,
  })
}
