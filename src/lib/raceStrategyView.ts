// Adaptateurs pour la refonte « Stratégie de course » (design direction A).
// Branche les vraies données (ProjectionResult) sur la dataviz du profil héroïque.
import type { ProjectionResult, Section, GpxPoint } from './computeRaceProjection'

// Échelle d'effort (heat) — mêmes hex dark/light. « Maximal » remplace « Raide »
// (mot d'effort cohérent avec Facile/Soutenu/Dur ; « Pente raide » reste le nom du
// terrain pour la montée la plus dure).
export const HEAT_COLORS = ['', '#5da084', '#d4a843', '#d6803e', '#d1583a'] as const
export const HEAT_NAMES = ['', 'Facile', 'Soutenu', 'Dur', 'Maximal'] as const
export type HeatLevel = 1 | 2 | 3 | 4

/**
 * Effort d'un tronçon, calibré sur la science du trail (Minetti 2002 ; Vernillo 2017 ;
 * coût métabolique mini en descente ≈ −10 % ; bascule course→marche ≈ +15 %).
 * Montée : coût croissant. Descente : la zone « favorable » autour de −10 % est verte
 * (récup / vitesse libre) ; seul le raide (freinage, charge excentrique) devient dur.
 * La sinuosité (lacets) est gérée à part — bump ≥ Dur côté affichage.
 */
export function sectionHeat(sec: Pick<Section, 'grade' | 'type'>): HeatLevel {
  if (sec.type === 'up') {
    const g = sec.grade
    if (g < 5) return 1   // roulant, économique
    if (g < 10) return 2  // soutenu, courable
    if (g < 15) return 3  // dur — seuil du power hiking
    return 4              // très raide
  }
  if (sec.type === 'down') {
    const a = Math.abs(sec.grade)
    if (a < 10) return 1  // favorable : zone du coût mini (~−10 %), récup / vitesse libre
    if (a < 15) return 2  // le freinage s'installe
    if (a < 22) return 3  // freinage marqué, charge excentrique forte
    return 4              // très raide
  }
  return 1 // plat
}

/** Point de profil {km, alt} — depuis les samples (d en km, alt en m), null filtrés. */
export interface ProfilePoint { km: number; alt: number }
export function profilePoints(proj: ProjectionResult): ProfilePoint[] {
  const pts = proj.samples
    .filter((s): s is { d: number; alt: number } => s.alt != null)
    .map((s) => ({ km: s.d, alt: s.alt }))
  return pts.length >= 2 ? pts : []
}

/** Temps écoulé (secondes) à un km donné, réparti au prorata des sectionTimes. */
export function elapsedSecAtKm(km: number, proj: ProjectionResult): number {
  let acc = 0
  for (let i = 0; i < proj.sections.length; i++) {
    const s = proj.sections[i]
    const t = proj.sectionTimes[i] ?? 0
    if (km >= s.endKm) { acc += t; continue }
    if (km <= s.startKm) break
    const span = s.endKm - s.startKm
    acc += span > 0 ? t * (km - s.startKm) / span : 0
    break
  }
  return acc
}

/** « 2h05 » depuis un nombre de minutes. */
export function fmtHM(totalMin: number): string {
  // Arrondir AVANT de séparer h/min — sinon 179,6 min → « 2h60 » au lieu de « 3h00 ».
  const t = Math.round(totalMin)
  const h = Math.floor(t / 60)
  const m = t % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

/** Heure d'horloge « 22h48 » depuis un départ 'HH:MM' + secondes écoulées, ou null. */
export function clockAt(startTime: string | null | undefined, elapsedSec: number): string | null {
  if (!startTime) return null
  const m = startTime.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const start = (parseInt(m[1], 10) % 24) * 3600 + parseInt(m[2], 10) * 60
  const t = Math.round(start + elapsedSec)
  return `${Math.floor(t / 3600) % 24}h${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`
}

/** Altitude interpolée à un km (sur les points de profil). */
export function altAtKm(km: number, pts: ProfilePoint[]): number {
  if (pts.length === 0) return 0
  if (km <= pts[0].km) return pts[0].alt
  for (let i = 1; i < pts.length; i++) {
    if (km <= pts[i].km) {
      const a = pts[i - 1], b = pts[i]
      const t = (km - a.km) / Math.max(1e-6, b.km - a.km)
      return a.alt + (b.alt - a.alt) * t
    }
  }
  return pts[pts.length - 1].alt
}

/** Section couvrant un km (pour la couleur du curseur). */
export function sectionAtKm(km: number, proj: ProjectionResult): Section | null {
  return proj.sections.find((s) => km >= s.startKm && km <= s.endKm) ?? proj.sections[proj.sections.length - 1] ?? null
}

// ── Carte : tracé GPS normalisé en viewBox 0..100 + point à un km ──────────────
export interface RoutePath { d: string; project: (km: number) => { x: number; y: number } | null }

/** Construit un path SVG (0..100) à partir des coords GPX + une fonction km→point écran. */
export function buildRoutePath(points: GpxPoint[], totalKm: number): RoutePath | null {
  if (!points || points.length < 2) return null
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const spanLat = Math.max(1e-6, maxLat - minLat), spanLon = Math.max(1e-6, maxLon - minLon)
  const pad = 8, scale = 100 - pad * 2
  // garde le ratio (latitude verticale) ; centre dans le carré
  const aspect = spanLon / spanLat
  const sx = aspect >= 1 ? scale : scale * aspect
  const sy = aspect >= 1 ? scale / aspect : scale
  const ox = (100 - sx) / 2, oy = (100 - sy) / 2
  const xy = (p: GpxPoint) => ({
    x: ox + ((p.lon - minLon) / spanLon) * sx,
    y: oy + ((maxLat - p.lat) / spanLat) * sy, // lat inversée (nord en haut)
  })
  // cumul des distances (km) pour mapper km→index
  const cum: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + hav(points[i - 1], points[i]))
  }
  const totalM = cum[cum.length - 1] || 1
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p).x.toFixed(2)},${xy(p).y.toFixed(2)}`).join(' ')
  const project = (km: number) => {
    const target = Math.max(0, Math.min(totalKm, km)) / totalKm * totalM
    let i = 1
    while (i < cum.length && cum[i] < target) i++
    if (i >= cum.length) return xy(points[points.length - 1])
    const a = points[i - 1], b = points[i]
    const t = (target - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
    const pa = xy(a), pb = xy(b)
    return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t }
  }
  return { d, project }
}

function hav(a: GpxPoint, b: GpxPoint): number {
  const R = 6371000, toR = Math.PI / 180
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR
  const la1 = a.lat * toR, la2 = b.lat * toR
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))) / 1000 // km
}
