// Moteur d'allures (Épopée A) — VDOT (Daniels-Gilbert), allures E/M/T/I/R,
// VMA/vVO2max, zones FC, extrapolation Riegel.
// Pures fonctions, aucune dépendance React. AUCUNE dépendance aux signaux appareil
// (HRV/readiness/Body Battery = fonctions dormantes, cf. docs/coach/backlog.md) :
// les entrées proviennent uniquement de courses/tests réels et de la saisie manuelle.

// ── Coefficients Daniels-Gilbert ───────────────────────────────────────────────
// VO2 (ml/kg/min) demandé à la vitesse v (m/min) : VO2 = A0 + A1·v + A2·v²
const A0 = -4.6
const A1 = 0.182258
const A2 = 0.000104
// Fraction de VO2max soutenable sur une durée t (min) :
// %max(t) = 0.8 + B1·e^(C1·t) + B2·e^(C2·t)
const B1 = 0.1894393
const C1 = -0.012778
const B2 = 0.2989558
const C2 = -0.1932605

// ── VO2 ↔ vitesse ───────────────────────────────────────────────────────────────

/** VO2 (ml/kg/min) demandé à une vitesse donnée (m/min). */
export function vo2AtVelocity(vMetersPerMin: number): number {
  return A0 + A1 * vMetersPerMin + A2 * vMetersPerMin * vMetersPerMin
}

/** Inverse : vitesse (m/min) pour un VO2 demandé (racine positive de la quadratique). */
export function velocityForVo2(vo2: number): number {
  const disc = A1 * A1 - 4 * A2 * (A0 - vo2)
  return (-A1 + Math.sqrt(disc)) / (2 * A2)
}

/** Fraction de VO2max soutenable pour une durée d'effort (minutes). */
export function pctVo2maxForDuration(timeMin: number): number {
  return 0.8 + B1 * Math.exp(C1 * timeMin) + B2 * Math.exp(C2 * timeMin)
}

// ── A1 — VDOT depuis une course ──────────────────────────────────────────────────

export interface RaceResult {
  distanceM: number
  timeSec: number
}

export type Confidence = 'good' | 'medium' | 'low'

/** VDOT (Daniels-Gilbert) à partir d'une distance (m) et d'un temps (s). */
export function computeVdot({ distanceM, timeSec }: RaceResult): number {
  const v = (distanceM * 60) / timeSec // m/min
  const vo2 = vo2AtVelocity(v)
  const pct = pctVo2maxForDuration(timeSec / 60)
  return vo2 / pct
}

/** Confiance du VDOT selon la distance (les efforts 3-30 km sont les plus fiables). */
export function vdotConfidence(distanceM: number): Confidence {
  if (distanceM < 1500 || distanceM > 42500) return 'low'
  if (distanceM < 3000 || distanceM > 30000) return 'medium'
  return 'good'
}

// ── A2 — Allures d'entraînement E/M/T/I/R ─────────────────────────────────────────

export type PaceZone = 'E' | 'M' | 'T' | 'I' | 'R'

/** Plages de %VO2max par zone (Daniels, cf. table Couche 1). R borné pour rester fini. */
export const ZONE_VO2_PCT: Record<PaceZone, { min: number; max: number }> = {
  E: { min: 0.59, max: 0.74 },
  M: { min: 0.75, max: 0.84 },
  T: { min: 0.83, max: 0.88 },
  I: { min: 0.95, max: 1.0 },
  R: { min: 1.05, max: 1.12 },
}

export interface PaceRange {
  fastSecPerKm: number
  slowSecPerKm: number
}

/** Allure (s/km) en courant à un pourcentage de VO2max donné, pour un VDOT donné. */
export function paceSecPerKmAtPct(vdot: number, pct: number): number {
  const v = velocityForVo2(vdot * pct) // m/min
  return 60000 / v // s/km
}

/** Les 5 plages d'allure d'entraînement (s/km) pour un VDOT donné. */
export function trainingPaces(vdot: number): Record<PaceZone, PaceRange> {
  const out = {} as Record<PaceZone, PaceRange>
  for (const zone of Object.keys(ZONE_VO2_PCT) as PaceZone[]) {
    const { min, max } = ZONE_VO2_PCT[zone]
    out[zone] = {
      // %VO2max plus haut ⇒ plus rapide ⇒ s/km plus petit
      fastSecPerKm: paceSecPerKmAtPct(vdot, max),
      slowSecPerKm: paceSecPerKmAtPct(vdot, min),
    }
  }
  return out
}

// ── A5 — Seuil unique + extrapolation Riegel ─────────────────────────────────────

/**
 * Allure seuil (s/km) — DÉFINITION UNIQUE retenue par Vorcelab :
 * seuil = T-pace Daniels (≈ allure soutenable 1 h) = seuil 2 / MLSS, à ~88 % VO2max.
 */
export function thresholdPaceSecPerKm(vdot: number): number {
  return paceSecPerKmAtPct(vdot, 0.88)
}

/** Extrapolation de temps entre distances (Riegel). T2 = T1·(D2/D1)^exposant. */
export function riegelPredict(
  knownDistanceM: number,
  knownTimeSec: number,
  targetDistanceM: number,
  exponent = 1.06,
): number {
  return knownTimeSec * Math.pow(targetDistanceM / knownDistanceM, exponent)
}

// ── A3 — VMA / vVO2max ────────────────────────────────────────────────────────────

/** VMA (km/h) depuis un test distance/durée (demi-Cooper, Cooper, palier final VAMEVAL…). */
export function vmaFromDistanceTest(distanceM: number, durationMin: number): number {
  return distanceM / 1000 / (durationMin / 60)
}

/** vVO2max ≈ VMA (km/h) dérivée du VDOT (vitesse à 100 % VO2max). */
export function vmaFromVdot(vdot: number): number {
  return velocityForVo2(vdot) * 0.06 // m/min → km/h
}

/** Cohérence VMA mesurée vs VMA prédite par le VDOT. Flag si écart > 10 %. */
export function vmaVdotCoherence(
  measuredVmaKmh: number,
  vdot: number,
): { deltaPct: number; coherent: boolean } {
  const predicted = vmaFromVdot(vdot)
  const deltaPct = ((measuredVmaKmh - predicted) / predicted) * 100
  return { deltaPct, coherent: Math.abs(deltaPct) <= 10 }
}

// ── A4 — Zones de fréquence cardiaque ─────────────────────────────────────────────

/** FC cible (bpm) par % de FC de réserve (Karvonen). */
export function hrFromReserve(fcMax: number, fcRest: number, pct: number): number {
  return Math.round((fcMax - fcRest) * pct + fcRest)
}

/** FC cible (bpm) par % de FCmax. */
export function hrFromMax(fcMax: number, pct: number): number {
  return Math.round(fcMax * pct)
}

/**
 * LTHR (Friel) — moyenne des FC sur la fenêtre fournie (typiquement les 20 dernières
 * minutes d'un contre-la-montre de 30 min). La sélection de fenêtre se fait en amont.
 */
export function lthrFromSamples(hrSamples: number[]): number | null {
  if (hrSamples.length === 0) return null
  const sum = hrSamples.reduce((acc, hr) => acc + hr, 0)
  return Math.round(sum / hrSamples.length)
}

// ── Helpers d'affichage ───────────────────────────────────────────────────────────

/** Formate une allure (s/km) en "m:ss". */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
