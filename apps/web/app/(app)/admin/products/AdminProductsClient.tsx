'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import type { Product } from '@/lib/types'

type ProductDraft = Omit<Product, 'id' | 'created_by' | 'created_at'>

const EMPTY_DRAFT: ProductDraft = { name: '', description: '', value_props: '', competitors: '' }

type Props = {
  initialProducts: Product[]
  userId: string
}

export default function AdminProductsClient({ initialProducts, userId }: Props) {
  const supabase = createClient()

  const [products, setProducts]     = useState<Product[]>(initialProducts)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editDraft, setEditDraft]   = useState<ProductDraft>(EMPTY_DRAFT)
  const [showAdd, setShowAdd]       = useState(false)
  const [addDraft, setAddDraft]     = useState<ProductDraft>(EMPTY_DRAFT)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState<string | null>(null)

  // ── Add ──────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!addDraft.name.trim()) { toast.error('Product name is required.'); return }
    setSaving(true)

    const { data, error } = await supabase
      .from('products')
      .insert({ ...addDraft, created_by: userId })
      .select()
      .single()

    setSaving(false)
    if (error || !data) {
      toast.error('Failed to add product. Make sure your account has admin access.')
      return
    }
    setProducts(prev => [...prev, data as Product])
    setAddDraft(EMPTY_DRAFT)
    setShowAdd(false)
    toast.success('Product added.')
  }

  // ── Edit ─────────────────────────────────────────────────────────
  function startEdit(product: Product) {
    setEditingId(product.id)
    setEditDraft({
      name:        product.name,
      description: product.description,
      value_props: product.value_props,
      competitors: product.competitors,
    })
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft.name.trim()) { toast.error('Product name is required.'); return }
    setSaving(true)

    const { error } = await supabase
      .from('products')
      .update(editDraft)
      .eq('id', id)

    setSaving(false)
    if (error) {
      toast.error('Failed to save. Make sure your account has admin access.')
      return
    }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...editDraft } : p))
    setEditingId(null)
    toast.success('Product saved.')
  }

  // ── Delete ───────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('Delete this product? This cannot be undone.')) return
    setDeleting(id)

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    setDeleting(null)
    if (error) {
      toast.error('Failed to delete. Make sure your account has admin access.')
      return
    }
    setProducts(prev => prev.filter(p => p.id !== id))
    toast.success('Product deleted.')
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Product list */}
      {products.map(product => (
        <div
          key={product.id}
          className="rounded-[10px]"
          style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
        >
          {editingId === product.id ? (
            /* Edit form */
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text3)' }}>
                  Editing
                </span>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-[11px] cursor-pointer hover:opacity-70"
                  style={{ color: 'var(--sl-text3)' }}
                >
                  Cancel
                </button>
              </div>
              <ProductFields draft={editDraft} onChange={setEditDraft} />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveEdit(product.id)}
                  disabled={saving}
                  className="rounded-[6px] px-4 py-2 text-[12px] font-medium disabled:opacity-50 cursor-pointer hover:opacity-90"
                  style={{ background: 'var(--sl-text)', color: '#F0EDE6' }}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : (
            /* Display card */
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>
                    {product.name}
                  </div>
                  {product.description && (
                    <div className="text-[12px] mt-1 leading-relaxed" style={{ color: 'var(--sl-text2)' }}>
                      {product.description}
                    </div>
                  )}
                  <div className="flex flex-col gap-1 mt-2">
                    {product.value_props && (
                      <div className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
                        <span style={{ color: 'var(--sl-text2)' }}>Value props:</span> {product.value_props}
                      </div>
                    )}
                    {product.competitors && (
                      <div className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
                        <span style={{ color: 'var(--sl-text2)' }}>Competes with:</span> {product.competitors}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(product)}
                    className="text-[11px] cursor-pointer hover:opacity-70"
                    style={{ color: 'var(--sl-text3)' }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(product.id)}
                    disabled={deleting === product.id}
                    className="text-[11px] cursor-pointer hover:opacity-70 disabled:opacity-40"
                    style={{ color: 'var(--sl-coral-t)' }}
                  >
                    {deleting === product.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add form */}
      {showAdd && (
        <div
          className="rounded-[10px] p-5 flex flex-col gap-4"
          style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--sl-text3)' }}>
              New product
            </span>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddDraft(EMPTY_DRAFT) }}
              className="text-[11px] cursor-pointer hover:opacity-70"
              style={{ color: 'var(--sl-text3)' }}
            >
              Cancel
            </button>
          </div>
          <ProductFields draft={addDraft} onChange={setAddDraft} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="rounded-[6px] px-4 py-2 text-[12px] font-medium disabled:opacity-50 cursor-pointer hover:opacity-90"
              style={{ background: 'var(--sl-text)', color: '#F0EDE6' }}
            >
              {saving ? 'Adding…' : 'Add product'}
            </button>
          </div>
        </div>
      )}

      {/* Add product button */}
      {!showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="rounded-[10px] px-5 py-4 text-[12px] font-medium text-left cursor-pointer transition-opacity hover:opacity-70"
          style={{
            background: 'transparent',
            border: '1px dashed var(--sl-border)',
            color: 'var(--sl-text3)',
          }}
        >
          + Add product
        </button>
      )}

      {products.length === 0 && !showAdd && (
        <p className="text-[11px] text-center py-2" style={{ color: 'var(--sl-text3)' }}>
          No products yet. Add one above — reps won't be able to run research without at least one.
        </p>
      )}
    </div>
  )
}

// ── Shared field layout for add + edit forms ──────────────────────
function ProductFields({
  draft,
  onChange,
}: {
  draft: ProductDraft
  onChange: (d: ProductDraft) => void
}) {
  return (
    <>
      <Field label="Product name" required>
        <input
          type="text"
          placeholder="e.g. Acme Data Platform"
          value={draft.name}
          onChange={e => onChange({ ...draft, name: e.target.value })}
          className="w-full rounded-[6px] border px-3 py-2 text-[12px] outline-none"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)' }}
        />
      </Field>

      <Field label="Description" hint="One or two sentences — what it does and who it's for.">
        <Textarea
          rows={2}
          placeholder="e.g. A data pipeline orchestration platform that reduces engineering time spent on…"
          value={draft.description}
          onChange={e => onChange({ ...draft, description: e.target.value })}
          className="text-[12px] resize-none"
          style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-bg)' }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Value props" hint="What makes you win deals.">
          <Textarea
            rows={3}
            placeholder="e.g. 3× faster pipeline builds, no vendor lock-in…"
            value={draft.value_props}
            onChange={e => onChange({ ...draft, value_props: e.target.value })}
            className="text-[12px] resize-y"
            style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-bg)' }}
          />
        </Field>
        <Field label="Competitors" hint="Who you're usually displacing.">
          <Textarea
            rows={3}
            placeholder="e.g. Fivetran, Airbyte, Matillion"
            value={draft.competitors}
            onChange={e => onChange({ ...draft, competitors: e.target.value })}
            className="text-[12px] resize-y"
            style={{ borderColor: 'var(--sl-border)', background: 'var(--sl-bg)' }}
          />
        </Field>
      </div>
    </>
  )
}

function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium" style={{ color: 'var(--sl-text)' }}>
        {label}
        {required && <span style={{ color: 'var(--sl-coral-t)' }} className="ml-0.5">*</span>}
      </label>
      {hint && <p className="text-[11px] leading-relaxed" style={{ color: 'var(--sl-text3)' }}>{hint}</p>}
      {children}
    </div>
  )
}
