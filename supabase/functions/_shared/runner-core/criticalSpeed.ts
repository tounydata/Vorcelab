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

// ── VMA & ancre de forme consolidée (calibrage du plan) ───────────────────────
// La VMA (vVO2max, plafond aérobie) est DISTINCTE de la CS (≈ seuil/allure 60 min).
// Repère robuste : CS ≈ 0,88 × VMA. Un test demi-Cooper (6 min à fond) donne la VMA.
// L'UI n'affiche que la VMA + les allures ; CS/D′/confiance restent une lecture interne.
// Réf : Cooper 1968 (demi-Cooper VMA) ; CS/VMA ratio (littérature field-test).

/** Rapport empirique CS/VMA (CS ≈ allure 60 min ≈ 88 % de la VMA). */
export const CS_TO_VMA = 0.88

function paceSecPerKm(speedMS: number): number {
  return speedMS > 0 ? Math.round(1000 / speedMS) : 0
}

/** VMA (m/s) depuis un test demi-Cooper : distance couverte en 6 min. */
export function vmaFromHalfCooperM(distanceM: number): number {
  return distanceM / 360
}

export type AnchorSource = 'test' | 'history' | 'vdot'
export type AnchorConfidence = 'high' | 'medium' | 'low'

export interface FitnessAnchor {
  vmaMetersPerSec: number
  vmaPaceSecPerKm: number
  csMetersPerSec: number
  csPaceSecPerKm: number
  /** Réserve anaérobie (m) si mesurée par le modèle CS/D′, sinon null. */
  dPrimeMeters: number | null
  source: AnchorSource
  confidence: AnchorConfidence
  /** Réconciliation avec le seuil VDOT : true/false si comparable, null sinon. */
  agreesWithVdot: boolean | null
  note: string
}

export interface AnchorInput {
  /** Test demi-Cooper : distance couverte en 6 min (m). Prioritaire s'il est fourni. */
  halfCooperDistanceM?: number | null
  /** Efforts maximaux issus de l'historique (courses étiquetées, séances à fond). */
  efforts?: Effort[]
  /** Seuil estimé par le moteur VDOT (s/km) — sert de cross-check (réconciliation). */
  vdotThresholdSecPerKm?: number | null
}

/** Tolérance de concordance CS ↔ seuil VDOT (±6 %). */
const AGREE_TOL = 0.06

function reconcile(csPaceSecPerKm: number, vdotThresholdSecPerKm?: number | null): boolean | null {
  if (!vdotThresholdSecPerKm || vdotThresholdSecPerKm <= 0) return null
  return Math.abs(csPaceSecPerKm - vdotThresholdSecPerKm) / vdotThresholdSecPerKm <= AGREE_TOL
}

/** Confiance de l'estimation historique selon le nombre d'efforts et l'étalement des durées. */
function historyConfidence(efforts: Effort[]): AnchorConfidence {
  const times = efforts.map((e) => e.timeSec).sort((a, b) => a - b)
  const shortest = times[0], longest = times[times.length - 1]
  // Étalement utile pour CS : efforts ~2-60 min, bien espacés (courses 5k/10k inclus).
  const goodSpread = longest / shortest >= 1.6 && shortest >= 120 && longest <= 3600
  if (efforts.length >= 3 && goodSpread) return 'high'
  if (efforts.length >= 2 && goodSpread) return 'medium'
  return 'low'
}

/**
 * Ancre de forme consolidée (VMA + CS + confiance) selon la MEILLEURE source dispo,
 * réconciliée avec le seuil VDOT. Priorité : test demi-Cooper > modèle CS/D′ sur
 * l'historique > fallback seuil VDOT seul. Pur et déterministe.
 */
export function buildFitnessAnchor(input: AnchorInput): FitnessAnchor | null {
  // 1) Test demi-Cooper : étalon le plus fiable (effort vraiment maximal, frais).
  if (input.halfCooperDistanceM && input.halfCooperDistanceM > 0) {
    const vma = vmaFromHalfCooperM(input.halfCooperDistanceM)
    const cs = vma * CS_TO_VMA
    const csPace = paceSecPerKm(cs)
    const agrees = reconcile(csPace, input.vdotThresholdSecPerKm)
    return {
      vmaMetersPerSec: +vma.toFixed(3), vmaPaceSecPerKm: paceSecPerKm(vma),
      csMetersPerSec: +cs.toFixed(3), csPaceSecPerKm: csPace, dPrimeMeters: null,
      source: 'test', confidence: agrees === false ? 'medium' : 'high',
      agreesWithVdot: agrees, note: 'Calibré par test demi-Cooper (VMA mesurée).',
    }
  }

  // 2) Historique : modèle CS/D′ sur ≥ 2 efforts maximaux qualité-filtrés.
  const efforts = (input.efforts ?? []).filter((e) => e.distM > 0 && e.timeSec > 0)
  const model = computeCriticalSpeed(efforts)
  if (model) {
    // VMA : depuis un effort court (~3-8 min) si dispo, sinon dérivée de CS.
    const short = efforts
      .filter((e) => e.timeSec >= 180 && e.timeSec <= 480)
      .sort((a, b) => Math.abs(a.timeSec - 360) - Math.abs(b.timeSec - 360))[0]
    const vma = short ? short.distM / short.timeSec : model.csMetersPerSec / CS_TO_VMA
    return {
      vmaMetersPerSec: +vma.toFixed(3), vmaPaceSecPerKm: paceSecPerKm(vma),
      csMetersPerSec: model.csMetersPerSec, csPaceSecPerKm: model.csPaceSecPerKm,
      dPrimeMeters: model.dPrimeMeters,
      source: 'history', confidence: historyConfidence(efforts),
      agreesWithVdot: reconcile(model.csPaceSecPerKm, input.vdotThresholdSecPerKm),
      note: 'Calibré sur tes efforts récents (courses étiquetées).',
    }
  }

  // 3) Fallback : seuil VDOT seul (CS ≈ seuil, VMA dérivée). Confiance faible.
  if (input.vdotThresholdSecPerKm && input.vdotThresholdSecPerKm > 0) {
    const cs = 1000 / input.vdotThresholdSecPerKm
    const vma = cs / CS_TO_VMA
    return {
      vmaMetersPerSec: +vma.toFixed(3), vmaPaceSecPerKm: paceSecPerKm(vma),
      csMetersPerSec: +cs.toFixed(3), csPaceSecPerKm: input.vdotThresholdSecPerKm, dPrimeMeters: null,
      source: 'vdot', confidence: 'low', agreesWithVdot: null,
      note: 'Estimé depuis ton historique (VDOT). Un test affinerait le calibrage.',
    }
  }

  return null
}
