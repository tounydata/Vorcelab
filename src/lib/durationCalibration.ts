// Calibration PERSONNELLE de décroissance d'allure avec la DURÉE (logique PURE,
// testable, sans IO).
//
// Pourquoi : l'ancrage sur les courses réelles ramenait la projection à la MOYENNE
// pondérée de l'allure plat-équivalente des compétitions — un scalaire unique. Mais
// cette moyenne mélange des efforts de durées très différentes (une course d'1 h et
// une de 3 h), puis l'applique telle quelle à une course encore plus longue. Or
// l'allure soutenable se dégrade avec la durée : moyenner cet axe, c'est coller
// l'allure d'un format court sur un format long → projection systématiquement
// optimiste sur les courses plus longues que le vécu de l'athlète.
//
// Idée : on apprend la loi (type Riegel) `allure_plat = a · T^k` sur SES courses par
// régression log-log pondérée, et on prédit l'allure à la durée de LA course. `k` est
// l'exposant d'endurance PERSONNEL (k = 0 → allure constante ; k = 0,06 ≈ Riegel
// classique ; k élevé → décroche vite sur la durée).
//
// Garde-fous (mêmes principes que `steepnessCalibration`) :
//   • au moins 3 courses ;
//   • étalement de DURÉE suffisant (sinon la pente de la droite = bruit) ;
//   • exposant borné (une régression sur 3 points extrapole vite n'importe quoi) ;
//   • extrapolation bornée (plafond au-dessus de la course réelle la plus lente) ;
//   • RALENTISSEMENT seulement — plancher = moyenne pondérée. L'accélération reste
//     gérée par le FIC (plafonné), non doublonnée ici.
//
// N'accepte QUE des points issus de compétitions CONFIRMÉES (cf.
// `isEligiblePersonalCalibrationRace`). La sélection est faite par l'appelant.

export interface DurationCalibrationPoint {
  /** Durée réelle de la course (s). */
  durationS: number
  /** Allure plat-équivalente démontrée (s/km), D+ déjà neutralisé par Minetti. */
  flatEquivalentPaceS: number
  /** Poids (récence × similarité de distance). > 0. */
  weight: number
  /** D+/km de la course — sert UNIQUEMENT au test d'identifiabilité (colinéarité
   *  durée ↔ pente). Absent → le test est ignoré (compatibilité ascendante). */
  dplusPerKm?: number
}

export interface DurationCalibrationResult {
  /** Vrai si la régression prédit un RALENTISSEMENT net à la durée cible. */
  active: boolean
  /** Allure plat-équivalente prédite à `targetDurationS` (s/km), bornée. */
  predictedFlatEquivalentPaceS: number | null
  /** Moyenne pondérée de l'allure plat-équivalente sur les courses (s/km). */
  referenceFlatEquivalentPaceS: number | null
  /** Exposant d'endurance personnel k de `allure = a · T^k` (après bornage). */
  exponent: number | null
  /** Exposant BRUT issu de la régression, avant bornage (diagnostic). */
  rawExponent: number | null
  /** Étalement de durée (la plus longue / la plus courte). */
  spreadRatio: number
  /** Rapport durée cible / durée de la plus longue course (> 1 = extrapolation). */
  extrapolationRatio: number
  /** Corrélation |r| entre ln(durée) et D+/km sur les courses (null si D+/km absent).
   *  Élevée = les deux axes varient ensemble → la régression ne peut pas les séparer. */
  steepnessCollinearity: number | null
  /** Nombre de courses fournies. */
  sampleCount: number
  reason:
    | 'active'
    | 'not_enough_races'
    | 'insufficient_spread'
    | 'invalid_regression'
    | 'collinear_with_steepness'
}

