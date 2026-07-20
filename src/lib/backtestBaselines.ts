// Baselines déterministes de comparaison (§15) — logique PURE, testable.
//
// Le banc ne se juge pas dans le vide : on compare Vorcelab à plusieurs références
// SIMPLES et documentées, sur EXACTEMENT les mêmes courses. Si Vorcelab ne bat pas une
// règle de Riegel à deux lignes, il n'apporte rien. Ces baselines ne sont PAS optimisées
// pour être artificiellement faibles : ce sont les formules standard de la littérature.
//
// Référence par athlète = ses courses ANTÉRIEURES de l'échantillon (leave-one-out temporel),
// déterministe et honnête : on ne se sert jamais de la course cible pour se prédire, ni
// d'aucune course POSTÉRIEURE (§3 — pas de fuite temporelle : une prédiction faite « le jour
// de la course » ne peut connaître que le passé).

import { computeErrorMetrics, type ErrorMetrics } from './engineBacktest'

/** Exposant de Riegel (population). T2 = T1·(D2/D1)^b. */
export const RIEGEL_EXPONENT = 1.06
/** Équivalence trail : 100 m de D+ ≈ 1 km de plat (heuristique « distance-effort »). */
export const DPLUS_TO_FLAT_KM = 1 / 100

export type BaselineName =
  | 'kilometre_effort'
  | 'riegel_distance_only'
  | 'riegel_with_dplus'
  | 'flat_pace_median'
  | 'best_similar_past_race'
  | 'vorcelab_no_best_efforts'
  | 'previous_engine_version'

export const BASELINE_NAMES: readonly BaselineName[] = [
  'kilometre_effort',
  'riegel_distance_only',
  'riegel_with_dplus',
  'flat_pace_median',
  'best_similar_past_race',
  'vorcelab_no_best_efforts',
  'previous_engine_version',
] as const

export interface BaselineRaceInput {
  athleteId: string
  raceId: string
  /** Date de la course (ms epoch). §3 : sert à n'utiliser QUE des références antérieures. */
  raceDateMs: number
  distanceKm: number
  dplusM: number
  /** Temps réels (les deux références). */
  actualMovingS: number
  actualElapsedS: number | null
  /** Ablation A/B INTERNE (même version de moteur) : projection SANS records/durabilité auto.
   *  Ce n'est PAS une version antérieure du moteur — juste le moteur courant privé des
   *  features stream. Exposé comme baseline honnête `vorcelab_no_best_efforts`. */
  ablationNoBestEffortsS: number
  /** Projection d'une VERSION de moteur réellement antérieure et figée (§3/§9), ou null si
   *  aucune n'a été rejouée pour cette course. Aucune valeur inventée : null ⇒ non couvert. */
  previousVersionPredictedS: number | null
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
  // Baselines « auto-portées » (pas de leave-one-out) : lues directement sur la course cible.
  if (name === 'vorcelab_no_best_efforts') {
    return target.ablationNoBestEffortsS > 0 ? target.ablationNoBestEffortsS : null
  }
  if (name === 'previous_engine_version') {
    // VRAIE comparaison de versions : uniquement si une version antérieure a réellement été
    // rejouée pour cette course. Sinon null (non couvert) — jamais de proxy fabriqué.
    return target.previousVersionPredictedS != null && target.previousVersionPredictedS > 0
      ? target.previousVersionPredictedS
      : null
  }

  // §3 : références = courses de l'athlète STRICTEMENT antérieures à la cible (leave-one-out
  // temporel). Exclut la cible elle-même et toute course postérieure ou du même jour.
  const usable = refs.filter(
    (r) => r.raceId !== target.raceId && r.raceDateMs < target.raceDateMs && (actualFor(r, basis) ?? 0) > 0,
  )
  if (usable.length === 0) return null

  const tEffort = effortKm(target.distanceKm, target.dplusM)

  switch (name) {
    case 'kilometre_effort': {
      // Allure médiane par km-effort sur les références → × km-effort cible.
      const paces = usable.map((r) => (actualFor(r, basis) as number) / effortKm(r.distanceKm, r.dplusM))
      const p = median(paces)
      return p != null ? p * tEffort : null
    }
    case 'flat_pace_median': {
      // Allure plate médiane des courses ANTÉRIEURES (ignore le D+) × distance cible —
      // baseline naïve. (Renommée depuis `recent_average_pace` : c'est une médiane, pas une
      // « allure récente », et elle ne porte plus sur des courses futures.)
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
