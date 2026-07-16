import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap, Marker as MlMarker, LngLatBoundsLike } from 'maplibre-gl'
import type { GpxPoint } from '../../../lib/computeRaceProjection'
import type { RaceConditions } from '../../../lib/raceWeather'
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
  /** Temps de course écoulé (s) à un km donné — pour le chrono du rejeu animé. */
  secAtKm?: (km: number) => number
  /** Météo de la fenêtre de course — pour la couche « météo » (badge). */
  forecast?: RaceConditions | null
  /** Date de la course (ISO) — pour la couche « soleil » (angle réel du soleil). */
  raceDate?: string
  /** Heure de départ 'HH:MM' — pour positionner le soleil à l'heure de course. */
  startTime?: string | null
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

// ── Couche « pente » (#10) : le tracé coloré par % de pente signée ────────────
const GRADE_LEGEND: { color: string; label: string }[] = [
  { color: '#38bdf8', label: 'descente −' },
  { color: '#4ad07a', label: 'plat' },
  { color: '#eab308', label: '4-8%' },
  { color: '#f97316', label: '8-14%' },
  { color: '#ef4444', label: '>14%' },
]
function gradeColor(g: number): string {
  if (g <= -4) return '#38bdf8'
  if (g < 4) return '#4ad07a'
  if (g < 8) return '#eab308'
  if (g < 14) return '#f97316'
  return '#ef4444'
}
/** FeatureCollection colorée par pente signée (fusion des segments de même couleur). */
function buildGradeFC(pts: GpxPoint[], cum: number[]) {
  const features: { type: 'Feature'; properties: { color: string }; geometry: { type: 'LineString'; coordinates: [number, number][] } }[] = []
  let curColor: string | null = null
  let coords: [number, number][] = []
  for (let i = 1; i < pts.length; i++) {
    const dxm = (cum[i] - cum[i - 1]) * 1000
    const de = (pts[i].ele ?? 0) - (pts[i - 1].ele ?? 0)
    const g = dxm > 1 ? (de / dxm) * 100 : 0
    const col = gradeColor(g)
    if (col !== curColor) {
      if (curColor && coords.length >= 2) features.push({ type: 'Feature', properties: { color: curColor }, geometry: { type: 'LineString', coordinates: coords } })
      curColor = col
      coords = [[pts[i - 1].lon, pts[i - 1].lat]]
    }
    coords.push([pts[i].lon, pts[i].lat])
  }
  if (curColor && coords.length >= 2) features.push({ type: 'Feature', properties: { color: curColor }, geometry: { type: 'LineString', coordinates: coords } })
  return { type: 'FeatureCollection' as const, features }
}

// ── Couche « soleil » (#7) : azimut réel du soleil (°, 0 = Nord, sens horaire)
//    et hauteur (°) pour la date+heure de course. Algorithme solaire compact
//    (NOAA simplifié) — suffisant pour orienter l'ombrage du relief. ────────────
function sunPosition(date: Date, lat: number, lon: number): { azimuth: number; altitude: number } {
  const rad = Math.PI / 180
  const dayMs = 86400000
  const J1970 = 2440588, J2000 = 2451545
  const toJulian = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970
  const d = toJulian(date) - J2000
  const M = rad * (357.5291 + 0.98560028 * d)                       // anomalie moyenne
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI // longitude éclip.
  const e = rad * 23.4397                                            // obliquité
  const dec = Math.asin(Math.sin(e) * Math.sin(L))                  // déclinaison
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L))     // ascension droite
  const lw = rad * -lon
  const theta = rad * (280.16 + 360.9856235 * d) - lw               // temps sidéral
  const H = theta - ra                                              // angle horaire
  const phi = rad * lat
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) // 0 = Sud, horaire
  return { azimuth: (azimuth / rad + 180) % 360, altitude: altitude / rad }   // ramené à 0 = Nord
}

/** Azimut (°) → point cardinal FR, pour l'indicateur soleil. */
function compassFR(az: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return dirs[Math.round((az % 360) / 45) % 8]
}

