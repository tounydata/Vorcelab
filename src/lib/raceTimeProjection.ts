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

/** Gain de VDOT estimé après un plan complet (progression structurée). */
export function estimateVdotGain(weeksToRace: number): number {
  return Math.min(weeksToRace * 0.4, 7)
}
