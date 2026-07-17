// Calibration PERSONNELLE de sensibilité à la pente (logique PURE, testable, sans IO).
//
// Extraite de `computeRaceProjection` (elle y était fondue). Idée : si Minetti
// neutralisait parfaitement le D+, l'allure « plat-équivalente » d'un coureur serait
// constante quelle que soit la pente. Quand elle DÉRIVE avec le D+/km sur SES courses,
// c'est son écart PERSONNEL à Minetti (il encaisse plus/moins la pente que la moyenne).
// On l'apprend par régression pondérée et on l'applique à la pente de LA course.
//
// Garde-fous conservés à l'identique :
//   • au moins 3 courses ;
//   • étalement minimum de D+/km (sinon la pente de la droite = bruit) ;
//   • extrapolation bornée (plafond au-dessus de la course réelle la plus lente) ;
//   • RALENTISSEMENT seulement (jamais d'accélération dans cette version) — assuré par
//     le plancher `referenceFlatEquivalentPaceS` côté appelant.
//
// N'accepte QUE des points issus de compétitions CONFIRMÉES (cf.
// `isEligiblePersonalCalibrationRace`). La sélection est faite par l'appelant.

export interface SteepnessCalibrationPoint {
  /** D+/km de la course (m par km). */
  dplusPerKm: number
  /** Allure plat-équivalente démontrée (s/km), D+ déjà neutralisé par Minetti. */
  flatEquivalentPaceS: number
  /** Poids (récence × similarité de distance). > 0. */
  weight: number
}

export interface SteepnessCalibrationResult {
  /** Vrai si la régression prédit un RALENTISSEMENT net à la pente cible. */
  active: boolean
  /** Allure plat-équivalente prédite à `targetDplusPerKm` (s/km), bornée. */
  predictedFlatEquivalentPaceS: number | null
  /** Moyenne pondérée de l'allure plat-équivalente sur les courses (s/km). */
  referenceFlatEquivalentPaceS: number | null
  /** Pente de la régression allure~D+/km (s/km par m/km). */
  slope: number | null
  /** Étalement de D+/km entre la course la plus plate et la plus raide. */
  spread: number
  /** Nombre de courses fournies. */
  sampleCount: number
  reason: 'active' | 'not_enough_races' | 'insufficient_spread' | 'invalid_regression'
}

export interface SteepnessCalibrationOptions {
  /** D+/km de la course à projeter (cible de la prédiction). */
  targetDplusPerKm: number
  /** Nombre minimum de courses pour activer (défaut 3). */
  minRaces?: number
  /** Étalement minimum de D+/km entre la plus plate et la plus raide (défaut 12). */
  minSpreadDplusPerKm?: number
  /** Plafond d'extrapolation : × la course réelle la plus lente (défaut 1.30). */
  maxExtrapolationRatio?: number
}

/**
 * Apprend la sensibilité PERSONNELLE à la pente par régression pondérée
 * `flatEquivalentPaceS ~ dplusPerKm` sur les courses confirmées, et prédit l'allure
 * plat-équivalente à la pente de la course. RALENTISSEMENT seul : la prédiction est
 * bornée au plancher `referenceFlatEquivalentPaceS` (l'appelant ne l'utilise que pour
 * ralentir, jamais accélérer) et au plafond d'extrapolation.
 */
export function computePersonalSteepnessCalibration(
  points: SteepnessCalibrationPoint[],
  options: SteepnessCalibrationOptions,
): SteepnessCalibrationResult {
  const minRaces = options.minRaces ?? 3
  const minSpread = options.minSpreadDplusPerKm ?? 12
  const maxExtrap = options.maxExtrapolationRatio ?? 1.3
  const n = points.length

  const den = points.reduce((s, p) => s + Math.max(0, p.weight), 0)
  const reference = den > 0 ? points.reduce((s, p) => s + p.flatEquivalentPaceS * Math.max(0, p.weight), 0) / den : null

  const dpkms = points.map((p) => p.dplusPerKm)
  const spread = n > 0 ? Math.max(...dpkms) - Math.min(...dpkms) : 0

  const inactive = (reason: SteepnessCalibrationResult['reason']): SteepnessCalibrationResult => ({
    active: false,
    predictedFlatEquivalentPaceS: reference,
    referenceFlatEquivalentPaceS: reference,
    slope: null,
    spread,
    sampleCount: n,
    reason,
  })

  if (n < minRaces || den <= 0 || reference == null) return inactive('not_enough_races')
  if (spread < minSpread) return inactive('insufficient_spread')

  const xbar = points.reduce((s, p) => s + Math.max(0, p.weight) * p.dplusPerKm, 0) / den
  const ybar = points.reduce((s, p) => s + Math.max(0, p.weight) * p.flatEquivalentPaceS, 0) / den
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    const w = Math.max(0, p.weight)
    sxx += w * (p.dplusPerKm - xbar) ** 2
    sxy += w * (p.dplusPerKm - xbar) * (p.flatEquivalentPaceS - ybar)
  }
  if (!(sxx > 0)) return inactive('invalid_regression')

  const slope = sxy / sxx
  const rawPredicted = ybar + slope * (options.targetDplusPerKm - xbar)
  const maxObs = Math.max(...points.map((p) => p.flatEquivalentPaceS))
  // Ralentissement seul (plancher = moyenne) + plafond d'extrapolation.
  const predicted = Math.min(maxObs * maxExtrap, Math.max(reference, rawPredicted))
  const active = predicted > reference + 0.5

  return {
    active,
    predictedFlatEquivalentPaceS: predicted,
    referenceFlatEquivalentPaceS: reference,
    slope,
    spread,
    sampleCount: n,
    reason: 'active',
  }
}
