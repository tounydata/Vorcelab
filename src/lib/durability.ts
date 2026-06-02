// Durabilité / découplage (Pa:HR) — « 4e dimension » de l'endurance.
// Mesure la perte d'efficacité (vitesse par battement) entre la 1re et la 2e
// moitié d'une sortie longue : un découplage faible = bonne durabilité (tenir
// l'allure sur fatigue), décisif en trail/ultra. 100 % déterministe, pur.
//
// Réf : aerobic decoupling (TrainingPeaks) ; durabilité (Maunder/Jones 2022-2025).

export interface DecouplingStreams {
  heartrate?: { data: number[] }
  /** Vitesse lissée (m/s). */
  velocity_smooth?: { data: number[] }
}

export type DurabilityStatus = 'strong' | 'moderate' | 'deficit' | 'unknown'

export interface DecouplingResult {
  /** % de perte d'efficacité 2e moitié vs 1re (>0 = ça décroche). */
  decouplingPct: number
  status: DurabilityStatus
  /** Efficacité (m/s par bpm) sur chaque moitié. */
  ef1: number
  ef2: number
}

/** <5 % bonne durabilité · 5-10 % modérée · >10 % déficit (a couru trop fort / fatigue). */
export function durabilityStatus(decouplingPct: number | null): DurabilityStatus {
  if (decouplingPct == null) return 'unknown'
  if (decouplingPct <= 5) return 'strong'
  if (decouplingPct <= 10) return 'moderate'
  return 'deficit'
}

/**
 * Découplage allure:FC d'une sortie. Découpe les streams en 2 moitiés, calcule
 * l'efficacité (vitesse moyenne / FC moyenne) de chacune et la perte relative.
 * Renvoie null si données insuffisantes (besoin de FC + vitesse, ≥ ~20 min).
 */
export function computeDecoupling(
  streams: DecouplingStreams,
  opts: { minSamples?: number } = {},
): DecouplingResult | null {
  const hr = streams?.heartrate?.data
  const vel = streams?.velocity_smooth?.data
  if (!hr || !vel) return null
  const n = Math.min(hr.length, vel.length)
  const minSamples = opts.minSamples ?? 600 // ~10 min @1Hz par moitié → 20 min mini
  if (n < minSamples) return null

  const mid = Math.floor(n / 2)
  const ef = (from: number, to: number): number | null => {
    let sh = 0, sv = 0, k = 0
    for (let i = from; i < to; i++) {
      const h = hr[i], v = vel[i]
      if (h > 0 && v >= 0) { sh += h; sv += v; k++ }
    }
    if (k === 0) return null
    const mh = sh / k
    return mh > 0 ? (sv / k) / mh : null
  }

  const ef1 = ef(0, mid)
  const ef2 = ef(mid, n)
  if (ef1 == null || ef2 == null || ef1 <= 0) return null

  const decouplingPct = +(((ef1 - ef2) / ef1) * 100).toFixed(1)
  return { decouplingPct, status: durabilityStatus(decouplingPct), ef1: +ef1.toFixed(5), ef2: +ef2.toFixed(5) }
}
