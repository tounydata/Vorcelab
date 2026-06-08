// src/lib/gpxCore.ts
// Port TypeScript 1-pour-1 des algorithmes GPX purs de gpx-core.js.
// Logique identique — seules des annotations de types ont été ajoutées.
// `isTrailRace()` du fichier legacy n'est PAS porté ici : il dépend de l'état
// legacy (VLState) et de globals window, et n'est pas consommé par l'app React.

export interface LatLon { lat: number; lon: number }

export interface KmSec {
  startKm: number
  km?: number
  endKm?: number
  dplus: number
  dminus?: number
  dist: number
}

export interface DetailedSection {
  type: 'up' | 'down' | 'flat'
  startKm: number
  endKm: number
  dplus: number
  dminus: number
  dist: number
  grade: number
}

export function hav(p1: LatLon, p2: LatLon): number {
  const R = 6371000, r = Math.PI / 180,
    dLat = (p2.lat - p1.lat) * r, dLon = (p2.lon - p1.lon) * r,
    a = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * r) * Math.cos(p2.lat * r) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

/** Cap (azimut, degrés 0–360) du segment p1→p2. */
export function bearing(p1: LatLon, p2: LatLon): number {
  const r = Math.PI / 180, d = 180 / Math.PI
  const dLon = (p2.lon - p1.lon) * r
  const y = Math.sin(dLon) * Math.cos(p2.lat * r)
  const x = Math.cos(p1.lat * r) * Math.sin(p2.lat * r) - Math.sin(p1.lat * r) * Math.cos(p2.lat * r) * Math.cos(dLon)
  return (Math.atan2(y, x) * d + 360) % 360
}

/**
 * Sinuosité d'une portion de tracé : somme des changements de cap (°) par km, sur le
 * tronçon [startKm, endKm]. Rééchantillonné à ~20 m pour ne pas compter le bruit GPS.
 * Une descente en lacets (épingles) ressort très haut → permet de la détecter.
 */
export function sectionTurnDegPerKm(
  points: LatLon[], cumDistM: number[], startKm: number, endKm: number,
): number {
  const startM = startKm * 1000, endM = endKm * 1000
  const STEP = 20 // m : pas de rééchantillonnage anti-bruit
  const sampled: LatLon[] = []
  let lastD = -Infinity
  for (let i = 0; i < points.length; i++) {
    const d = cumDistM[i]
    if (d < startM - 1 || d > endM + 1) continue
    if (sampled.length === 0 || d - lastD >= STEP) { sampled.push(points[i]); lastD = d }
  }
  if (sampled.length < 3) return 0
  let turn = 0
  for (let i = 1; i < sampled.length - 1; i++) {
    let diff = Math.abs(bearing(sampled[i], sampled[i + 1]) - bearing(sampled[i - 1], sampled[i]))
    if (diff > 180) diff = 360 - diff
    turn += diff
  }
  const km = Math.max(0.05, (endM - startM) / 1000)
  return turn / km
}

// Minetti (2002) gradient penalty
// Montée : polynôme exact Minetti 2002 J.Appl.Physiol 93(3), validé en labo.
// Descente : modèle empirique ajusté pour le trail ; coefficients prudents cohérents
//   avec la littérature (dont Vernillo et al. 2017, trail running terrain naturel).
//   Coefficients empiriques — pas une reproduction exacte des valeurs publiées.
//   -10% → économie ~25% | -20% → ~5% | -25% → ≈ plat | -30%+ → coût positif
export function minettiGradePenalty(grade: number): number {
  if (grade >= 0) {
    const i = Math.min(grade, 0.50)
    const c = 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5
    return c / 2.5 - 1
  } else {
    const g = Math.min(Math.abs(grade), 0.60)
    if (g <= 0.10) return -g * 2.5                          // économie linéaire jusqu'à -25%
    if (g <= 0.20) return -0.25 + (g - 0.10) * 2.0         // transition : savings -25% → -5%
    if (g <= 0.30) return -0.05 + (g - 0.20) * 1.5         // commence à coûter : -5% → +10%
    return 0.10 + (g - 0.30) * 3.0                          // freinage lourd : +10% → +40% à -40%
  }
}

