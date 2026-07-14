import { pctVo2maxForDuration, velocityForVo2 } from './paceEngine'

/** Temps de course prédit (secondes) depuis VDOT et distance en mètres.
 *  Résolution numérique : cherche T tel que D / v(vdot · pct(T)) = T. */
export function predictRaceTimeS(vdot: number, distanceM: number): number {
  if (vdot <= 0 || distanceM <= 0) return 0
  let lo = 60
  let hi = 86400
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2
    const pct = pctVo2maxForDuration(mid / 60)
    const v = velocityForVo2(vdot * pct) // m/min
    const tActual = (distanceM / v) * 60  // s
    if (tActual < mid) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function fmtRaceTime(seconds: number): string {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m} min`
}

/** Nombre minimal de semaines de plan pour afficher une progression indicative.
 *  En deçà, les données sont trop faibles pour un scénario crédible → pas de gain. */
export const MIN_PLAN_WEEKS = 4

/** Gain de VDOT estimé après un plan complet (progression structurée, borne haute). */
export function estimateVdotGain(weeksToRace: number): number {
  return Math.min(weeksToRace * 0.4, 7)
}

/**
 * Plage de gain de VDOT **théorique** (basse → haute) pour une durée de plan.
 * On expose une plage plutôt qu'un chiffre faussement précis. En dessous de
 * MIN_PLAN_WEEKS (ou durée non valide), on renvoie {0,0} : on ne génère AUCUN gain
 * quand les données sont insuffisantes.
 */
export function estimateVdotGainRange(weeksToRace: number): { low: number; high: number } {
  if (!Number.isFinite(weeksToRace) || weeksToRace < MIN_PLAN_WEEKS) return { low: 0, high: 0 }
  return {
    low: Math.min(weeksToRace * 0.2, 3.5),
    high: Math.min(weeksToRace * 0.4, 7),
  }
}
