'use client'

import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'

// ── Types ─────────────────────────────────────────────────────────

type ProjectionConfig = {
  center?: [number, number]
  scale?: number
  rotate?: [number, number, number]
  [key: string]: unknown
}

export type GeoLayer = {
  geoUrl: string
  /** Map a feature's properties to an ISO 3166-2 region code, or null to skip */
  getCode: (properties: Record<string, unknown>) => string | null
}

export type TerritoryMapProps = {
  layers: GeoLayer[]
  projection?: string
  projectionConfig?: ProjectionConfig
  /** Geographic [lon, lat] to centre on when nothing is selected */
  defaultCenter: [number, number]
  /** ISO 3166-2 code → approximate geographic centroid [lon, lat] */
  centroids: Record<string, [number, number]>
  selected: Set<string>
  onToggle: (code: string) => void
  /**
   * Optional extra content rendered inside the hover tooltip for a given
   * region code. Used in future to show discovery / briefed counts.
   */
  getTooltipExtra?: (code: string) => React.ReactNode
}

// ── View calculation ──────────────────────────────────────────────

function computeView(
  selected: Set<string>,
  centroids: Record<string, [number, number]>,
  defaultCenter: [number, number],
): { center: [number, number]; zoom: number } {
  const points = [...selected]
    .map(code => centroids[code])
    .filter((c): c is [number, number] => Boolean(c))

  if (points.length === 0) return { center: defaultCenter, zoom: 1 }

  const lons = points.map(p => p[0])
  const lats = points.map(p => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)

  const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2]
  const spread = Math.max((maxLon - minLon) / 1.5, maxLat - minLat, 4) + 10
  const zoom = Math.max(1, Math.min(6, 50 / spread))

  return { center, zoom }
}

// ── Component ─────────────────────────────────────────────────────

type TooltipState = { name: string; code: string; x: number; y: number }

export default function TerritoryMap({
  layers,
  projection = 'geoMercator',
  projectionConfig,
  defaultCenter,
  centroids,
  selected,
  onToggle,
  getTooltipExtra,
}: TerritoryMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const { center, zoom } = useMemo(
    () => computeView(selected, centroids, defaultCenter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, centroids, defaultCenter],
  )

  const viewKey = `${center[0].toFixed(1)},${center[1].toFixed(1)},${zoom.toFixed(2)}`

  const geoStyle = (isSelected: boolean) => ({
    default: {
      fill:        isSelected ? '#111827' : '#e5e7eb',
      stroke:      '#ffffff',
      strokeWidth: 0.5,
      outline:     'none',
      cursor:      'pointer',
    },
    hover: {
      fill:        isSelected ? '#374151' : '#d1d5db',
      stroke:      '#ffffff',
      strokeWidth: 0.5,
      outline:     'none',
      cursor:      'pointer',
    },
    pressed: {
      fill:    isSelected ? '#1f2937' : '#9ca3af',
      outline: 'none',
    },
  })

  return (
    <div className="w-full h-full relative">
      <ComposableMap
        projection={projection}
        projectionConfig={projectionConfig as Record<string, unknown>}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup key={viewKey} center={center} zoom={zoom}>
          {layers.map(({ geoUrl, getCode }) => (
            <Geographies key={geoUrl} geography={geoUrl}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const props = geo.properties as Record<string, unknown>
                  const code = getCode(props)
                  if (!code) return null
                  const isSelected = selected.has(code)
                  const name = String(props.name ?? code)
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => onToggle(code)}
                      onMouseEnter={(e: React.MouseEvent) =>
                        setTooltip({ name, code, x: e.clientX, y: e.clientY })
                      }
                      onMouseMove={(e: React.MouseEvent) =>
                        setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
                      }
                      onMouseLeave={() => setTooltip(null)}
                      style={geoStyle(isSelected)}
                    />
                  )
                })
              }
            </Geographies>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Hover tooltip — fixed so it escapes any scroll container */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 36 }}
        >
          <div className="bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded shadow-lg">
            <div className="font-medium">{tooltip.name}</div>
            {getTooltipExtra && getTooltipExtra(tooltip.code)}
          </div>
        </div>
      )}
    </div>
  )
}
