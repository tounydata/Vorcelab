// Durabilité / découplage (GAP:FC) — « 4e dimension » de l'endurance.
// Mesure la perte d'efficacité (vitesse AJUSTÉE À LA PENTE par battement) entre la
// 1re et la 2e moitié d'une sortie : découplage faible = bonne durabilité (tenir
// l'allure sur fatigue), décisif en trail/ultra. 100 % déterministe, pur.
//
// Réf : aerobic decoupling (TrainingPeaks) ; durabilité (Maunder/Jones 2022-2025).
// GAP : Minetti 2002 (cf. docs/coach/session-analysis.md T4/T7/T16). Sur terrain
// plat ou sans altitude, l'ajustement est neutre (comportement historique conservé).

import { minettiGradePenalty } from './gpxCore'

export interface DecouplingStreams {
  heartrate?: { data: number[] }
  /** Vitesse lissée (m/s). */
  velocity_smooth?: { data: number[] }
  /** Altitude (m) — active l'ajustement à la pente (GAP) si présente avec la distance. */
  altitude?: { data: number[] }
  /** Distance cumulée (m) — requise avec l'altitude pour le GAP. */
  distance?: { data: number[] }
}

export type DurabilityStatus = 'strong' | 'moderate' | 'deficit' | 'unknown'

export interface DecouplingResult {
  /** % de perte d'efficacité 2e moitié vs 1re (>0 = ça décroche). */
  decouplingPct: number
  status: DurabilityStatus
  /** Efficacité (m/s GAP par bpm) sur chaque moitié. */
  ef1: number
  ef2: number
  /** true = vitesse ajustée à la pente (course avec relief) ; sinon découplage brut. */
  gapAdjusted: boolean
}

/** <5 % bonne durabilité · 5-10 % modérée · >10 % déficit (a couru trop fort / fatigue). */
export function durabilityStatus(decouplingPct: number | null): DurabilityStatus {
  if (decouplingPct == null) return 'unknown'
  if (decouplingPct <= 5) return 'strong'
  if (decouplingPct <= 10) return 'moderate'
  return 'deficit'
}

interface Prepped {
  hr: number[]
  vel: number[]
  n: number
  /** Vitesse ajustée à la pente à l'index i (m/s). */
  gapVel: (i: number) => number
  gapAdjusted: boolean
}

function prep(streams: DecouplingStreams, minSamples: number): Prepped | null {
  const hr = streams?.heartrate?.data
  const vel = streams?.velocity_smooth?.data
  if (!hr || !vel) return null
  const n = Math.min(hr.length, vel.length)
  if (n < minSamples) return null

  const alt = streams?.altitude?.data
  const dist = streams?.distance?.data
  const hasGap = !!alt && !!dist && alt.length >= n && dist.length >= n
  let relief = false
  if (hasGap) {
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < n; i++) { const a = alt![i]; if (a < lo) lo = a; if (a > hi) hi = a }
    relief = hi - lo > 30
  }
  // GAP : vitesse_i × (1 + pénalité Minetti(pente_i)). Seuil de distance pour éviter le bruit.
  const gapVel = (i: number): number => {
    if (!hasGap || !relief || i === 0) return vel[i]
    const dd = dist![i] - dist![i - 1]
    if (dd < 0.5) return vel[i]
    return vel[i] * (1 + minettiGradePenalty((alt![i] - alt![i - 1]) / dd))
  }
  return { hr, vel, n, gapVel, gapAdjusted: relief }
}

/** Efficacité GAP:FC moyenne sur [from, to). */
function efRange(p: Prepped, from: number, to: number): number | null {
  let sh = 0, sv = 0, k = 0
  for (let i = from; i < to; i++) {
    const h = p.hr[i], v = p.gapVel(i)
    if (h > 0 && v >= 0) { sh += h; sv += v; k++ }
  }
  if (k === 0) return null
  const mh = sh / k
  return mh > 0 ? (sv / k) / mh : null
}

/**
 * Découplage allure:FC d'une sortie, AJUSTÉ À LA PENTE si l'altitude est fournie.
 * Découpe en 2 moitiés, calcule l'efficacité GAP:FC de chacune et la perte relative.
 * Renvoie null si données insuffisantes (besoin de FC + vitesse, ≥ ~20 min).
 */
export function computeDecoupling(
  streams: DecouplingStreams,
  opts: { minSamples?: number } = {},
): DecouplingResult | null {
  const p = prep(streams, opts.minSamples ?? 600) // ~10 min @1Hz par moitié → 20 min mini
  if (!p) return null
  const mid = Math.floor(p.n / 2)
  const ef1 = efRange(p, 0, mid), ef2 = efRange(p, mid, p.n)
  if (ef1 == null || ef2 == null || ef1 <= 0) return null
  const decouplingPct = +(((ef1 - ef2) / ef1) * 100).toFixed(1)
  return { decouplingPct, status: durabilityStatus(decouplingPct), ef1: +ef1.toFixed(5), ef2: +ef2.toFixed(5), gapAdjusted: p.gapAdjusted }
}

export interface DurabilityThirds {
  /** Chute d'efficacité GAP:FC entre 1er et dernier tiers (>0 = dégradation). */
  fadePct: number
  status: DurabilityStatus
  gapAdjusted: boolean
}

/**
 * Durabilité par tiers (knowledge T16) : compare l'efficacité GAP:FC du 1er au dernier
 * tiers de la sortie — plus fin que les moitiés pour lire la dérive de fin d'effort.
 */
export function computeDurabilityThirds(
  streams: DecouplingStreams,
  opts: { minSamples?: number } = {},
): DurabilityThirds | null {
  const p = prep(streams, opts.minSamples ?? 900) // ~5 min/tiers mini
  if (!p) return null
  const efA = efRange(p, 0, Math.floor(p.n / 3)), efC = efRange(p, Math.floor((2 * p.n) / 3), p.n)
  if (efA == null || efC == null || efA <= 0) return null
  const fadePct = +(((efA - efC) / efA) * 100).toFixed(1)
  return { fadePct, status: durabilityStatus(fadePct), gapAdjusted: p.gapAdjusted }
}
