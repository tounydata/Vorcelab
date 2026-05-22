import { useEffect, useRef } from 'react'
import type { GpxPoint } from '../types/race'
import type { Section } from '../utils/gpxCore'

interface Props {
  points: GpxPoint[]
  sections: Section[]
  cumDist: number[]
}

const SECTION_COLORS: Record<string, string> = {
  up: '#E5562A',
  down: '#E8A23A',
  flat: '#10B981',
}

export function GpxStratMap({ points, sections, cumDist }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current || !points.length) return
    let L: typeof import('leaflet')
    let mapInstance: import('leaflet').Map

    import('leaflet').then((leaflet) => {
      L = leaflet.default ?? leaflet
      if ((containerRef.current as HTMLElement & { _leaflet_id?: unknown })._leaflet_id) return

      mapInstance = L.map(containerRef.current!, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 18,
      }).addTo(mapInstance)

      // Base polyline (faint)
      const latLngs = points.map(p => [p.lat, p.lon] as [number, number])
      L.polyline(latLngs, { color: 'rgba(255,255,255,0.15)', weight: 2 }).addTo(mapInstance)

      // Colored section polylines
      sections.forEach(s => {
        const si = cumDist.findIndex(d => d >= s.startKm * 1000)
        let ei = cumDist.findIndex(d => d >= s.endKm * 1000)
        if (ei < 0) ei = points.length - 1
        const startIdx = Math.max(0, si < 0 ? 0 : si)
        const endIdx = Math.min(points.length - 1, ei)
        if (startIdx >= endIdx) return
        const sectionPoints = points.slice(startIdx, endIdx + 1).map(p => [p.lat, p.lon] as [number, number])
        L.polyline(sectionPoints, {
          color: SECTION_COLORS[s.type] ?? '#fff',
          weight: 4,
          opacity: 0.85,
        }).addTo(mapInstance)
      })

      // Depart marker
      const start = points[0]
      L.circleMarker([start.lat, start.lon], {
        radius: 7,
        fillColor: '#10B981',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).bindTooltip('Départ').addTo(mapInstance)

      // Arrivée marker
      const end = points[points.length - 1]
      L.circleMarker([end.lat, end.lon], {
        radius: 7,
        fillColor: '#E5562A',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).bindTooltip('Arrivée').addTo(mapInstance)

      // Fit bounds
      mapInstance.fitBounds(L.latLngBounds(latLngs), { padding: [20, 20] })
      mapRef.current = mapInstance
    })

    return () => {
      if (mapInstance) {
        mapInstance.remove()
        mapRef.current = null
      }
    }
  }, [points, sections, cumDist])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 280, borderRadius: 8, overflow: 'hidden', background: 'var(--vl-surf-2)' }}
    />
  )
}
