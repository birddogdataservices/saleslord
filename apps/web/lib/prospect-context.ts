// Shared loaders for the cheap, brief-grounded generation routes
// (refresh-email, pitch-opener). These routes all need the same things:
// the prospect + its latest brief + the rep profile + the rep's products,
// scoped and ownership-checked, plus the rep's decrypted Anthropic key.
//
// Extracted here so both routes stay in sync — change the fetch shape or the
// products-block format once, and every brief-grounded generator follows.
// Server-side only: imported by API route handlers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptApiKey } from '@/lib/crypto'

// Product shape used for prompt building — includes id so routes can filter
// to a single focused product. (ProductPromptContext omits id by design.)
export type ProductForPrompt = {
  id: string
  name: string
  description: string
  value_props: string
  competitors: string
}

export type ProspectContext = {
  prospect: any
  brief: any
  profile: any
  allProducts: ProductForPrompt[]
}

// Discriminated result so callers translate failures to their own Response.
type Loaded<T> = { ok: true; value: T } | { ok: false; status: number; error: string }

// Loads prospect + latest brief + rep profile + products in parallel, with an
// ownership check. adminClient bypasses RLS, so we verify the prospect belongs
// to the caller — 404 (not 403) to avoid confirming the id exists.
export async function loadProspectContext(
  adminClient: SupabaseClient,
  prospectId: string,
  userId: string,
): Promise<Loaded<ProspectContext>> {
  const [prospectRes, briefRes, profileRes, productRes] = await Promise.all([
    adminClient.from('prospects').select('*').eq('id', prospectId).single(),
    adminClient.from('prospect_briefs').select('*').eq('prospect_id', prospectId)
      .order('created_at', { ascending: false }).limit(1).single(),
    adminClient.from('rep_profiles').select('*').eq('user_id', userId).single(),
    adminClient.from('products').select('id, name, description, value_props, competitors')
      .eq('user_id', userId).order('created_at', { ascending: true }),
  ])

  if (!prospectRes.data || prospectRes.data.user_id !== userId)
    return { ok: false, status: 404, error: 'Prospect not found' }
  if (!briefRes.data)
    return { ok: false, status: 404, error: 'No brief found — run research first' }

  return {
    ok: true,
    value: {
      prospect:    prospectRes.data,
      brief:       briefRes.data,
      profile:     profileRes.data,
      allProducts: (productRes.data ?? []) as ProductForPrompt[],
    },
  }
}

// BYOK hard gate — decrypt the rep's stored Anthropic key. No platform fallback.
export function getUserAnthropicKey(profile: any): Loaded<string> {
  const storedKey = profile?.anthropic_api_key?.trim()
  if (!storedKey)
    return { ok: false, status: 402, error: 'No Anthropic API key configured. Add your key in Profile & Settings.' }
  try {
    return { ok: true, value: decryptApiKey(storedKey) }
  } catch {
    return { ok: false, status: 500, error: 'Failed to decrypt your API key. Please re-enter it in Profile & Settings.' }
  }
}

// Resolves the products to feed the prompt: if productId is given and matches,
// focus on that one; otherwise pass all and let the model pick the relevant one.
export function resolveProducts(
  allProducts: ProductForPrompt[],
  productId?: string,
): { active: ProductForPrompt[]; focused: boolean } {
  if (productId) {
    const match = allProducts.filter(p => p.id === productId)
    if (match.length === 1) return { active: match, focused: true }
  }
  return { active: allProducts, focused: false }
}

// Builds the "Products" block of a generation system prompt.
export function buildProductsBlock(active: ProductForPrompt[], focused: boolean): string {
  if (active.length === 0) return 'Products: not specified'
  const fmt = (p: ProductForPrompt) =>
    `${p.name} — ${p.description}. Value props: ${p.value_props}. Competes with: ${p.competitors}`
  if (focused)
    return `Product (focus this entirely on this product): ${fmt(active[0])}`
  if (active.length === 1)
    return `Product: ${fmt(active[0])}`
  return `Products (match the most relevant to this prospect):\n${active
    .map((p, i) => `  ${i + 1}. ${fmt(p)}`)
    .join('\n')}`
}