export interface DurationCalibrationOptions {
  /** Durée visée pour la course à projeter (s). */
  targetDurationS: number
  /** Nombre minimum de courses pour activer (défaut 4).
   *  À 3 points pour 2 paramètres il ne reste qu'un degré de liberté : la droite passe
   *  quasiment par les données quoi qu'il arrive, et un seul effort long atypique
   *  (course de nuit, mauvais jour) dicte toute la pente. */
  minRaces?: number
  /** Étalement minimal de durée, la plus longue / la plus courte (défaut 1.5). */
  minSpreadRatio?: number
  /** Colinéarité maximale tolérée entre ln(durée) et D+/km (défaut 0.5).
   *  Au-delà, durée et pente varient ensemble sur les courses de l'athlète : la
   *  régression attribue à la DURÉE ce qui vient peut-être de la PENTE. On préfère
   *  s'abstenir plutôt que de sur-corriger sur une attribution non identifiable. */
  maxCollinearity?: number
  /** Extrapolation maximale de DURÉE : la durée cible est plafonnée à ce multiple de
   *  la plus longue course (défaut 1.25). Empêche l'exposant de composer très au-delà
   *  du vécu — c'est là que l'erreur d'une régression courte explose. */
  maxDurationExtrapolation?: number
  /** Exposant d'endurance maximal retenu (défaut 0.15). Borne haute PRUDENTE :
   *  une régression sur 3 points peut sortir un k très raide (0,20+) qui extrapolerait
   *  de façon absurde. 0,15 reste au-dessus de Riegel (0,06) sans partir en vrille. */
  maxExponent?: number
  /** Plafond d'extrapolation : × la course réelle la plus lente (défaut 1.30). */
  maxExtrapolationRatio?: number
}

/**
 * Apprend la décroissance PERSONNELLE d'allure avec la durée par régression log-log
 * pondérée `ln(allure) ~ ln(durée)` sur les courses confirmées, et prédit l'allure
 * plat-équivalente à la durée de la course. RALENTISSEMENT seul : la prédiction est
 * bornée au plancher `referenceFlatEquivalentPaceS` et au plafond d'extrapolation.
 */