/** Niveau d'effort (heat) à un km — pour l'étiquette live du rejeu. */
function heatAtKm(km: number, segs: HeatSeg[]): number {
  for (const s of segs) if (km >= s.startKm && km <= s.endKm) return s.heat
  return 0
}
function fmtPaceSec(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtChrono(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

// Carte 3D (MapLibre + terrain MapTiler) : tracé GPS drapé sur le relief en perspective.
// MapLibre est chargé en import dynamique → hors du bundle initial. Repli : cadre sombre.
export default function RouteMap3D({ points, markers, heatSegments, cursorKm, totalKm, heightPx, secAtKm, forecast, raceDate, startTime }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null)
  const cursorMarkerRef = useRef<MlMarker | null>(null)
  const routeMarkersRef = useRef<MlMarker[]>([])
  const cumRef = useRef<number[]>([])
  const boundsRef = useRef<LngLatBoundsLike | null>(null)
  const centerRef = useRef<[number, number]>([0, 0])
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [is3D, setIs3D] = useState(true)
  // Couches optionnelles (OFF par défaut : la carte reste épurée).
  const [layers, setLayers] = useState({ sun: false, weather: false, grade: false })
  // Relief : 3 presets sains (un slider libre laissait pousser à ×5 → pics moches).
  const [exagg, setExagg] = useState(2)
  // Rejeu animé : un coureur parcourt le tracé, la caméra le suit, chrono live.
  const [playing, setPlaying] = useState(false)
  const [head, setHead] = useState<{ km: number; sec: number; pace: number | null; heat: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const runnerRef = useRef<MlMarker | null>(null)
  const playStartRef = useRef(0)

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
    centerRef.current = [(minLon + maxLon) / 2, (minLat + maxLat) / 2]

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
        // Navigation confort : molette pour zoomer (desktop), pincer sur mobile,
        // boutons +/- en secours, déplacement à un doigt. cooperativeGestures OFF
        // pour ne pas exiger 2 doigts.
        scrollZoom: true,
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
        map.setTerrain({ source: 'dem', exaggeration: 2 })  // « Naturel » par défaut
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
        // Couche « pente » (#10), cachée par défaut : on la révèle en masquant l'effort.
        map.addSource('route-grade', { type: 'geojson', data: buildGradeFC(points, cum) })
        map.addLayer({ id: 'route-grade', type: 'line', source: 'route-grade', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' }, paint: { 'line-color': ['get', 'color'], 'line-width': 4.2 } })

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
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      setPlaying(false)
      cursorMarkerRef.current = null
      routeMarkersRef.current = []
      runnerRef.current = null
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

  // ── Couche #9 : exagération du relief (slider) ─────────────────────────────
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    try { m.setTerrain({ source: 'dem', exaggeration: exagg }) } catch { /* terrain pas prêt */ }
  }, [exagg, ready])

  // ── Couche #10 : bascule effort ↔ pente (visibilité des deux calques) ───────
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    try {
      if (m.getLayer('route-grade')) m.setLayoutProperty('route-grade', 'visibility', layers.grade ? 'visible' : 'none')
      if (m.getLayer('route-line')) m.setLayoutProperty('route-line', 'visibility', layers.grade ? 'none' : 'visible')
    } catch { /* calque pas prêt */ }
  }, [layers.grade, ready])

  // Position du soleil (azimut/hauteur) à la date+heure de course, au centre du parcours.
  const sunInfo = useMemo(() => {
    if (!raceDate) return null
    const [c0, c1] = centerRef.current
    const d = new Date(raceDate)
    if (isNaN(d.getTime())) return null
    const mt = startTime?.match(/^(\d{1,2}):(\d{2})/)
    d.setHours(mt ? parseInt(mt[1], 10) : 12, mt ? parseInt(mt[2], 10) : 0, 0, 0)
    return sunPosition(d, c1 || 45, c0 || 6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceDate, startTime, ready])

  // ── Couche #7 : ombrage du relief éclairé depuis la position réelle du soleil ─
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    try {
      const has = m.getLayer('sun-hillshade')
      if (layers.sun && sunInfo) {
        // Ombres SEULEMENT : les taches sable/blanches venaient du « highlight »
        // du hillshade sur le satellite → on le rend transparent (comme l'accent),
        // ne reste qu'un assombrissement doux des versants à l'ombre du soleil.
        const shadowStrength = sunInfo.altitude <= 0 ? 0.5 : sunInfo.altitude < 15 ? 0.42 : 0.3
        if (!has) {
          const before = m.getLayer('route-casing') ? 'route-casing' : undefined
          m.addLayer({
            id: 'sun-hillshade', type: 'hillshade', source: 'dem',
            paint: {
              'hillshade-illumination-anchor': 'map',
              'hillshade-illumination-direction': Math.round(sunInfo.azimuth),
              'hillshade-exaggeration': shadowStrength,
              'hillshade-shadow-color': 'hsla(220, 45%, 8%, 0.9)',
              'hillshade-highlight-color': 'rgba(0,0,0,0)',
              'hillshade-accent-color': 'rgba(0,0,0,0)',
            },
          }, before)
        } else {
          m.setPaintProperty('sun-hillshade', 'hillshade-illumination-direction', Math.round(sunInfo.azimuth))
          m.setPaintProperty('sun-hillshade', 'hillshade-exaggeration', shadowStrength)
        }
      } else if (has) {
        m.removeLayer('sun-hillshade')
      }
    } catch { /* source dem pas prête */ }
  }, [layers.sun, sunInfo, ready])

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

  // ── Rejeu animé de la course ────────────────────────────────────────────────
  function stopFly() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setPlaying(false)
  }
  function startFly() {
    const map = mapRef.current, maplibregl = mlRef.current
    if (!map || !maplibregl || !readyRef.current || points.length < 2) return
    // Curseur coureur recréé à chaque rejeu, en BLANC/ember : un point vert se
    // fondait dans la forêt du satellite (invisible). Blanc = lisible partout.
    if (runnerRef.current) { runnerRef.current.remove(); runnerRef.current = null }
    {
      const el = document.createElement('div')
      el.style.cssText = 'width:20px;height:20px;border-radius:999px;background:#fff;border:3px solid #E5562A;box-shadow:0 0 0 5px rgba(229,86,42,.35),0 2px 7px rgba(0,0,0,.7)'
      runnerRef.current = new maplibregl.Marker({ element: el }).setLngLat(lngLatAtKm(0, cumRef.current, points) ?? [0, 0]).addTo(map)
    }
    setIs3D(true)
    setPlaying(true)
    // Durée du rejeu : ~20 s, un peu plus pour les longs parcours (plafond 34 s).
    const durMs = Math.min(34000, Math.max(16000, totalKm * 900))
    playStartRef.current = performance.now()
    // Cadrage de suivi FIXE : on garde l'orientation courante, un pitch et un zoom
    // modérés (sinon la caméra plonge dans le relief ou vers le ciel → écran noir),
    // et on ne fait ENSUITE que recentrer sur le coureur. Pas de rotation par frame
    // (c'était la cause du « ça tourne dans tous les sens » sur un tracé bruité).
    const followZoom = Math.min(13.6, Math.max(12, map.getZoom()))
    map.jumpTo({ center: lngLatAtKm(0, cumRef.current, points) ?? map.getCenter(), pitch: 52, zoom: followZoom, bearing: map.getBearing() })
    let lastText = 0
    const frame = (now: number) => {
      const m = mapRef.current
      if (!m || !runnerRef.current) { stopFly(); return }
      const u = Math.min(1, (now - playStartRef.current) / durMs)
      const km = u * totalKm
      const ll = lngLatAtKm(km, cumRef.current, points)
      if (ll) {
        runnerRef.current.setLngLat(ll)
        m.setCenter(ll)   // suivi doux : on ne touche qu'au centre, jamais à l'angle
      }
      if (now - lastText > 90) {
        lastText = now
        const sec = secAtKm ? secAtKm(km) : 0
        let pace: number | null = null
        if (secAtKm && km > 0.05 && km < totalKm - 0.05) {
          const d = 0.05
          pace = (secAtKm(km + d) - secAtKm(km - d)) / (2 * d)
        }
        setHead({ km, sec, pace, heat: heatAtKm(km, heatSegments ?? []) })
      }
      if (u < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        setHead({ km: totalKm, sec: secAtKm ? secAtKm(totalKm) : 0, pace: null, heat: heatAtKm(totalKm, heatSegments ?? []) })
        stopFly()
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }
  function toggleFly() { if (playing) stopFly(); else startFly() }

  // Sécurité : coupe l'animation si le composant est démonté en plein rejeu.
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])
  const ctrlBtn: React.CSSProperties = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(12,12,14,.62)',
    backdropFilter: 'blur(2px)', color: '#e8e8ea', fontSize: 16, lineHeight: 1, cursor: 'pointer',
  }

  const sunLabel = sunInfo
    ? sunInfo.altitude <= 0 ? 'sous l’horizon (nuit)' : `${compassFR(sunInfo.azimuth)} · ${Math.round(sunInfo.altitude)}° de hauteur`
    : null
  const RELIEF_PRESETS: { label: string; v: number }[] = [
    { label: 'Doux', v: 1.3 }, { label: 'Naturel', v: 2 }, { label: 'Fort', v: 3 },
  ]

  // Colonne de contrôle des couches (carte à gauche de la carte 3D).
  const layersPanel = (
    <aside style={{ flex: '1 1 190px', maxWidth: 240, minWidth: 168, background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--vl-text-3)', fontWeight: 500 }}>COUCHES</div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--vl-mono)', fontSize: 12, color: raceDate ? 'var(--vl-text)' : 'var(--vl-text-3)', cursor: raceDate ? 'pointer' : 'not-allowed' }}>
        <input type="checkbox" style={{ marginTop: 2, accentColor: '#E5562A' }} checked={layers.sun} disabled={!raceDate} onChange={(e) => setLayers((l) => ({ ...l, sun: e.target.checked }))} />
        <span>
          ☀ Soleil / ombres
          {layers.sun && sunLabel && <span style={{ display: 'block', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>{sunLabel}</span>}
          {!raceDate && <span style={{ display: 'block', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>date de course requise</span>}
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--vl-mono)', fontSize: 12, color: forecast?.available ? 'var(--vl-text)' : 'var(--vl-text-3)', cursor: forecast?.available ? 'pointer' : 'not-allowed' }}>
        <input type="checkbox" style={{ marginTop: 2, accentColor: '#E5562A' }} checked={layers.weather} disabled={!forecast?.available} onChange={(e) => setLayers((l) => ({ ...l, weather: e.target.checked }))} />
        <span>
          ⛅ Météo
          {layers.weather && forecast?.available && (
            <span style={{ display: 'block', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 3, lineHeight: 1.5 }}>
              {forecast.tempC != null && <>🌡 {Math.round(forecast.tempC)}°{forecast.feelsLikeC != null ? ` (ress. ${Math.round(forecast.feelsLikeC)}°)` : ''} </>}
              {forecast.windKmh != null && <>· 💨 {Math.round(forecast.windKmh)} km/h </>}
              {forecast.precipMm != null && forecast.precipMm > 0 && <>· 🌧 {forecast.precipMm} mm</>}
            </span>
          )}
          {!forecast?.available && <span style={{ display: 'block', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>météo indisponible</span>}
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text)', cursor: 'pointer' }}>
        <input type="checkbox" style={{ accentColor: '#E5562A' }} checked={layers.grade} onChange={(e) => setLayers((l) => ({ ...l, grade: e.target.checked }))} />
        ▲ Couleur = pente (%)
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--vl-line)', paddingTop: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--vl-text-2)' }}>⛰ Relief</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {RELIEF_PRESETS.map((p) => (
            <button key={p.label} onClick={() => setExagg(p.v)}
              style={{ flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.04em',
                border: `1px solid ${exagg === p.v ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                background: exagg === p.v ? 'color-mix(in srgb, var(--vl-ember) 18%, transparent)' : 'transparent',
                color: exagg === p.v ? 'var(--vl-ember)' : 'var(--vl-text-2)' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
      {!mapError && layersPanel}
      <div style={{ flex: '5 1 520px', minWidth: 280 }}>
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
        {!playing && (layers.grade || (heatSegments?.length ?? 0) > 0) && (
          <div style={{ position: 'absolute', left: 6, bottom: 6, display: 'flex', gap: 7, padding: '4px 7px', borderRadius: 6, background: 'rgba(12,12,14,.6)', backdropFilter: 'blur(2px)', pointerEvents: 'none' }}>
            {layers.grade
              ? GRADE_LEGEND.map((g) => (
                  <span key={g.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />
                    <span className="mono" style={{ fontSize: 8, color: '#e8e8ea', letterSpacing: '.02em' }}>{g.label}</span>
                  </span>
                ))
              : [1, 2, 3, 4].map((h) => (
                  <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: HEAT_COLORS[h] }} />
                    <span className="mono" style={{ fontSize: 8, color: '#e8e8ea', letterSpacing: '.02em' }}>{HEAT_NAMES[h]}</span>
                  </span>
                ))}
          </div>
        )}

        {/* ── Rejeu animé : bouton ▶ + tableau de bord live (chrono / km / allure / effort) ── */}
        {!mapError && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
            {playing && head && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 13px', borderRadius: 9, background: 'rgba(12,12,14,.74)', backdropFilter: 'blur(3px)', border: '1px solid rgba(255,255,255,.12)' }}>
                <span className="display" style={{ fontSize: 20, color: '#4ad07a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtChrono(head.sec)}</span>
                <span className="mono" style={{ fontSize: 11, color: '#e8e8ea', fontVariantNumeric: 'tabular-nums' }}>{head.km.toFixed(1)}/{totalKm.toFixed(1)} km</span>
                {head.pace != null && <span className="mono" style={{ fontSize: 11, color: '#e8e8ea', fontVariantNumeric: 'tabular-nums' }}>{fmtPaceSec(head.pace)}/km</span>}
                {head.heat > 0 && (
                  <span className="mono" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, color: '#e8e8ea' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: HEAT_COLORS[head.heat] }} />{HEAT_NAMES[head.heat]}
                  </span>
                )}
              </div>
            )}
            <button
              title={playing ? 'Arrêter le rejeu' : 'Rejouer la course'}
              aria-label={playing ? 'Arrêter le rejeu' : 'Rejouer la course'}
              onClick={toggleFly}
              style={{
                pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.18)',
                background: playing ? 'rgba(229,86,42,.85)' : 'rgba(12,12,14,.72)', backdropFilter: 'blur(3px)',
                color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', cursor: 'pointer',
                fontFamily: 'var(--vl-mono)',
              }}
            >
              {playing ? '⏹ ARRÊTER' : '▶ REJOUER LA COURSE'}
            </button>
          </div>
        )}
      </div>
    </div>
      </div>
    </div>
  )
}
