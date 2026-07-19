// Baselines déterministes de comparaison (§15) — logique PURE, testable.
//
// Le banc ne se juge pas dans le vide : on compare Vorcelab à plusieurs références
// SIMPLES et documentées, sur EXACTEMENT les mêmes courses. Si Vorcelab ne bat pas une
// règle de Riegel à deux lignes, il n'apporte rien. Ces baselines ne sont PAS optimisées
// pour être artificiellement faibles : ce sont les formules standard de la littérature.
//
// Référence par athlète = ses AUTRES courses de l'échantillon (leave-one-out), déterministe
// et honnête (aucune fuite : on ne se sert jamais de la course cible pour se prédire).

import { computeErrorMetrics, type ErrorMetrics } from './engineBacktest'

/** Exposant de Riegel (population). T2 = T1·(D2/D1)^b. */
export const RIEGEL_EXPONENT = 1.06
/** Équivalence trail : 100 m de D+ ≈ 1 km de plat (heuristique « distance-effort »). */
export const DPLUS_TO_FLAT_KM = 1 / 100

export type BaselineName =
  | 'kilometre_effort'
  | 'riegel_distance_only'
  | 'riegel_with_dplus'
  | 'recent_average_pace'
  | 'best_similar_past_race'
  | 'previous_engine_version'

export const BASELINE_NAMES: readonly BaselineName[] = [
  'kilometre_effort',
  'riegel_distance_only',
  'riegel_with_dplus',
  'recent_average_pace',
  'best_similar_past_race',
  'previous_engine_version',
] as const

export interface BaselineRaceInput {
  athleteId: string
  raceId: string
  distanceKm: number
  dplusM: number
  /** Temps réels (les deux références). */
  actualMovingS: number
  actualElapsedS: number | null
  /** Temps projeté par le moteur SANS les features stream (records/durabilité) —
   *  sert de proxy « version de moteur précédente » (déjà porté par chaque ligne). */
  predictedNoBeS: number
}

/** Distance-effort (km) : plat + équivalent vertical. */
export function effortKm(distanceKm: number, dplusM: number): number {
  return distanceKm + Math.max(0, dplusM) * DPLUS_TO_FLAT_KM
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function actualFor(r: BaselineRaceInput, basis: 'moving' | 'elapsed'): number | null {
  return basis === 'elapsed' ? r.actualElapsedS : r.actualMovingS
}

/**
 * Prédit le temps de `target` selon une baseline, à partir des courses de RÉFÉRENCE de
 * l'athlète (ses autres courses). Retourne null si la référence est insuffisante.
 */
export function baselinePredict(
  name: BaselineName,
  target: BaselineRaceInput,
  refs: BaselineRaceInput[],
  basis: 'moving' | 'elapsed',
): number | null {
  if (name === 'previous_engine_version') {
    return target.predictedNoBeS > 0 ? target.predictedNoBeS : null
  }

  const usable = refs.filter((r) => r.raceId !== target.raceId && (actualFor(r, basis) ?? 0) > 0)
  if (usable.length === 0) return null

  const tEffort = effortKm(target.distanceKm, target.dplusM)

  switch (name) {
    case 'kilometre_effort': {
      // Allure médiane par km-effort sur les références → × km-effort cible.
      const paces = usable.map((r) => (actualFor(r, basis) as number) / effortKm(r.distanceKm, r.dplusM))
      const p = median(paces)
      return p != null ? p * tEffort : null
    }
    case 'recent_average_pace': {
      // Allure plate médiane (ignore le D+) × distance cible — baseline naïve « allure récente ».
      const paces = usable.map((r) => (actualFor(r, basis) as number) / r.distanceKm)
      const p = median(paces)
      return p != null ? p * target.distanceKm : null
    }
    case 'riegel_distance_only': {
      // Référence = course de distance la plus proche ; loi de Riegel sur la DISTANCE brute.
      const ref = usable.reduce((best, r) =>
        Math.abs(r.distanceKm - target.distanceKm) < Math.abs(best.distanceKm - target.distanceKm) ? r : best)
      const t1 = actualFor(ref, basis) as number
      if (ref.distanceKm <= 0 || target.distanceKm <= 0) return null
      return t1 * (target.distanceKm / ref.distanceKm) ** RIEGEL_EXPONENT
    }
    case 'riegel_with_dplus': {
      // Riegel sur la DISTANCE-EFFORT (plat + vertical) : référence de km-effort la plus proche.
      const ref = usable.reduce((best, r) =>
        Math.abs(effortKm(r.distanceKm, r.dplusM) - tEffort) < Math.abs(effortKm(best.distanceKm, best.dplusM) - tEffort) ? r : best)
      const t1 = actualFor(ref, basis) as number
      const e1 = effortKm(ref.distanceKm, ref.dplusM)
      if (e1 <= 0 || tEffort <= 0) return null
      return t1 * (tEffort / e1) ** RIEGEL_EXPONENT
    }
    case 'best_similar_past_race': {
      // Course la plus similaire en D+/km ; mise à l'échelle par le rapport de km-effort.
      const tDpKm = target.distanceKm > 0 ? target.dplusM / target.distanceKm : 0
      const ref = usable.reduce((best, r) => {
        const dp = r.distanceKm > 0 ? r.dplusM / r.distanceKm : 0
        const bdp = best.distanceKm > 0 ? best.dplusM / best.distanceKm : 0
        return Math.abs(dp - tDpKm) < Math.abs(bdp - tDpKm) ? r : best
      })
      const t1 = actualFor(ref, basis) as number
      const e1 = effortKm(ref.distanceKm, ref.dplusM)
      return e1 > 0 ? t1 * (tEffort / e1) : null
    }
  }
}

export interface BaselineMetrics extends ErrorMetrics {
  baseline: BaselineName
  /** Nombre de courses réellement prédites (une baseline peut ne pas couvrir tout). */
  covered: number
}

/**
 * Calcule les métriques d'erreur de CHAQUE baseline sur l'échantillon, avec référence
 * par athlète en leave-one-out. `basis` = moving ou elapsed.
 */
export function computeBaselineMetrics(
  rows: BaselineRaceInput[],
  basis: 'moving' | 'elapsed',
): BaselineMetrics[] {
  const byAthlete = new Map<string, BaselineRaceInput[]>()
  for (const r of rows) {
    const arr = byAthlete.get(r.athleteId) ?? []
    arr.push(r)
    byAthlete.set(r.athleteId, arr)
  }

  const out: BaselineMetrics[] = []
  for (const name of BASELINE_NAMES) {
    const scored: { predictedS: number; actualS: number }[] = []
    for (const target of rows) {
      const a = actualFor(target, basis)
      if (a == null || a <= 0) continue
      const refs = byAthlete.get(target.athleteId) ?? []
      const pred = baselinePredict(name, target, refs, basis)
      if (pred == null || !Number.isFinite(pred) || pred <= 0) continue
      scored.push({ predictedS: pred, actualS: a })
    }
    out.push({ baseline: name, covered: scored.length, ...computeErrorMetrics(scored) })
  }
  return out
}