export function buildDetailedSections(kmSecs: KmSec[]): DetailedSection[] {
  if (!kmSecs.length) return []

  // Helper: get endKm from either field name (analyzeGPX uses 'km', comparison uses 'endKm')
  const endOf = (s: KmSec) => s.km ?? s.endKm ?? s.startKm

  // Build cumulative net altitude profile: cumAlt[i] = net gain from start to end of segment i
  const cumAlt = [0]
  for (const s of kmSecs) cumAlt.push(cumAlt[cumAlt.length - 1] + s.dplus - (s.dminus || 0))

  // No smoothing — use raw profile so short climbs are preserved
  const MIN_CHANGE = 12 // metres — minimum amplitude to create a section

  // Pass 1: collect all local extrema on raw cumAlt
  const extrema = [{ idx: 0, alt: cumAlt[0] }]
  for (let i = 1; i < cumAlt.length - 1; i++) {
    const prev = cumAlt[i - 1], cur = cumAlt[i], next = cumAlt[i + 1]
    const isPeak = cur >= prev && cur >= next
    const isVall = cur <= prev && cur <= next
    if (isPeak || isVall) {
      const last = extrema[extrema.length - 1]
      if (Math.abs(cur - last.alt) >= MIN_CHANGE) {
        extrema.push({ idx: i, alt: cur })
      } else {
        // Extend in same direction (keep the more extreme value)
        const isGoingUp = cur > last.alt
        if (isGoingUp && cur > last.alt) extrema[extrema.length - 1] = { idx: i, alt: cur }
        else if (!isGoingUp && cur < last.alt) extrema[extrema.length - 1] = { idx: i, alt: cur }
      }
    }
  }
  extrema.push({ idx: cumAlt.length - 1, alt: cumAlt[cumAlt.length - 1] })

  // Pass 2: merge extrema that are too close in altitude (< MIN_CHANGE)
  const filtered = [extrema[0]]
  for (let i = 1; i < extrema.length; i++) {
    const last = filtered[filtered.length - 1]
    const diff = extrema[i].alt - last.alt
    if (Math.abs(diff) >= MIN_CHANGE) {
      filtered.push(extrema[i])
    } else {
      // Replace with whichever is more extreme relative to the point before last
      const prev2 = filtered.length >= 2 ? filtered[filtered.length - 2] : null
      if (!prev2) { filtered[filtered.length - 1] = extrema[i] }
      else if (extrema[i].alt > last.alt) filtered[filtered.length - 1] = { idx: extrema[i].idx, alt: Math.max(last.alt, extrema[i].alt) }
      else filtered[filtered.length - 1] = { idx: extrema[i].idx, alt: Math.min(last.alt, extrema[i].alt) }
    }
  }

  const out: DetailedSection[] = []
  for (let i = 0; i < filtered.length - 1; i++) {
    const from = filtered[i], to = filtered[i + 1]
    const fromIdx = Math.max(0, Math.min(from.idx, kmSecs.length - 1))
    const toIdx = Math.max(0, Math.min(to.idx, kmSecs.length))
    const segs = kmSecs.slice(fromIdx, toIdx)
    if (!segs.length) continue
    const dp = segs.reduce((a, s) => a + s.dplus, 0)
    const dm = segs.reduce((a, s) => a + (s.dminus || 0), 0)
    const dist = segs.reduce((a, s) => a + s.dist, 0)
    const netAlt = to.alt - from.alt
    const avgGrade = dist > 0 ? netAlt / dist * 100 : 0
    const type: DetailedSection['type'] = netAlt >= MIN_CHANGE ? 'up' : netAlt <= -MIN_CHANGE ? 'down' : 'flat'
    const startKm = segs[0].startKm
    const endKm = endOf(segs[segs.length - 1])
    out.push({ type, startKm, endKm, dplus: Math.round(dp), dminus: Math.round(dm), dist, grade: +avgGrade.toFixed(1) })
  }

  // Merge consecutive flat sections
  const merged: DetailedSection[] = []
  for (const s of out) {
    const last = merged[merged.length - 1]
    if (last && last.type === 'flat' && s.type === 'flat') {
      last.endKm = s.endKm; last.dplus += s.dplus; last.dminus += s.dminus
      last.dist += s.dist; last.grade = last.dist > 0 ? (last.dplus - last.dminus) / last.dist * 100 : 0
    } else merged.push({ ...s })
  }

  if (!merged.length) {
    const dp = kmSecs.reduce((a, s) => a + s.dplus, 0)
    const dm = kmSecs.reduce((a, s) => a + (s.dminus || 0), 0)
    const dist = kmSecs.reduce((a, s) => a + s.dist, 0)
    return [{ type: 'flat', startKm: kmSecs[0].startKm, endKm: endOf(kmSecs[kmSecs.length - 1]), dplus: Math.round(dp), dminus: Math.round(dm), dist, grade: 0 }]
  }
  return merged
}

export interface RpeScaleEntry { rpe: number; label: string; desc: string }

// RPE Scale
export const RPE_SCALE: RpeScaleEntry[] = [
  { rpe: 1, label: 'Très facile', desc: 'Marche, échauffement — tu pourrais chanter' },
  { rpe: 2, label: 'Très facile', desc: 'Footing très lent, conversation fluide sans effort' },
  { rpe: 3, label: 'Facile', desc: 'Footing Z2, tu parles en phrases complètes, pourrait durer des heures' },
  { rpe: 4, label: 'Facile', desc: 'Rythme confortable, phrases courtes aisées, respiration légèrement audible' },
  { rpe: 5, label: 'Modéré', desc: 'Allure marathon, phrases courtes, respiration audible mais contrôlée' },
  { rpe: 6, label: 'Modéré-difficile', desc: 'Allure semi, 2-3 mots entre respirations, rythme soutenu' },
  { rpe: 7, label: 'Difficile', desc: 'Allure 10k/montée trail soutenue, 1-2 mots max, souffle court' },
  { rpe: 8, label: 'Très difficile', desc: 'Limite à tenir, quasi impossible de parler, fort essoufflement' },
  { rpe: 9, label: 'Extrême', desc: 'Sprint long, impossible de parler, insoutenable >2min' },
  { rpe: 10, label: 'Maximum', desc: 'Effort total, insoutenable >30 secondes' },
]
