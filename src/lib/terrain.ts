// Effet du TERRAIN (surface + météo) sur le temps de course, porté du legacy terrain.js.
// Surfaces via OSM Overpass (par section), facteurs de difficulté validés par la science
// (asphalte = réf ; sentier ~+5% ; gravier ~+8% ; rocher/technique +10–15% ; boue +15–18% ;
// sable mou +40–60% — ici prudents). Pluie → malus d'adhérence, surtout en descente raide.
// Calibration personnelle prévue (userProfile.terrainCalibration), comme le reste de l'algo.
import { hav, type LatLon } from './gpxCore'

export interface TerrainWeather {
  precip_prob?: number       // probabilité de pluie (%)
  precip_recent?: number     // pluie récente (mm sur ~6h)
  precip?: number            // pluie (mm) — format archive/forecast
}

// Facteurs de difficulté terrain (multiplicateur de temps ≥ 1).
export const TERRAIN_TIME_FACTORS: Record<string, number> = {
  asphalt: 1.00, concrete: 1.00, paved: 1.00,
  compacted: 1.02, track: 1.02,
  path: 1.05, footway: 1.05, bridleway: 1.05,
  dirt: 1.06, ground: 1.06, grass: 1.07,
  gravel: 1.08, fine_gravel: 1.07, pebblestone: 1.09, cobblestone: 1.08,
  sand: 1.15, mud: 1.18, rock: 1.12, rocks: 1.12, scree: 1.15,
}

export const DEFAULT_TERRAIN_CALIBRATION: Record<string, number> = Object.fromEntries(
  Object.keys(TERRAIN_TIME_FACTORS).map((k) => [k, 1.0]),
)

export function getPersonalTerrainFactor(surfaceKey: string, userProfile: { terrainCalibration?: Record<string, number> } | null | undefined): number {
  const cal = userProfile?.terrainCalibration ?? {}
  return cal[surfaceKey] ?? DEFAULT_TERRAIN_CALIBRATION[surfaceKey] ?? 1.0
}

/** Multiplicateur de temps pour une section, selon surface + météo + pente. Plafond 1.35. */
export function terrainTimePenalty(
  surfaceKey: string | null | undefined,
  weather: TerrainWeather | null | undefined,
  grade = 0,
  _sectionType: string | null = null,
  userProfile: { terrainCalibration?: Record<string, number> } | null = null,
): number {
  if (!surfaceKey) return 1
  const globalBase = TERRAIN_TIME_FACTORS[surfaceKey] ?? 1.04
  const personal = getPersonalTerrainFactor(surfaceKey, userProfile)
  const base = globalBase * personal

  const wet = !!weather && ((weather.precip_prob ?? 0) > 20 || (weather.precip_recent ?? weather.precip ?? 0) > 0.3)
  const veryWet = !!weather && ((weather.precip_prob ?? 0) > 50 || (weather.precip_recent ?? weather.precip ?? 0) > 2)

  const hardSurfaces = ['asphalt', 'concrete', 'paved']
  const unstableSurfaces = ['gravel', 'fine_gravel', 'pebblestone', 'rock', 'rocks', 'scree', 'mud', 'grass', 'sand']
  const deformableSurfaces = ['mud', 'sand', 'grass']
  const steepDown = grade < -10, steepUp = grade > 10

  let factor = base
  if (wet && !hardSurfaces.includes(surfaceKey)) factor += 0.02
  if (veryWet && !hardSurfaces.includes(surfaceKey)) factor += 0.03
  if (steepDown && unstableSurfaces.includes(surfaceKey)) factor += 0.05
  if (steepUp && deformableSurfaces.includes(surfaceKey)) factor += 0.04
  return Math.min(1.35, Math.max(1, factor))
}

export interface SurfaceInfo { fr: string; risk: 'none' | 'low' | 'medium' | 'high'; col: string }
export const SURFACE_MAP: Record<string, SurfaceInfo> = {
  rock: { fr: 'Rochers', risk: 'high', col: 'var(--vl-status-over)' },
  rocks: { fr: 'Rochers', risk: 'high', col: 'var(--vl-status-over)' },
  scree: { fr: 'Éboulis', risk: 'high', col: 'var(--vl-status-over)' },
  mud: { fr: 'Boue', risk: 'high', col: 'var(--vl-status-over)' },
  sand: { fr: 'Sable', risk: 'high', col: 'var(--vl-ember)' },
  gravel: { fr: 'Gravier', risk: 'medium', col: 'var(--vl-ember)' },
  fine_gravel: { fr: 'Gravier fin', risk: 'medium', col: 'var(--vl-amber)' },
  pebblestone: { fr: 'Cailloux', risk: 'medium', col: 'var(--vl-ember)' },
  dirt: { fr: 'Terre', risk: 'medium', col: 'var(--vl-amber)' },
  ground: { fr: 'Sol naturel', risk: 'medium', col: 'var(--vl-amber)' },
  grass: { fr: 'Herbe', risk: 'medium', col: 'var(--vl-amber)' },
  cobblestone: { fr: 'Pavés', risk: 'medium', col: 'var(--vl-ember)' },
  compacted: { fr: 'Compacté', risk: 'low', col: 'var(--vl-status-rest)' },
  paved: { fr: 'Bitume', risk: 'none', col: 'var(--vl-text-3)' },
  asphalt: { fr: 'Bitume', risk: 'none', col: 'var(--vl-text-3)' },
  concrete: { fr: 'Béton', risk: 'none', col: 'var(--vl-text-3)' },
  path: { fr: 'Sentier', risk: 'medium', col: 'var(--vl-amber)' },
  track: { fr: 'Chemin', risk: 'low', col: 'var(--vl-status-rest)' },
  footway: { fr: 'Sentier', risk: 'medium', col: 'var(--vl-amber)' },
  bridleway: { fr: 'Piste', risk: 'medium', col: 'var(--vl-amber)' },
}
export function surfaceInfo(k: string): SurfaceInfo {
  return SURFACE_MAP[k] || { fr: k, risk: 'medium', col: 'var(--vl-text-2)' }
}

