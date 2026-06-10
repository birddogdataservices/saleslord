'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type AllowedEmail = {
  id: string
  email: string
  note: string | null
  created_at: string
}

type AdminProspect = {
  id: string
  user_id: string
  name: string
  archived_at: string | null
  created_at: string
  owner_email: string
}

type User = {
  id: string
  email: string
}

type Tab = 'allowlist' | 'prospects'

export default function AdminUsersClient() {
  const [tab, setTab] = useState<Tab>('allowlist')

  // Allowlist state
  const [emails,   setEmails]   = useState<AllowedEmail[]>([])
  const [loading,  setLoading]  = useState(true)
  const [adding,   setAdding]   = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newNote,  setNewNote]  = useState('')

  // Prospects state
  const [prospects,     setProspects]     = useState<AdminProspect[]>([])
  const [users,         setUsers]         = useState<User[]>([])
  const [prospectsLoading, setProspectsLoading] = useState(false)
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [reassignTo,    setReassignTo]    = useState('')
  const [reassigning,   setReassigning]   = useState(false)
  const [ownerFilter,   setOwnerFilter]   = useState('')

  useEffect(() => {
    fetch('/api/admin/allowed-emails')
      .then(r => r.json())
      .then(d => setEmails(d.emails ?? []))
      .catch(() => toast.error('Failed to load team list.'))
      .finally(() => setLoading(false))
  }, [])

  function loadProspects() {
    if (prospectsLoading || prospects.length > 0) return
    setProspectsLoading(true)
    fetch('/api/admin/prospects')
      .then(r => r.json())
      .then(d => {
        setProspects(d.prospects ?? [])
        setUsers(d.users ?? [])
      })
      .catch(() => toast.error('Failed to load prospects.'))
      .finally(() => setProspectsLoading(false))
  }

  function switchTab(t: Tab) {
    setTab(t)
    if (t === 'prospects') loadProspects()
  }

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

    if (!res.ok) { toast.error(data.error ?? 'Failed to add.'); return }
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

  async function reassignSelected() {
    if (!reassignTo || selected.size === 0) return
    setReassigning(true)

    const ids = Array.from(selected)
    const results = await Promise.all(
      ids.map(id =>
        fetch(`/api/admin/prospects/${id}/reassign`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_user_id: reassignTo }),
        }).then(r => ({ id, ok: r.ok }))
      )
    )

    const failed = results.filter(r => !r.ok).length
    if (failed) toast.error(`${failed} prospect(s) failed to reassign.`)
    else toast.success(`${ids.length} prospect(s) reassigned.`)

    // Update local state
    const targetEmail = users.find(u => u.id === reassignTo)?.email ?? reassignTo
    setProspects(prev =>
      prev.map(p =>
        selected.has(p.id) ? { ...p, user_id: reassignTo, owner_email: targetEmail } : p
      )
    )
    setSelected(new Set())
    setReassigning(false)
  }

  // Group prospects by owner for display
  const filteredProspects = ownerFilter
    ? prospects.filter(p => p.owner_email === ownerFilter)
    : prospects

  const owners = Array.from(new Set(prospects.map(p => p.owner_email))).sort()

  const tabStyle = (t: Tab) => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: tab === t ? 600 : 400,
    color: tab === t ? 'var(--sl-text)' : 'var(--sl-text3)',
    background: tab === t ? 'var(--sl-surface2)' : 'transparent',
    border: '1px solid',
    borderColor: tab === t ? 'var(--sl-border)' : 'transparent',
    borderRadius: 6,
    cursor: 'pointer',
  } as React.CSSProperties)

  return (
    <div className="flex flex-col gap-6">

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button style={tabStyle('allowlist')} onClick={() => switchTab('allowlist')}>Allowlist</button>
        <button style={tabStyle('prospects')} onClick={() => switchTab('prospects')}>Prospects</button>
      </div>

      {/* ── ALLOWLIST TAB ── */}
      {tab === 'allowlist' && (
        <>
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
                Teammates can sign in with Google or by magic link. Remind them to add their Anthropic API key in Profile &amp; Settings.
              </p>
            </form>
          </div>

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
                      <span className="text-[12px]" style={{ color: 'var(--sl-text)' }}>{entry.email}</span>
                      {entry.note && (
                        <span className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>{entry.note}</span>
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
        </>
      )}

      {/* ── PROSPECTS TAB ── */}
      {tab === 'prospects' && (
        <div className="flex flex-col gap-4">

          {prospectsLoading ? (
            <div className="text-[12px] py-4" style={{ color: 'var(--sl-text3)' }}>Loading…</div>
          ) : (
            <>
              {/* Reassign toolbar */}
              <div
                className="flex items-center gap-3 rounded-[10px] px-4 py-3"
                style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
              >
                <span className="text-[12px]" style={{ color: selected.size ? 'var(--sl-text)' : 'var(--sl-text3)' }}>
                  {selected.size > 0 ? `${selected.size} selected` : 'Select prospects to reassign'}
                </span>
                <select
                  value={reassignTo}
                  onChange={e => setReassignTo(e.target.value)}
                  disabled={selected.size === 0}
                  className="ml-auto rounded-[6px] px-2 py-1 text-[12px] outline-none"
                  style={{ border: '1px solid var(--sl-border)', background: 'var(--sl-bg)', color: 'var(--sl-text)' }}
                >
                  <option value="">Reassign to…</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
                <button
                  onClick={reassignSelected}
                  disabled={selected.size === 0 || !reassignTo || reassigning}
                  className="rounded-[6px] px-4 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'var(--sl-text)', color: '#F0EDE6' }}
                >
                  {reassigning ? 'Reassigning…' : 'Reassign'}
                </button>
              </div>

              {/* Owner filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>Filter by owner:</span>
                <button
                  onClick={() => setOwnerFilter('')}
                  className="text-[11px] px-2 py-0.5 rounded-[4px]"
                  style={{
                    background: !ownerFilter ? 'var(--sl-surface2)' : 'transparent',
                    border: '1px solid var(--sl-border)',
                    color: !ownerFilter ? 'var(--sl-text)' : 'var(--sl-text3)',
                  }}
                >
                  All
                </button>
                {owners.map(o => (
                  <button
                    key={o}
                    onClick={() => setOwnerFilter(o === ownerFilter ? '' : o)}
                    className="text-[11px] px-2 py-0.5 rounded-[4px]"
                    style={{
                      background: ownerFilter === o ? 'var(--sl-surface2)' : 'transparent',
                      border: '1px solid var(--sl-border)',
                      color: ownerFilter === o ? 'var(--sl-text)' : 'var(--sl-text3)',
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>

              {/* Prospect list */}
              <div className="flex flex-col gap-1">
                {filteredProspects.length === 0 ? (
                  <div className="text-[12px] py-4" style={{ color: 'var(--sl-text3)' }}>No prospects found.</div>
                ) : filteredProspects.map(p => (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 rounded-[8px] px-4 py-3 cursor-pointer"
                    style={{ background: 'var(--sl-surface)', border: '1px solid var(--sl-border)' }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={e => {
                        setSelected(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(p.id) : next.delete(p.id)
                          return next
                        })
                      }}
                    />
                    <div className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[12px]" style={{ color: p.archived_at ? 'var(--sl-text3)' : 'var(--sl-text)' }}>
                        {p.name}
                        {p.archived_at && <span className="ml-2 text-[10px]" style={{ color: 'var(--sl-text3)' }}>archived</span>}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--sl-text3)' }}>{p.owner_email}</span>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
