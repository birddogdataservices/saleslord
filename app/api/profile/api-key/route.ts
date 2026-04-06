// POST /api/profile/api-key
// Encrypts and stores the user's Anthropic API key.
// The raw key is never written to the DB — only the AES-256-GCM ciphertext.
// Called from SetupForm when the user submits a new key.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { encryptApiKey } from '@/lib/crypto'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { api_key?: string }
  const rawKey = body.api_key?.trim()
  if (!rawKey) return Response.json({ error: 'api_key is required' }, { status: 400 })

  // Basic sanity check — Anthropic keys start with sk-ant-
  if (!rawKey.startsWith('sk-ant-')) {
    return Response.json({ error: 'That doesn\'t look like an Anthropic API key (should start with sk-ant-).' }, { status: 400 })
  }

  let encrypted: string
  try {
    encrypted = encryptApiKey(rawKey)
  } catch (err: any) {
    console.error('[api-key] Encryption failed:', err?.message)
    return Response.json({ error: 'Encryption configuration error. Contact your admin.' }, { status: 500 })
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('rep_profiles')
    .upsert(
      { user_id: user.id, anthropic_api_key: encrypted, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('[api-key] DB write error:', error)
    return Response.json({ error: 'Failed to save key.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
