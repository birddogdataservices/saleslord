'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'

// ── Lazy-load map (SVG, no SSR needed) ───────────────────────────
const TerritoryMap = nextDynamic(
  () => import('@/components/territorylord/TerritoryMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[1.6] bg-gray-100 rounded animate-pulse" />
    ),
  }
)

// ── Region data ───────────────────────────────────────────────────

const CA_PROVINCES: { code: string; label: string }[] = [
  { code: 'CA-AB', label: 'Alberta' },          { code: 'CA-BC', label: 'British Columbia' },
  { code: 'CA-MB', label: 'Manitoba' },         { code: 'CA-NB', label: 'New Brunswick' },
  { code: 'CA-NL', label: 'Newfoundland' },     { code: 'CA-NS', label: 'Nova Scotia' },
  { code: 'CA-NT', label: 'Northwest Territories' }, { code: 'CA-NU', label: 'Nunavut' },
  { code: 'CA-ON', label: 'Ontario' },          { code: 'CA-PE', label: 'PEI' },
  { code: 'CA-QC', label: 'Quebec' },           { code: 'CA-SK', label: 'Saskatchewan' },
  { code: 'CA-YT', label: 'Yukon' },
]

// ── Component ─────────────────────────────────────────────────────

export default function TerritoryPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [repId, setRepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: rep } = await supabase
      .from('rep_profiles').select('id').eq('user_id', user.id).maybeSingle()
    if (!rep) return
    setRepId(rep.id)

    const { data: rows } = await supabase
      .from('territories').select('region_code').eq('rep_id', rep.id)
    setSelected(new Set((rows ?? []).map((r: { region_code: string }) => r.region_code)))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggle(code: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  async function save() {
    if (!repId) return
    setSaving(true)
    const supabase = createClient()
    try {
      const { data: existing } = await supabase
        .from('territories').select('region_code').eq('rep_id', repId)
      const existingCodes = new Set((existing ?? []).map((r: { region_code: string }) => r.region_code))

      const toAdd    = [...selected].filter(c => !existingCodes.has(c))
      const toRemove = [...existingCodes].filter(c => !selected.has(c))

      if (toAdd.length > 0) {
        await supabase.from('territories')
          .insert(toAdd.map(c => ({ rep_id: repId, region_code: c })))
      }
      if (toRemove.length > 0) {
        await supabase.from('territories')
          .delete()
          .eq('rep_id', repId)
          .in('region_code', toRemove)
      }
      setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white p-6 text-sm text-gray-400">Loading…</div>

  const usSelected = [...selected].filter(c => c.startsWith('US-'))

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <Link href="/territorylord/runs" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
            ← Back to runs
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">My territory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Click states on the map to add them to your territory.</p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>
          )}
          <span className="text-sm text-gray-500">{selected.size} region{selected.size !== 1 ? 's' : ''} selected</span>
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-4 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save territory'}
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-8 max-w-3xl">

        {/* US — interactive map */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">United States</h2>
            {usSelected.length > 0 && (
              <span className="text-xs text-gray-400">{usSelected.length} state{usSelected.length !== 1 ? 's' : ''} selected</span>
            )}
          </div>
          <TerritoryMap selected={selected} onToggle={toggle} />
          {usSelected.length > 0 && (
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              {usSelected.sort().join(' · ')}
            </p>
          )}
        </div>

        {/* Canada — chips */}
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Canada</h2>
          <div className="flex flex-wrap gap-2">
            {CA_PROVINCES.map(r => (
              <button
                key={r.code}
                onClick={() => toggle(r.code)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  selected.has(r.code)
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
