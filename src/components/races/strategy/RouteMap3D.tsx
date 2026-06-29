import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl'
import type { GpxPoint } from '../../../lib/computeRaceProjection'
import type { ProfileMarker } from './ElevationProfile'
import { hav } from '../../../lib/gpxCore'
import { HEAT_COLORS, HEAT_NAMES } from '../../../lib/raceStrategyView'
import { mapTiler3DConfig } from '../../../lib/staticMap'

interface HeatSeg { startKm: number; endKm: number; heat: number }

interface Props {
  points: GpxPoint[]
  markers: ProfileMarker[]
  heatSegments: HeatSeg[]
  cursorKm: number | null
  totalKm: number
  heightPx: number
}

/** lon/lat interpolés sur le tracé à une distance donnée (km). */
function lngLatAtKm(km: number, cum: number[], pts: GpxPoint[]): [number, number] | null {
  if (pts.length < 2) return null
  const target = Math.max(0, Math.min(cum[cum.length - 1], km))
  let i = 1
  while (i < cum.length && cum[i] < target) i++
  if (i >= pts.length) { const p = pts[pts.length - 1]; return [p.lon, p.lat] }
  const a = pts[i - 1], b = pts[i]
  const t = (target - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
  return [a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t]
}

/** Coordonnées du tracé entre deux km (bornes interpolées → jointures nettes). */
function sliceCoords(a: number, b: number, cum: number[], pts: GpxPoint[]): [number, number][] {
  const out: [number, number][] = []
  const start = lngLatAtKm(a, cum, pts)
  if (start) out.push(start)
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > a && cum[i] < b) out.push([pts[i].lon, pts[i].lat])
  }
  const end = lngLatAtKm(b, cum, pts)
  if (end) out.push(end)
  return out
}

/** FeatureCollection du tracé colorée par effort (un segment par tranche d'effort). */
function buildHeatFC(heatSegments: HeatSeg[], cum: number[], pts: GpxPoint[]) {
  const features = heatSegments
    .map((s) => ({
      type: 'Feature' as const,
      properties: { color: HEAT_COLORS[s.heat] || '#E5562A' },
      geometry: { type: 'LineString' as const, coordinates: sliceCoords(s.startKm, s.endKm, cum, pts) },
    }))
    .filter((f) => f.geometry.coordinates.length >= 2)
  return { type: 'FeatureCollection' as const, features }
}

