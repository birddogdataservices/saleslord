'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import type { GeoLayer } from '@/components/territorylord/TerritoryMap'

// ── Lazy-load map (SVG — no SSR) ─────────────────────────────────
const TerritoryMap = nextDynamic(
  () => import('@/components/territorylord/TerritoryMap'),
  {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gray-100 animate-pulse" />,
  }
)

// ── Geography data sources ────────────────────────────────────────

const US_GEO  = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'
const CA_GEO  = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/canada.geojson'

const STATE_NAME_TO_CODE: Record<string, string> = {
  'Alabama': 'US-AL',          'Alaska': 'US-AK',         'Arizona': 'US-AZ',
  'Arkansas': 'US-AR',         'California': 'US-CA',      'Colorado': 'US-CO',
  'Connecticut': 'US-CT',      'Delaware': 'US-DE',        'Florida': 'US-FL',
  'Georgia': 'US-GA',          'Hawaii': 'US-HI',          'Idaho': 'US-ID',
  'Illinois': 'US-IL',         'Indiana': 'US-IN',         'Iowa': 'US-IA',
  'Kansas': 'US-KS',           'Kentucky': 'US-KY',        'Louisiana': 'US-LA',
  'Maine': 'US-ME',            'Maryland': 'US-MD',        'Massachusetts': 'US-MA',
  'Michigan': 'US-MI',         'Minnesota': 'US-MN',       'Mississippi': 'US-MS',
  'Missouri': 'US-MO',         'Montana': 'US-MT',         'Nebraska': 'US-NE',
  'Nevada': 'US-NV',           'New Hampshire': 'US-NH',   'New Jersey': 'US-NJ',
  'New Mexico': 'US-NM',       'New York': 'US-NY',        'North Carolina': 'US-NC',
  'North Dakota': 'US-ND',     'Ohio': 'US-OH',            'Oklahoma': 'US-OK',
  'Oregon': 'US-OR',           'Pennsylvania': 'US-PA',    'Rhode Island': 'US-RI',
  'South Carolina': 'US-SC',   'South Dakota': 'US-SD',    'Tennessee': 'US-TN',
  'Texas': 'US-TX',            'Utah': 'US-UT',            'Vermont': 'US-VT',
  'Virginia': 'US-VA',         'Washington': 'US-WA',      'West Virginia': 'US-WV',
  'Wisconsin': 'US-WI',        'Wyoming': 'US-WY',         'District of Columbia': 'US-DC',
}

const CA_NAME_TO_CODE: Record<string, string> = {
  'Alberta': 'CA-AB',                   'British Columbia': 'CA-BC',
  'Manitoba': 'CA-MB',                  'New Brunswick': 'CA-NB',
  'Newfoundland and Labrador': 'CA-NL', 'Nova Scotia': 'CA-NS',
  'Northwest Territories': 'CA-NT',     'Nunavut': 'CA-NU',
  'Ontario': 'CA-ON',                   'Prince Edward Island': 'CA-PE',
  'Quebec': 'CA-QC',                    'Saskatchewan': 'CA-SK',
  'Yukon Territory': 'CA-YT',
}

const NA_LAYERS: GeoLayer[] = [
  { geoUrl: US_GEO, getCode: p => STATE_NAME_TO_CODE[p.name as string] ?? null },
  { geoUrl: CA_GEO, getCode: p => CA_NAME_TO_CODE[p.name as string]   ?? null },
]

// ── Centroids (approx geographic centre [lon, lat] per region) ───

