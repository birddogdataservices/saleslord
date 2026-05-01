'use client'

import { useMemo } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'

// ── Types ─────────────────────────────────────────────────────────

type ProjectionConfig = {
  center?: [number, number]
  scale?: number
  rotate?: [number, number, number]
  [key: string]: unknown
}

export type TerritoryMapProps = {
  geoUrl: string
  projection?: string
  projectionConfig?: ProjectionConfig
  /** Geographic [lon, lat] to centre on when nothing is selected */
  defaultCenter: [number, number]
  /** Map a feature's properties to an ISO 3166-2 region code, or null to skip */
  getCode: (properties: Record<string, unknown>) => string | null
  /** ISO 3166-2 code → approximate geographic centroid [lon, lat] */
  centroids: Record<string, [number, number]>
  selected: Set<string>
  onToggle: (code: string) => void
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

  const center: [number, number] = [
    (minLon + maxLon) / 2,
    (minLat + maxLat) / 2,
  ]

  // Pad the spread so a single region doesn't over-zoom
  const spread = Math.max((maxLon - minLon) / 1.5, maxLat - minLat, 4) + 10
  const zoom = Math.max(1, Math.min(6, 50 / spread))

  return { center, zoom }
}

// ── Component ─────────────────────────────────────────────────────

export default function TerritoryMap({
  geoUrl,
  projection = 'geoMercator',
  projectionConfig,
  defaultCenter,
  getCode,
  centroids,
  selected,
  onToggle,
}: TerritoryMapProps) {
  const { center, zoom } = useMemo(
    () => computeView(selected, centroids, defaultCenter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, centroids, defaultCenter],
  )

  // Key the ZoomableGroup on rounded view values so it re-mounts (and
  // re-centers) when the territory selection changes meaningfully, without
  // micro-jitter on every pixel of the bounding-box.
  const viewKey = `${center[0].toFixed(1)},${center[1].toFixed(1)},${zoom.toFixed(2)}`

  return (
    <ComposableMap
      projection={projection}
      projectionConfig={projectionConfig as Record<string, unknown>}
      style={{ width: '100%', height: 'auto' }}
    >
      <ZoomableGroup key={viewKey} center={center} zoom={zoom}>
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map(geo => {
              const props = geo.properties as Record<string, unknown>
              const code = getCode(props)
              if (!code) return null
              const isSelected = selected.has(code)
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  title={String(props.name ?? '')}
                  onClick={() => onToggle(code)}
                  style={{
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
                  }}
                />
              )
            })
          }
        </Geographies>
      </ZoomableGroup>
    </ComposableMap>
  )
}