// Carte 3D (MapLibre + terrain MapTiler) : tracé GPS drapé sur le relief en perspective.
// MapLibre est chargé en import dynamique → hors du bundle initial. Repli : cadre sombre.
export default function RouteMap3D({ points, markers, heatSegments, cursorKm, totalKm, heightPx }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null)
  const cursorMarkerRef = useRef<MlMarker | null>(null)
  const cumRef = useRef<number[]>([])
  const readyRef = useRef(false)
  const [mapError, setMapError] = useState(false)

  // ── Construction de la carte (une fois par tracé) ──────────────────────────
  useEffect(() => {
    if (!containerRef.current || points.length < 2) return
    const cfg = mapTiler3DConfig()
    if (!cfg) return

    const cum = [0]
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + hav(points[i - 1], points[i]) / 1000)
    cumRef.current = cum
    const coords = points.map((p) => [p.lon, p.lat] as [number, number])
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
    for (const p of points) {
      if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat
    }

    let map: MlMap | null = null
    let cancelled = false
    ;(async () => {
      const maplibregl = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css')
      if (cancelled || !containerRef.current) return
      mlRef.current = maplibregl
      map = new maplibregl.Map({
        container: containerRef.current,
        style: cfg.style,
        center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
        zoom: 11,
        pitch: 54,
        bearing: -18,
        scrollZoom: false,            // ne pas piéger le scroll de page
        cooperativeGestures: true,    // mobile : 2 doigts pour bouger
        attributionControl: { compact: true },
        // no-referrer : contournement restriction origine clé MapTiler (domaine vorcelab.app
        // non listé). Supprime l'en-tête Referer → MapTiler accepte si la clé le permet.
        // Fix définitif : ajouter vorcelab.app dans le dashboard MapTiler ou VITE_MAPTILER_KEY.
        transformRequest: (url) => ({ url, referrerPolicy: 'no-referrer' }),
      })
      mapRef.current = map

      map.on('error', (e) => {
        // Style 403 (clé MapTiler restreinte au mauvais domaine) → affiche un repli lisible.
        if (!cancelled && e.error?.status === 403) setMapError(true)
      })

      map.on('load', () => {
        if (!map || cancelled) return
        setMapError(false)
        // Relief 3D
        map.addSource('dem', { type: 'raster-dem', url: cfg.terrain })
        map.setTerrain({ source: 'dem', exaggeration: 2.5 })  // relief bien marqué même dézoomé
        try {
          map.setSky({ 'sky-color': '#0d1320', 'horizon-color': '#1d2738', 'fog-color': '#0c0c0e', 'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.6 })
        } catch { /* setSky indispo selon style */ }

        // Tracé : liseré sombre (lisibilité) + ligne colorée par effort (vert→rouge,
        // même palette que le profil). Repli ember uni si pas de découpage d'effort.
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
        map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0c0c0e', 'line-width': 7.5, 'line-opacity': 0.6 } })
        const heatFC = buildHeatFC(heatSegments ?? [], cum, points)
        if (heatFC.features.length) {
          map.addSource('route-heat', { type: 'geojson', data: heatFC })
          map.addLayer({ id: 'route-line', type: 'line', source: 'route-heat', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4 } })
        } else {
          map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#E5562A', 'line-width': 3.6 } })
        }

        // Cadre sur le tracé (en gardant l'inclinaison)
        map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 38, pitch: 54, bearing: -18, duration: 0, maxZoom: 15 })

        // Repères départ / ravitos / arrivée
        for (const m of markers) {
          if (m.kind === 'wall') continue
          const ll = lngLatAtKm(m.km, cum, points)
          if (!ll) continue
          const ring = m.kind === 'start' || m.kind === 'finish'
          const c = m.kind === 'finish' ? '#4ad07a' : m.kind === 'start' ? '#E5562A' : '#ffffff'
          const el = document.createElement('div')
          el.style.cssText = `width:${ring ? 11 : 8}px;height:${ring ? 11 : 8}px;border-radius:999px;background:${c};border:2px solid #0c0c0e;box-shadow:0 1px 4px rgba(0,0,0,.6)`
          new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map)
        }

        readyRef.current = true
        placeCursor(cursorKm)
      })
    })()

    return () => {
      cancelled = true
      readyRef.current = false
      cursorMarkerRef.current = null
      if (map) map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, markers])

  // ── Curseur synchronisé avec le survol du profil ───────────────────────────
  function placeCursor(km: number | null) {
    const map = mapRef.current, maplibregl = mlRef.current
    if (!map || !maplibregl || !readyRef.current) return
    if (km == null) {
      if (cursorMarkerRef.current) { cursorMarkerRef.current.remove(); cursorMarkerRef.current = null }
      return
    }
    const ll = lngLatAtKm(km, cumRef.current, points)
    if (!ll) return
    if (!cursorMarkerRef.current) {
      const el = document.createElement('div')
      el.style.cssText = 'width:14px;height:14px;border-radius:999px;background:#4ad07a;border:2px solid #0c0c0e;box-shadow:0 0 0 5px rgba(74,208,122,.3)'
      cursorMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map)
    } else {
      cursorMarkerRef.current.setLngLat(ll)
    }
  }
  useEffect(() => { placeCursor(cursorKm) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorKm])

  // Rotation manuelle : le relief peut masquer une partie du tracé selon l'angle.
  function rotateBy(deg: number) {
    const m = mapRef.current; if (!m) return
    m.easeTo({ bearing: m.getBearing() + deg, duration: 350 })
  }
  function resetView() {
    const m = mapRef.current; if (!m) return
    m.easeTo({ bearing: -18, pitch: 54, duration: 400 })
  }
  const ctrlBtn: React.CSSProperties = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(12,12,14,.62)',
    backdropFilter: 'blur(2px)', color: '#e8e8ea', fontSize: 16, lineHeight: 1, cursor: 'pointer',
  }

  return (
    <div style={{ background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: heightPx }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--vl-text-3)', fontWeight: 500 }}>TRACÉ GPS · 3D</div>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--vl-text-3)' }}>{totalKm.toFixed(1)} KM</span>
      </div>
      <div style={{ position: 'relative', flex: 1, margin: '0 12px 12px', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden', background: 'color-mix(in srgb, var(--vl-surf-2) 70%, var(--vl-bg))' }}>
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
        {mapError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'color-mix(in srgb, var(--vl-surf-2) 70%, var(--vl-bg))' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-3)', letterSpacing: '.12em' }}>CARTE 3D INDISPONIBLE</span>
            <span style={{ fontSize: 11.5, color: 'var(--vl-text-3)', maxWidth: 300, textAlign: 'center', lineHeight: 1.5 }}>Clé MapTiler non autorisée pour ce domaine. Ajouter <b>vorcelab.app</b> dans le dashboard MapTiler ou configurer le secret <code>VITE_MAPTILER_KEY</code>.</span>
          </div>
        )}
        {/* Rotation : pour voir le tracé quand une crête le masque */}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
          <button title="Tourner à gauche" aria-label="Tourner à gauche" onClick={() => rotateBy(-40)} style={ctrlBtn}>⟲</button>
          <button title="Vue par défaut" aria-label="Vue par défaut" onClick={resetView} style={{ ...ctrlBtn, fontSize: 13 }}>⌂</button>
          <button title="Tourner à droite" aria-label="Tourner à droite" onClick={() => rotateBy(40)} style={ctrlBtn}>⟳</button>
        </div>
        {(heatSegments?.length ?? 0) > 0 && (
          <div style={{ position: 'absolute', left: 6, bottom: 6, display: 'flex', gap: 7, padding: '4px 7px', borderRadius: 6, background: 'rgba(12,12,14,.6)', backdropFilter: 'blur(2px)', pointerEvents: 'none' }}>
            {[1, 2, 3, 4].map((h) => (
              <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: HEAT_COLORS[h] }} />
                <span className="mono" style={{ fontSize: 8, color: '#e8e8ea', letterSpacing: '.02em' }}>{HEAT_NAMES[h]}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
