'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { NAICS_SECTORS } from '@saleslord/signals/classifyIndustry'

const SIZE_OPTIONS = ['Enterprise', 'Mid-market', 'SMB'] as const
type SizeHint = typeof SIZE_OPTIONS[number] | null

type IcpRow = {
  id: string
  name: string
  industries: string[]
  size_hint: string | null
}

export default function IcpPage() {
  const [profiles, setProfiles] = useState<IcpRow[]>([])
  const [repId, setRepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<IcpRow | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: rep } = await supabase
      .from('rep_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!rep) return
    setRepId(rep.id)
    const { data } = await supabase
      .from('icp_profiles').select('id, name, industries, size_hint').eq('rep_id', rep.id).order('created_at')
    setProfiles((data ?? []) as IcpRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteProfile(id: string) {
    const supabase = createClient()
    await supabase.from('icp_profiles').delete().eq('id', id)
    setProfiles(p => p.filter(x => x.id !== id))
  }

  if (loading) return <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white p-6 text-sm text-gray-400">Loading…</div>

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <Link href="/territorylord/runs" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
            ← Back to runs
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">ICP profiles</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define the industries and company size that fit your ideal customer profile.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-sm px-4 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors"
        >
          New ICP profile
        </button>
      </div>

      <div className="flex-1 px-6 py-6 max-w-2xl space-y-3">
        {profiles.length === 0 && !creating && (
          <p className="text-sm text-gray-400">No ICP profiles yet. Create one to start a run.</p>
        )}
        {profiles.map(p => (
          editing?.id === p.id ? (
            <IcpForm
              key={p.id}
              repId={repId!}
              initial={p}
              onSave={updated => {
                setProfiles(prev => prev.map(x => x.id === updated.id ? updated : x))
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <IcpCard
              key={p.id}
              profile={p}
              onEdit={() => setEditing(p)}
              onDelete={() => deleteProfile(p.id)}
            />
          )
        ))}
        {creating && (
          <IcpForm
            repId={repId!}
            initial={null}
            onSave={created => {
              setProfiles(prev => [...prev, created])
              setCreating(false)
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </div>
    </div>
  )
}

function IcpCard({ profile, onEdit, onDelete }: { profile: IcpRow; onEdit: () => void; onDelete: () => void }) {
  const industries = profile.industries ?? []
  return (
    <div className="border border-gray-200 rounded p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-gray-900">{profile.name}</div>
          <div className="text-xs text-gray-500 mt-1">
            {industries.length > 0
              ? industries.map(code => {
                  const sector = NAICS_SECTORS.find(s => s.code === code)
                  return sector?.label ?? code
                }).join(', ')
              : 'All industries'}
            {profile.size_hint && <span className="ml-2 text-gray-400">· {profile.size_hint}</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onEdit} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">Edit</button>
          <button onClick={onDelete} className="text-xs px-2 py-1 rounded border border-red-100 text-red-500 hover:bg-red-50">Delete</button>
        </div>
      </div>
    </div>
  )
}

function IcpForm({
  repId, initial, onSave, onCancel,
}: {
  repId: string
  initial: IcpRow | null
  onSave: (p: IcpRow) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [industries, setIndustries] = useState<Set<string>>(new Set(initial?.industries ?? []))
  const [sizeHint, setSizeHint] = useState<SizeHint>((initial?.size_hint as SizeHint) ?? null)
  const [saving, setSaving] = useState(false)

  function toggleIndustry(code: string) {
    setIndustries(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const supabase = createClient()
    try {
      const payload = {
        rep_id:     repId,
        name:       name.trim(),
        industries: [...industries],
        size_hint:  sizeHint,
      }
      if (initial) {
        const { data } = await supabase
          .from('icp_profiles').update(payload).eq('id', initial.id).select('id, name, industries, size_hint').single()
        if (data) onSave(data as IcpRow)
      } else {
        const { data } = await supabase
          .from('icp_profiles').insert(payload).select('id, name, industries, size_hint').single()
        if (data) onSave(data as IcpRow)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-300 rounded p-4 space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Profile name</label>
        <input
          type="search"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Mid-market manufacturing"
          className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">Industries (leave empty for all)</label>
        <div className="flex flex-wrap gap-2">
          {[...NAICS_SECTORS].filter(s => s.code !== '99').sort((a, b) => a.label.localeCompare(b.label)).map(s => (
            <button
              key={s.code}
              type="button"
              onClick={() => toggleIndustry(s.code)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                industries.has(s.code)
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-2">Company size (optional)</label>
        <div className="flex gap-2">
          {SIZE_OPTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSizeHint(sizeHint === s ? null : s)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                sizeHint === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="text-sm px-4 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="text-sm px-4 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
