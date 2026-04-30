'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ── Region data ───────────────────────────────────────────────

const US_STATES: { code: string; label: string }[] = [
  { code: 'US-AL', label: 'Alabama' },       { code: 'US-AK', label: 'Alaska' },
  { code: 'US-AZ', label: 'Arizona' },       { code: 'US-AR', label: 'Arkansas' },
  { code: 'US-CA', label: 'California' },    { code: 'US-CO', label: 'Colorado' },
  { code: 'US-CT', label: 'Connecticut' },   { code: 'US-DE', label: 'Delaware' },
  { code: 'US-FL', label: 'Florida' },       { code: 'US-GA', label: 'Georgia' },
  { code: 'US-HI', label: 'Hawaii' },        { code: 'US-ID', label: 'Idaho' },
  { code: 'US-IL', label: 'Illinois' },      { code: 'US-IN', label: 'Indiana' },
  { code: 'US-IA', label: 'Iowa' },          { code: 'US-KS', label: 'Kansas' },
  { code: 'US-KY', label: 'Kentucky' },      { code: 'US-LA', label: 'Louisiana' },
  { code: 'US-ME', label: 'Maine' },         { code: 'US-MD', label: 'Maryland' },
  { code: 'US-MA', label: 'Massachusetts' }, { code: 'US-MI', label: 'Michigan' },
  { code: 'US-MN', label: 'Minnesota' },     { code: 'US-MS', label: 'Mississippi' },
  { code: 'US-MO', label: 'Missouri' },      { code: 'US-MT', label: 'Montana' },
  { code: 'US-NE', label: 'Nebraska' },      { code: 'US-NV', label: 'Nevada' },
  { code: 'US-NH', label: 'New Hampshire' }, { code: 'US-NJ', label: 'New Jersey' },
  { code: 'US-NM', label: 'New Mexico' },    { code: 'US-NY', label: 'New York' },
  { code: 'US-NC', label: 'North Carolina' },{ code: 'US-ND', label: 'North Dakota' },
  { code: 'US-OH', label: 'Ohio' },          { code: 'US-OK', label: 'Oklahoma' },
  { code: 'US-OR', label: 'Oregon' },        { code: 'US-PA', label: 'Pennsylvania' },
  { code: 'US-RI', label: 'Rhode Island' },  { code: 'US-SC', label: 'South Carolina' },
  { code: 'US-SD', label: 'South Dakota' },  { code: 'US-TN', label: 'Tennessee' },
  { code: 'US-TX', label: 'Texas' },         { code: 'US-UT', label: 'Utah' },
  { code: 'US-VT', label: 'Vermont' },       { code: 'US-VA', label: 'Virginia' },
  { code: 'US-WA', label: 'Washington' },    { code: 'US-WV', label: 'West Virginia' },
  { code: 'US-WI', label: 'Wisconsin' },     { code: 'US-WY', label: 'Wyoming' },
  { code: 'US-DC', label: 'Washington DC' },
]

const CA_PROVINCES: { code: string; label: string }[] = [
  { code: 'CA-AB', label: 'Alberta' },          { code: 'CA-BC', label: 'British Columbia' },
  { code: 'CA-MB', label: 'Manitoba' },         { code: 'CA-NB', label: 'New Brunswick' },
  { code: 'CA-NL', label: 'Newfoundland' },     { code: 'CA-NS', label: 'Nova Scotia' },
  { code: 'CA-NT', label: 'Northwest Territories' }, { code: 'CA-NU', label: 'Nunavut' },
  { code: 'CA-ON', label: 'Ontario' },          { code: 'CA-PE', label: 'PEI' },
  { code: 'CA-QC', label: 'Quebec' },           { code: 'CA-SK', label: 'Saskatchewan' },
  { code: 'CA-YT', label: 'Yukon' },
]

// ── Component ─────────────────────────────────────────────────

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
      // Fetch current saved codes to compute diff
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

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-auto bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <Link href="/territorylord/runs" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
            ← Back to runs
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">My territory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select the states and provinces in your territory.</p>
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

      <div className="flex-1 px-6 py-6 space-y-8">
        <RegionGroup
          heading="United States"
          regions={US_STATES}
          selected={selected}
          onToggle={toggle}
        />
        <RegionGroup
          heading="Canada"
          regions={CA_PROVINCES}
          selected={selected}
          onToggle={toggle}
        />
      </div>
    </div>
  )
}

function RegionGroup({
  heading, regions, selected, onToggle,
}: {
  heading: string
  regions: { code: string; label: string }[]
  selected: Set<string>
  onToggle: (code: string) => void
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{heading}</h2>
      <div className="flex flex-wrap gap-2">
        {regions.map(r => (
          <button
            key={r.code}
            onClick={() => onToggle(r.code)}
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
  )
}
