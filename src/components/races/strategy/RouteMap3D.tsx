import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap, Marker as MlMarker, LngLatBoundsLike } from 'maplibre-gl'
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
  const routeMarkersRef = useRef<MlMarker[]>([])
  const cumRef = useRef<number[]>([])
  const boundsRef = useRef<LngLatBoundsLike | null>(null)
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [is3D, setIs3D] = useState(true)

  // Signature GÉOMÉTRIQUE du tracé : on ne reconstruit la carte QUE si le parcours
  // change réellement (nb de points + extrémités). Un simple re-render du parent
  // (météo, survol du profil…) qui recrée le tableau `points` ne doit PAS rebâtir
  // la carte — sinon la vue de l'utilisateur se fait recadrer en pleine navigation.
  const routeSig = useMemo(() => {
    if (points.length < 2) return ''
    const a = points[0], b = points[points.length - 1]
    return `${points.length}|${a.lon.toFixed(5)},${a.lat.toFixed(5)}|${b.lon.toFixed(5)},${b.lat.toFixed(5)}`
  }, [points])

  // ── Construction de la carte (uniquement quand le tracé change) ─────────────
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
    const bounds: LngLatBoundsLike = [[minLon, minLat], [maxLon, maxLat]]
    boundsRef.current = bounds

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
        // Navigation confort : on déplace à un doigt, on pince pour zoomer, et les
        // boutons +/- couvrent le desktop. scrollZoom reste OFF pour ne pas piéger
        // le scroll de page ; cooperativeGestures OFF pour ne pas exiger 2 doigts.
        scrollZoom: false,
        cooperativeGestures: false,
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
        map.fitBounds(bounds, { padding: 38, pitch: 54, bearing: -18, duration: 0, maxZoom: 15 })

        // Entrée « survol » : caméra à plat légèrement dézoomée qui bascule en 3D
        // en balayant vers l'angle par défaut. Coupée si prefers-reduced-motion.
        // INTERRUPTIBLE : au moindre geste de l'utilisateur on stoppe l'animation
        // pour ne jamais lui reprendre la main pendant qu'il navigue.
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const targetZoom = map.getZoom()
          map.jumpTo({ pitch: 10, bearing: -95, zoom: targetZoom - 0.7 })
          map.easeTo({ pitch: 54, bearing: -18, zoom: targetZoom, duration: 1600, essential: false })
          const stopIntro = () => { map?.stop() }
          map.once('mousedown', stopIntro)
          map.once('touchstart', stopIntro)
          map.once('wheel', stopIntro)
          map.once('dragstart', stopIntro)
        }

        readyRef.current = true
        setReady(true)
        placeCursor(cursorKm)
      })
    })()

    return () => {
      cancelled = true
      readyRef.current = false
      setReady(false)
      cursorMarkerRef.current = null
      routeMarkersRef.current = []
      if (map) map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSig])

  // ── Repères (départ / ravitos / arrivée) : posés/rafraîchis SANS reconstruire
  //    la carte (donc sans recadrage) quand la liste de marqueurs change. ────────
  useEffect(() => {
    const map = mapRef.current, maplibregl = mlRef.current
    if (!map || !maplibregl || !ready) return
    routeMarkersRef.current.forEach((m) => m.remove())
    routeMarkersRef.current = []
    for (const m of markers) {
      if (m.kind === 'wall') continue
      const ll = lngLatAtKm(m.km, cumRef.current, points)
      if (!ll) continue
      const ring = m.kind === 'start' || m.kind === 'finish'
      const c = m.kind === 'finish' ? '#4ad07a' : m.kind === 'start' ? '#E5562A' : '#ffffff'
      const el = document.createElement('div')
      el.style.cssText = `width:${ring ? 11 : 8}px;height:${ring ? 11 : 8}px;border-radius:999px;background:${c};border:2px solid #0c0c0e;box-shadow:0 1px 4px rgba(0,0,0,.6)`
      routeMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, ready])

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
  function zoomBy(delta: number) {
    const m = mapRef.current; if (!m) return
    m.easeTo({ zoom: m.getZoom() + delta, duration: 250 })
  }
  // « Recentrer » : recadre sur le parcours + angle par défaut. C'est le SEUL
  // recadrage — et il est déclenché par l'utilisateur, jamais automatiquement.
  function recenter() {
    const m = mapRef.current; if (!m || !boundsRef.current) return
    setIs3D(true)
    m.fitBounds(boundsRef.current, { padding: 38, pitch: 54, bearing: -18, duration: 600, maxZoom: 15 })
  }
  // Bascule 2D (vue de dessus) ↔ 3D (perspective sur le relief).
  function toggle3D() {
    const m = mapRef.current; if (!m) return
    const next = !is3D
    setIs3D(next)
    m.easeTo({ pitch: next ? 54 : 0, duration: 450 })
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
        {/* Contrôles caméra. Zoom +/- (haut-droite) séparés de la rotation/2D-3D
            pour rester lisibles. Aucun recadrage n'est automatique : « recentrer »
            (⌂) est le seul et il est déclenché ici, à la demande. */}
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button title="Zoom avant" aria-label="Zoom avant" onClick={() => zoomBy(1)} style={{ ...ctrlBtn, fontSize: 20 }}>+</button>
            <button title="Zoom arrière" aria-label="Zoom arrière" onClick={() => zoomBy(-1)} style={{ ...ctrlBtn, fontSize: 20 }}>−</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button title="Tourner à gauche" aria-label="Tourner à gauche" onClick={() => rotateBy(-40)} style={ctrlBtn}>⟲</button>
            <button title="Tourner à droite" aria-label="Tourner à droite" onClick={() => rotateBy(40)} style={ctrlBtn}>⟳</button>
            <button title={is3D ? 'Vue 2D (de dessus)' : 'Vue 3D (relief)'} aria-label={is3D ? 'Passer en 2D' : 'Passer en 3D'} onClick={toggle3D} style={{ ...ctrlBtn, fontSize: 11, fontWeight: 700, width: 34 }}>{is3D ? '2D' : '3D'}</button>
            <button title="Recentrer sur le parcours" aria-label="Recentrer sur le parcours" onClick={recenter} style={{ ...ctrlBtn, fontSize: 13 }}>⌂</button>
          </div>
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
