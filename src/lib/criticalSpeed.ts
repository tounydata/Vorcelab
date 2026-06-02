// Critical Speed (CS) & D′ — modèle à 2 paramètres (Monod & Scherrer / Hill).
// d = CS·t + D′ : CS = vitesse soutenable (≈ seuil/MLSS), D′ = réserve finie de
// distance au-dessus de CS. Sert à : ancrer les zones (seuil ≈ CS), dimensionner
// les intervalles (bilan D′) et POSER UN GARDE-FOU d'allure course (prédit le
// « crash » quand l'allure visée est trop au-dessus de CS). 100 % déterministe.
//
// Réf : Critical Speed for runners (Jones/Vanhatalo) ; revue field-tests 2025.

export interface Effort {
  /** Distance de l'effort maximal (m). */
  distM: number
  /** Temps de l'effort (s). */
  timeSec: number
}

export interface CriticalSpeedResult {
  /** CS en m/s. */
  csMetersPerSec: number
  /** D′ : réserve anaérobie de distance (m). */
  dPrimeMeters: number
  /** Allure à CS (s/km) — ancre de la zone seuil. */
  csPaceSecPerKm: number
  /** Nombre d'efforts utilisés. */
  n: number
}

/**
 * Estime CS et D′ par régression linéaire de la distance sur le temps
 * (d = CS·t + D′) à partir d'au moins 2 efforts maximaux (idéal 3 : ~1-2 min,
 * ~3-6 min, ~10-12 min). Renvoie null si données insuffisantes/incohérentes.
 */
export function computeCriticalSpeed(efforts: Effort[]): CriticalSpeedResult | null {
  const pts = efforts.filter((e) => e.distM > 0 && e.timeSec > 0)
  if (pts.length < 2) return null

  const n = pts.length
  let st = 0, sd = 0, stt = 0, std = 0
  for (const p of pts) {
    st += p.timeSec; sd += p.distM
    stt += p.timeSec * p.timeSec; std += p.timeSec * p.distM
  }
  const denom = n * stt - st * st
  if (denom === 0) return null
  const cs = (n * std - st * sd) / denom        // pente = CS
  const dPrime = (sd - cs * st) / n             // ordonnée = D′
  if (cs <= 0) return null

  return {
    csMetersPerSec: +cs.toFixed(3),
    dPrimeMeters: Math.max(0, Math.round(dPrime)),
    csPaceSecPerKm: Math.round(1000 / cs),
    n,
  }
}

export interface PaceGuardResult {
  /** L'allure visée est-elle tenable sur la distance (selon CS/D′) ? */
  sustainable: boolean
  /** Distance « au-dessus de CS » qu'exige l'allure visée (m). */
  requiredDPrimeM: number
  /** D′ disponible (m). */
  dPrimeM: number
  /** Marge (m) : >0 = ok, <0 = crash prévu avant l'arrivée. */
  marginM: number
}

/**
 * Garde-fou d'allure course : pour une distance et une allure cible, vérifie que
 * la « dépense au-dessus de CS » ne dépasse pas D′ (sinon → crash). Au seuil ou
 * en dessous (allure ≥ allure CS) c'est toujours tenable.
 */
export function racePaceGuard(
  distM: number,
  goalPaceSecPerKm: number,
  cs: CriticalSpeedResult,
): PaceGuardResult {
  const v = 1000 / goalPaceSecPerKm // m/s visée
  if (v <= cs.csMetersPerSec) {
    return { sustainable: true, requiredDPrimeM: 0, dPrimeM: cs.dPrimeMeters, marginM: cs.dPrimeMeters }
  }
  // Modèle 2-param : d ≤ CS·t + D′ ⇒ distance au-dessus de CS = D·(v−CS)/v.
  const requiredDPrimeM = Math.round(distM * (v - cs.csMetersPerSec) / v)
  const marginM = cs.dPrimeMeters - requiredDPrimeM
  return { sustainable: marginM >= 0, requiredDPrimeM, dPrimeM: cs.dPrimeMeters, marginM }
}

/**
 * Nombre de répétitions « au-dessus de CS » réalisables avant d'épuiser D′ —
 * pour dimensionner une séance d'intervalles (récup supposée recharger D′).
 */
export function dPrimeReps(
  cs: CriticalSpeedResult,
  repDistM: number,
  repPaceSecPerKm: number,
): number {
  const v = 1000 / repPaceSecPerKm
  if (v <= cs.csMetersPerSec) return Infinity // sous CS : pas de tirage sur D′
  const perRep = repDistM * (v - cs.csMetersPerSec) / v
  if (perRep <= 0) return Infinity
  return Math.max(1, Math.floor(cs.dPrimeMeters / perRep))
}
