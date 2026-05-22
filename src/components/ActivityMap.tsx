import { useEffect, useRef } from 'react'
import type * as L from 'leaflet'

interface Props {
  latlng: [number, number][]
}

// Fix Leaflet default marker icon paths broken by bundlers
function fixLeafletIcons(leaflet: typeof L) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (leaflet.Icon.Default.prototype as any)._getIconUrl
  leaflet.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  })
}

export function ActivityMap({ latlng }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!ref.current || latlng.length < 2) return
    let mounted = true

    import('leaflet').then(L => {
      if (!mounted || !ref.current) return
      fixLeafletIcons(L)

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

      const map = L.map(ref.current, { zoomControl: true, scrollWheelZoom: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map)

      const step = Math.max(1, Math.floor(latlng.length / 500))
      const pts = latlng.filter((_, i) => i % step === 0)
      const poly = L.polyline(pts, { color: '#00d4ff', weight: 4, opacity: 0.9 }).addTo(map)
      L.circleMarker(latlng[0], { radius: 7, fillColor: '#2ecc71', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
      L.circleMarker(latlng[latlng.length - 1], { radius: 7, fillColor: '#f43f5e', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(map)
      map.fitBounds(poly.getBounds(), { padding: [18, 18] })
      setTimeout(() => map.invalidateSize(), 80)
    })

    return () => {
      mounted = false
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [latlng])

  return <div ref={ref} style={{ height: 300, borderRadius: 8, overflow: 'hidden' }} />
}
