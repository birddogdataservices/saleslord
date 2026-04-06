'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type AllowedEmail = {
  id: string
  email: string
  note: string | null
  created_at: string
}

export default function AdminUsersClient() {
  const [emails, setEmails]   = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newNote,  setNewNote]  = useState('')

  useEffect(() => {
    fetch('/api/admin/allowed-emails')
      .then(r => r.json())
      .then(d => setEmails(d.emails ?? []))
      .catch(() => toast.error('Failed to load team list.'))
      .finally(() => setLoading(false))
  }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email) return

    setAdding(true)
    const res = await fetch('/api/admin/allowed-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, note: newNote.trim() || undefined }),
    })
    const data = await res.json()
    setAdding(false)

    if (!res.ok) {
      toast.error(data.error ?? 'Failed to add.')
      return
    }

    setEmails(prev => [...prev, data.email])
    setNewEmail('')
    setNewNote('')
    toast.success(`${email} added to allowlist.`)
  }

  async function remove(id: string, email: string) {
    const res = await fetch(`/api/admin/allowed-emails/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to remove.'); return }
    setEmails(prev => prev.filter(e => e.id !== id))
    toast.success(`${email} removed.`)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Add form */}
      <div
        className="rounded-[12px] p-5 flex flex-col gap-4"
        style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
      >
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>
          Invite teammate
        </h2>
        <form onSubmit={add} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="teammate@company.com"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="flex-1 rounded-[6px] px-3 py-2 text-[12px] outline-none"
              style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)' }}
            />
            <input
              type="text"
              placeholder="Note (optional)"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              className="w-40 rounded-[6px] px-3 py-2 text-[12px] outline-none"
              style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)' }}
            />
            <button
              type="submit"
              disabled={adding || !newEmail.trim()}
              className="rounded-[6px] px-4 py-2 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'var(--sl-text)', color: '#F0EDE6' }}
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
            The person must sign in with this exact Google account. Remind them to add their Anthropic API key in Profile &amp; Settings.
          </p>
        </form>
      </div>

      {/* Email list */}
      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--sl-text)' }}>
          Allowlist ({emails.length})
        </h2>

        {loading ? (
          <div className="text-[12px] py-4" style={{ color: 'var(--sl-text3)' }}>Loading…</div>
        ) : emails.length === 0 ? (
          <div
            className="rounded-[10px] px-5 py-4 text-[12px]"
            style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)', color: 'var(--sl-text3)' }}
          >
            No emails on the allowlist yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {emails.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-[8px] px-4 py-3"
                style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px]" style={{ color: 'var(--sl-text)' }}>
                    {entry.email}
                  </span>
                  {entry.note && (
                    <span className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>
                      {entry.note}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => remove(entry.id, entry.email)}
                  className="text-[11px] px-3 py-1 rounded-[5px] transition-colors hover:opacity-80"
                  style={{ border: '1px solid var(--sl-border)', color: 'var(--sl-text3)', background: 'transparent' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