const NA_CENTROIDS: Record<string, [number, number]> = {
  // United States
  'US-AL': [-86.8, 32.8],  'US-AK': [-152.5, 64.2], 'US-AZ': [-111.1, 34.3],
  'US-AR': [-92.4, 34.7],  'US-CA': [-119.4, 36.8], 'US-CO': [-105.5, 39.0],
  'US-CT': [-72.8, 41.6],  'US-DE': [-75.5, 38.9],  'US-FL': [-81.5, 27.7],
  'US-GA': [-83.6, 32.2],  'US-HI': [-155.6, 19.9], 'US-ID': [-114.5, 44.2],
  'US-IL': [-89.2, 40.3],  'US-IN': [-86.3, 39.9],  'US-IA': [-93.2, 42.0],
  'US-KS': [-98.3, 38.5],  'US-KY': [-84.3, 37.5],  'US-LA': [-91.8, 31.2],
  'US-ME': [-69.4, 45.3],  'US-MD': [-76.6, 39.0],  'US-MA': [-71.5, 42.2],
  'US-MI': [-84.5, 44.3],  'US-MN': [-94.7, 46.4],  'US-MS': [-89.7, 32.7],
  'US-MO': [-92.6, 38.5],  'US-MT': [-109.6, 46.9], 'US-NE': [-99.9, 41.5],
  'US-NV': [-116.4, 38.8], 'US-NH': [-71.6, 43.2],  'US-NJ': [-74.5, 39.8],
  'US-NM': [-106.2, 34.5], 'US-NY': [-75.5, 43.0],  'US-NC': [-79.0, 35.6],
  'US-ND': [-100.5, 47.5], 'US-OH': [-82.9, 40.4],  'US-OK': [-97.1, 35.6],
  'US-OR': [-120.6, 43.9], 'US-PA': [-77.2, 41.2],  'US-RI': [-71.5, 41.6],
  'US-SC': [-80.9, 33.9],  'US-SD': [-100.2, 44.3], 'US-TN': [-86.7, 35.7],
  'US-TX': [-99.3, 31.5],  'US-UT': [-111.1, 39.3], 'US-VT': [-72.7, 44.0],
  'US-VA': [-78.7, 37.8],  'US-WA': [-120.7, 47.4], 'US-WV': [-80.5, 38.5],
  'US-WI': [-89.6, 44.3],  'US-WY': [-107.6, 43.0], 'US-DC': [-77.0, 38.9],
  // Canada
  'CA-AB': [-114.4, 53.9], 'CA-BC': [-125.6, 53.7], 'CA-MB': [-98.8,  56.4],
  'CA-NB': [-66.5,  46.5], 'CA-NL': [-60.4,  53.1], 'CA-NS': [-63.0,  45.3],
  'CA-NT': [-120.7, 64.8], 'CA-NU': [-84.0,  70.3], 'CA-ON': [-85.3,  50.0],
  'CA-PE': [-63.4,  46.2], 'CA-QC': [-71.8,  53.0], 'CA-SK': [-106.0, 55.0],
  'CA-YT': [-135.5, 64.0],
}

// Default view centred on North America (US + Canada together)
const NA_CENTER: [number, number] = [-95, 52]
const NA_PROJECTION_CONFIG = { center: [-95, 52] as [number, number], scale: 260 }

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
          .delete().eq('rep_id', repId).in('region_code', toRemove)
      }
      setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex flex-col flex-1 min-h-0 bg-white p-6 text-sm text-gray-400">Loading…</div>

  const allSelected = [...selected].sort()

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="px-6 py-4 border-b border-gray-200 shrink-0 flex items-center justify-between">
        <div>
          <Link href="/territorylord/runs" className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-block">
            ← Back to runs
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">My territory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Click states and provinces to select your territory. The map zooms to your selection.</p>
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

      {/* Map fills remaining height */}
      <div className="flex-1 min-h-0 relative">
        <TerritoryMap
          layers={NA_LAYERS}
          projection="geoMercator"
          projectionConfig={NA_PROJECTION_CONFIG}
          defaultCenter={NA_CENTER}
          centroids={NA_CENTROIDS}
          selected={selected}
          onToggle={toggle}
        />
        {/* Selected-regions overlay — bottom-left corner */}
        {allSelected.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded px-3 py-2 max-w-sm">
            <p className="text-xs text-gray-500 leading-relaxed">{allSelected.join(' · ')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