function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
  if (!len) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

interface OsmWay { geometry?: { lat: number; lon: number }[]; tags?: { surface?: string; highway?: string } }

/** Récupère la surface OSM (par section) via Overpass. Renvoie un tableau aligné sur `sections`. */
export async function fetchTerrainSurfaces(
  points: LatLon[],
  sections: { startKm: number; endKm?: number; km?: number }[],
): Promise<(string | null)[]> {
  try {
    const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon)
    const S = Math.min(...lats).toFixed(5), N = Math.max(...lats).toFixed(5)
    const W = Math.min(...lons).toFixed(5), E = Math.max(...lons).toFixed(5)
    const q = `[out:json][timeout:25];(way(${S},${W},${N},${E})["surface"];way(${S},${W},${N},${E})["highway"~"^(path|track|footway|bridleway)$"];);out body geom;`
    const signal = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(18000) : undefined
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q), signal,
    })
    if (!res.ok) return sections.map(() => null)
    const { elements = [] } = await res.json() as { elements?: (OsmWay & { type?: string })[] }
    const ways = elements.filter((e) => (e.geometry?.length ?? 0) >= 2)

    const cumDist = [0]
    for (let i = 1; i < points.length; i++) cumDist.push(cumDist[i - 1] + hav(points[i - 1], points[i]))

    return sections.map((s) => {
      const mid = ((s.startKm + (s.endKm ?? s.km ?? s.startKm)) / 2) * 1000
      let ci = 0, minD = Infinity
      cumDist.forEach((d, i) => { const dd = Math.abs(d - mid); if (dd < minD) { minD = dd; ci = i } })
      const pt = points[ci]; if (!pt) return null
      let bestD = Infinity, bestSurf: string | null = null
      for (const way of ways) {
        const g = way.geometry ?? []
        for (let i = 0; i < g.length - 1; i++) {
          const d = ptSegDist(pt.lat, pt.lon, g[i].lat, g[i].lon, g[i + 1].lat, g[i + 1].lon)
          if (d < bestD) { bestD = d; bestSurf = way.tags?.surface ?? way.tags?.highway ?? null }
        }
      }
      return bestD < 0.0007 ? bestSurf : null
    })
  } catch {
    return sections.map(() => null)
  }
}

/** Texte de risque de glisse pour une surface + météo + pente, ou null. */
export function slipRisk(surfKey: string | null | undefined, weather: TerrainWeather | null | undefined, grade = 0): string | null {
  if (!surfKey) return null
  const info = SURFACE_MAP[surfKey]
  if (!info || info.risk === 'none') return null
  const prob = weather?.precip_prob ?? ((weather?.precip ?? 0) > 0 ? 70 : 0)
  const mm6h = weather?.precip_recent ?? weather?.precip ?? 0
  const wet = prob > 20 || mm6h > 0.3
  const vwet = prob > 50 || mm6h > 2
  const steep = Math.abs(grade) > 10

  if (surfKey === 'mud') return 'boue — très glissant'
  if (surfKey === 'sand') return 'sable instable'
  if (surfKey === 'grass') return wet ? 'glissant (herbe mouillée)' : null
  if (surfKey === 'rock' || surfKey === 'rocks' || surfKey === 'scree') return wet ? 'très glissant (rochers humides)' : 'terrain rocheux technique'
  if (surfKey === 'gravel' || surfKey === 'fine_gravel' || surfKey === 'pebblestone') {
    if (vwet) return 'très glissant (graviers détrempés)'
    if (wet) return 'glissant (graviers humides)'
    if (steep) return 'instable (graviers/poussière — descente raide)'
    return null
  }
  if (surfKey === 'dirt' || surfKey === 'ground') return wet ? 'glissant (terre détrempée)' : null
  if (surfKey === 'cobblestone') return wet ? 'glissant (pavés mouillés)' : null
  if (info.risk === 'high') return wet ? 'très glissant' : 'terrain technique'
  if (info.risk === 'medium' && vwet) return 'glissant (humide)'
  return null
}
