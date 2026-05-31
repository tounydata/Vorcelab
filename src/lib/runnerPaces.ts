// Dérive les allures réelles d'un coureur depuis ses données de profil.
// Priorité : records perso NUMÉRIQUES ({timeS, dist}) → sinon VO2max saisie (proxy).
// Défensif : ignore les PR non numériques (ex. format lisible "50:00") sans planter.
// Pur, réutilise paceEngine. Aucune dépendance React/réseau.

import {
  computeVdot,
  trainingPaces,
  thresholdPaceSecPerKm,
  vdotConfidence,
  type Confidence,
  type PaceZone,
  type PaceRange,
} from './paceEngine'

export interface PrEntry {
  timeS?: number | null
  dist?: number | null
}

export interface RunnerPaces {
  vdot: number
  source: 'race_pr' | 'vo2max'
  confidence: Confidence
  paces: Record<PaceZone, PaceRange>
  thresholdSecPerKm: number
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/**
 * Dérive les allures d'entraînement. Retourne `null` si aucune donnée exploitable
 * (le composant affiche alors un état vide, jamais d'erreur).
 */
export function deriveRunnerPaces(
  prs?: Record<string, unknown> | null,
  vo2max?: number | null,
): RunnerPaces | null {
  // 1) Meilleur VDOT depuis des PR numériques exploitables.
  let best: { vdot: number; dist: number } | null = null
  if (prs && typeof prs === 'object') {
    for (const raw of Object.values(prs)) {
      const v = raw as PrEntry | null
      if (v && typeof v.timeS === 'number' && typeof v.dist === 'number' && v.timeS > 0 && v.dist >= 1000) {
        const vdot = computeVdot({ distanceM: v.dist, timeSec: v.timeS })
        if (!best || vdot > best.vdot) best = { vdot, dist: v.dist }
      }
    }
  }
  if (best) {
    return {
      vdot: round1(best.vdot),
      source: 'race_pr',
      confidence: vdotConfidence(best.dist),
      paces: trainingPaces(best.vdot),
      thresholdSecPerKm: thresholdPaceSecPerKm(best.vdot),
    }
  }

  // 2) Fallback : VO2max saisie ≈ VDOT (proxy approximatif, confiance faible).
  if (typeof vo2max === 'number' && vo2max > 0) {
    return {
      vdot: round1(vo2max),
      source: 'vo2max',
      confidence: 'low',
      paces: trainingPaces(vo2max),
      thresholdSecPerKm: thresholdPaceSecPerKm(vo2max),
    }
  }

  return null
}
