// Construit le contexte de recommandation (RecommendContext) à partir des données
// réelles du coureur : phase (plan) + charge ACWR (trainingLoad) + fraîcheur.
// Pur, déterministe. Alimente sessionRecommender pour des badges contextualisés.

import { computeDailyPMC, computeACWR, type ActivityForLoad } from '../trainingLoad'
import type { Phase } from './workouts'
import type { RecommendContext } from '../sessionRecommender'

const HARD_HR_FRACTION = 0.85 // une sortie « dure » ≈ FC moyenne ≥ 85 % FCmax

/** Jours depuis la dernière sortie dure (FC moyenne élevée). null si inconnu. */
function daysSinceLastHard(activities: ActivityForLoad[], fcMax?: number | null): number | null {
  const max = fcMax && fcMax > 0 ? fcMax : 185
  const now = Date.now()
  let best: number | null = null
  for (const a of activities) {
    const hr = a.average_heartrate
    if (typeof hr === 'number' && hr / max >= HARD_HR_FRACTION) {
      const days = Math.floor((now - new Date(a.start_date).getTime()) / 86_400_000)
      if (days >= 0 && (best === null || days < best)) best = days
    }
  }
  return best
}

/** Contexte de reco depuis la phase + les activités réelles. */
export function buildRecommendContext(
  phase: Phase | undefined,
  activities: ActivityForLoad[],
  fcMax?: number | null,
): RecommendContext {
  const pmc = computeDailyPMC(activities, fcMax, { totalDays: 90, displayDays: 42 })
  const acwr = computeACWR(pmc).ratio
  return {
    phase: phase ?? null,
    acwr: acwr ?? null,
    daysSinceHard: daysSinceLastHard(activities, fcMax),
  }
}