export function computePersonalDurationCalibration(
  points: DurationCalibrationPoint[],
  options: DurationCalibrationOptions,
): DurationCalibrationResult {
  const minRaces = options.minRaces ?? 4
  const minSpreadRatio = options.minSpreadRatio ?? 1.5
  const maxExponent = options.maxExponent ?? 0.15
  const maxExtrap = options.maxExtrapolationRatio ?? 1.3
  const maxCollinearity = options.maxCollinearity ?? 0.5
  const maxDurationExtrap = options.maxDurationExtrapolation ?? 1.25
  const n = points.length

  // On n'accepte que des points exploitables (durée et allure strictement positives :
  // le log-log l'exige) et de poids > 0.
  const usable = points.filter(
    (p) =>
      Number.isFinite(p.durationS) && p.durationS > 0 &&
      Number.isFinite(p.flatEquivalentPaceS) && p.flatEquivalentPaceS > 0 &&
      Number.isFinite(p.weight) && p.weight > 0,
  )

  const den = usable.reduce((s, p) => s + p.weight, 0)
  const reference = den > 0
    ? usable.reduce((s, p) => s + p.flatEquivalentPaceS * p.weight, 0) / den
    : null

  const durations = usable.map((p) => p.durationS)
  const minDur = durations.length ? Math.min(...durations) : 0
  const maxDur = durations.length ? Math.max(...durations) : 0
  const spreadRatio = minDur > 0 ? maxDur / minDur : 0
  const extrapolationRatio = maxDur > 0 ? options.targetDurationS / maxDur : 0

  // Colinéarité pondérée |r| entre ln(durée) et D+/km : test d'IDENTIFIABILITÉ.
  // Si les deux varient ensemble sur les courses de l'athlète, aucune régression à une
  // variable ne peut dire lequel des deux ralentit — et attribuer par défaut à la durée
  // sur-corrige (la pente est déjà traitée par `steepnessCalibration`).
  const withSteepness = usable.filter((p) => typeof p.dplusPerKm === 'number' && Number.isFinite(p.dplusPerKm))
  let steepnessCollinearity: number | null = null
  if (withSteepness.length === usable.length && usable.length >= 2) {
    const w = withSteepness.reduce((s, p) => s + p.weight, 0)
    const mx = withSteepness.reduce((s, p) => s + p.weight * Math.log(p.durationS), 0) / w
    const my = withSteepness.reduce((s, p) => s + p.weight * (p.dplusPerKm as number), 0) / w
    let cxy = 0, cxx = 0, cyy = 0
    for (const p of withSteepness) {
      const dx = Math.log(p.durationS) - mx
      const dy = (p.dplusPerKm as number) - my
      cxy += p.weight * dx * dy; cxx += p.weight * dx * dx; cyy += p.weight * dy * dy
    }
    steepnessCollinearity = cxx > 0 && cyy > 0 ? Math.abs(cxy / Math.sqrt(cxx * cyy)) : null
  }

  const inactive = (reason: DurationCalibrationResult['reason']): DurationCalibrationResult => ({
    active: false,
    predictedFlatEquivalentPaceS: reference,
    referenceFlatEquivalentPaceS: reference,
    exponent: null,
    rawExponent: null,
    spreadRatio,
    extrapolationRatio,
    steepnessCollinearity,
    sampleCount: n,
    reason,
  })

  if (usable.length < minRaces || den <= 0 || reference == null) return inactive('not_enough_races')
  if (spreadRatio < minSpreadRatio) return inactive('insufficient_spread')
  if (!(options.targetDurationS > 0)) return inactive('invalid_regression')
  if (steepnessCollinearity != null && steepnessCollinearity > maxCollinearity)
    return inactive('collinear_with_steepness')

  // Régression pondérée en log-log : ln(allure) = ln(a) + k · ln(T).
  const xbar = usable.reduce((s, p) => s + p.weight * Math.log(p.durationS), 0) / den
  const ybar = usable.reduce((s, p) => s + p.weight * Math.log(p.flatEquivalentPaceS), 0) / den
  let sxx = 0
  let sxy = 0
  for (const p of usable) {
    const dx = Math.log(p.durationS) - xbar
    sxx += p.weight * dx * dx
    sxy += p.weight * dx * (Math.log(p.flatEquivalentPaceS) - ybar)
  }
  if (!(sxx > 0)) return inactive('invalid_regression')

  const rawExponent = sxy / sxx
  // Bornage : k < 0 signifierait « je vais plus vite quand c'est plus long » — on ne
  // laisse JAMAIS la calibration accélérer (cf. en-tête). k trop grand = sur-ajustement
  // sur 3 points → plafonné.
  const exponent = Math.min(maxExponent, Math.max(0, rawExponent))
  // Extrapolation de DURÉE bornée : au-delà de `maxDurationExtrapolation × ta plus
  // longue course`, on gèle la durée servant à la prédiction. La régression continue
  // de décrire ton domaine vécu, elle n'invente pas ce qui se passe très au-delà.
  const cappedTargetS = Math.min(options.targetDurationS, maxDur * maxDurationExtrap)
  // La droite passe par le centroïde pondéré (préserve la moyenne) : on ne réestime
  // pas l'ordonnée à l'origine après bornage, on pivote autour du centroïde.
  const rawPredicted = Math.exp(ybar + exponent * (Math.log(cappedTargetS) - xbar))

  const maxObs = Math.max(...usable.map((p) => p.flatEquivalentPaceS))
  // Ralentissement seul (plancher = moyenne) + plafond d'extrapolation.
  const predicted = Math.min(maxObs * maxExtrap, Math.max(reference, rawPredicted))
  const active = predicted > reference + 0.5

  return {
    active,
    predictedFlatEquivalentPaceS: predicted,
    referenceFlatEquivalentPaceS: reference,
    exponent,
    rawExponent,
    spreadRatio,
    extrapolationRatio,
    steepnessCollinearity,
    sampleCount: n,
    reason: 'active',
  }
}
