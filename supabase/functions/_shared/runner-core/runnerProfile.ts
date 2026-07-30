// runnerProfile.ts
// TypeScript types and pure helper functions for the runner profile system.
// All functions are exported so they can be unit-tested independently.

// ─── Grade bucket helpers ─────────────────────────────────────────────────────

export const GRADE_BUCKETS = [
  { key: 'steep_up',   label: 'Montée raide',   minGrade: 12,  maxGrade: Infinity, type: 'up'   },
  { key: 'mod_up',     label: 'Montée modérée', minGrade: 6,   maxGrade: 12,       type: 'up'   },
  { key: 'mild_up',    label: 'Montée légère',  minGrade: 2,   maxGrade: 6,        type: 'up'   },
  { key: 'flat',       label: 'Plat',           minGrade: -2,  maxGrade: 2,        type: 'flat' },
  { key: 'mild_down',  label: 'Descente légère',minGrade: -6,  maxGrade: -2,       type: 'down' },
  { key: 'mod_down',   label: 'Descente modérée',minGrade:-12, maxGrade: -6,       type: 'down' },
  { key: 'steep_down', label: 'Descente raide', minGrade:-Infinity, maxGrade: -12, type: 'down' },
] as const

export type BucketKey = typeof GRADE_BUCKETS[number]['key']
export type BucketType = 'up' | 'flat' | 'down'

export function getGradeBucket(gradePercent: number): BucketKey | null {
  // For ascents (positive grades): boundary belongs to the steeper bucket — use >= minGrade, < maxGrade
  // For descents (negative grades): boundary belongs to the steeper (more negative) bucket — use > minGrade, <= maxGrade
  for (const b of GRADE_BUCKETS) {
    if (b.type === 'down' || (b.minGrade < 0 && b.maxGrade <= 0)) {
      // Descent: > minGrade && <= maxGrade (boundary belongs to steeper/lower bucket)
      if (gradePercent > b.minGrade && gradePercent <= b.maxGrade) return b.key
    } else {
      // Ascent / flat: >= minGrade && < maxGrade (boundary belongs to steeper/higher bucket)
      if (gradePercent >= b.minGrade && gradePercent < b.maxGrade) return b.key
    }
  }
  return null
}

export function getBucketType(key: BucketKey): BucketType {
  const b = GRADE_BUCKETS.find((b) => b.key === key)
  return (b?.type ?? 'flat') as BucketType
}

// ─── Cardio cost ──────────────────────────────────────────────────────────────

export type CardioCost = 'low' | 'medium' | 'high' | 'unknown'

/**
 * Compute cardio cost from average HR as % FCmax.
 * @param hrPctFcMax  0–100 (percent of fcMax), or null if no HR data
 */
export function computeCardioCost(hrPctFcMax: number | null): CardioCost {
  if (hrPctFcMax == null) return 'unknown'
  // Zone 1-2 endurance fondamentale : < 75% FCmax
  // Zone 3 tempo/allure : 75–87% FCmax
  // Zone 4-5 seuil/VO2max : ≥ 88% FCmax  (ref: Joe Friel, ACSM)
  if (hrPctFcMax < 75) return 'low'
  if (hrPctFcMax < 88) return 'medium'
  return 'high'
}

// ─── Efficiency score ─────────────────────────────────────────────────────────

/**
 * Efficiency score:
 *  - climbs:          vamMH / (avgHrPctFcMax/100)
 *  - flat/descent:    avgSpeedKmH / (avgHrPctFcMax/100)
 * Returns null if no HR data.
 */
export function computeEfficiencyScore(
  bucketType: BucketType,
  vamMH: number | null,
  avgSpeedKmH: number | null,
  hrPctFcMax: number | null
): number | null {
  if (hrPctFcMax == null || hrPctFcMax <= 0) return null
  const hrFrac = hrPctFcMax / 100
  if (bucketType === 'up') {
    if (vamMH == null) return null
    return vamMH / hrFrac
  } else {
    if (avgSpeedKmH == null) return null
    return avgSpeedKmH / hrFrac
  }
}

// ─── Status logic ─────────────────────────────────────────────────────────────

export type BucketStatus = 'strength' | 'ok' | 'weak' | 'unknown' | 'walk'

export function computeClimbStatus(
  vamMH: number | null,
  cardioCost: CardioCost,
  minutesAnalyzed: number,
  avgSpeedKmH?: number | null,
  avgCadence?: number | null,
): { status: BucketStatus; statusReason: string } {
  if (vamMH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  // Walking detection: cadence < 130 pas/min couplé à vitesse < 6.5 km/h
  // (si pas de cadence dispo, fallback vitesse seule < 5.0 km/h)
  const isWalking = avgCadence != null
    ? (avgCadence < 130 && avgSpeedKmH != null && avgSpeedKmH < 6.5)
    : (avgSpeedKmH != null && avgSpeedKmH < 5.0)
  if (isWalking) {
    const cadNote = avgCadence != null ? ` · cadence ${Math.round(avgCadence)} pas/min` : ''
    return {
      status: 'walk',
      statusReason: `Technique marche trail — ${avgSpeedKmH?.toFixed(1)} km/h${cadNote} · VAM ${Math.round(vamMH)} m/h. Intégrée au profil et à la projection.`,
    }
  }
  if (vamMH >= 900) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return {
        status: 'strength',
        statusReason: `Point fort efficient : VAM ${Math.round(vamMH)}m/h à ${cardioCost === 'low' ? '<75' : '75–87'}% FCmax.`,
      }
    }
    return {
      status: 'strength',
      statusReason: `Performance élevée mais coûteuse : FC moyenne élevée pour cette VAM.`,
    }
  }
  if (vamMH >= 600) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'ok', statusReason: 'Bonne efficacité : VAM correcte avec FC contrôlée.' }
    }
    return { status: 'ok', statusReason: `Performance acceptable mais coûteuse : FC élevée pour cette VAM.` }
  }
  if (vamMH >= 500) {
    if (cardioCost === 'high') {
      return { status: 'ok', statusReason: `Performance acceptable mais coûteuse : FC élevée pour cette VAM.` }
    }
  }
  if (cardioCost === 'high') {
    return { status: 'weak', statusReason: 'À renforcer : coût cardio élevé pour une VAM faible.' }
  }
  return { status: 'weak', statusReason: 'À renforcer : VAM faible sur ce gradient.' }
}

export function computeDescentStatus(
  avgSpeedKmH: number | null,
  cardioCost: CardioCost,
  minutesAnalyzed: number
): { status: BucketStatus; statusReason: string } {
  if (avgSpeedKmH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  const cautionNote = cardioCost === 'high'
    ? ' FC en descente peut refléter la fatigue des montées précédentes.'
    : ''
  if (avgSpeedKmH >= 14) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'strength', statusReason: `Point fort : bonne vitesse en descente avec FC contrôlée.` }
    }
    return { status: 'strength', statusReason: `Bonne vitesse en descente.${cautionNote}` }
  }
  if (avgSpeedKmH >= 9) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'ok', statusReason: 'Descente correcte avec FC maîtrisée.' }
    }
    return { status: 'ok', statusReason: `Descente correcte.${cautionNote}` }
  }
  if (cardioCost === 'high') {
    return { status: 'weak', statusReason: `À renforcer : descente lente avec FC élevée.${cautionNote}` }
  }
  return { status: 'weak', statusReason: 'À renforcer : vitesse faible en descente.' }
}

export function computeFlatStatus(
  avgSpeedKmH: number | null,
  cardioCost: CardioCost,
  minutesAnalyzed: number
): { status: BucketStatus; statusReason: string } {
  if (avgSpeedKmH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  if (avgSpeedKmH >= 12) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'strength', statusReason: `Point fort : bonne vitesse sur plat avec FC contrôlée.` }
    }
    return { status: 'strength', statusReason: 'Performance élevée sur plat mais coûteuse cardio.' }
  }
  if (avgSpeedKmH >= 8) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'ok', statusReason: 'Bonne efficacité sur plat avec FC maîtrisée.' }
    }
    return { status: 'ok', statusReason: 'Performance acceptable sur plat mais coûteuse cardio.' }
  }
  if (cardioCost === 'high') {
    return { status: 'weak', statusReason: 'À renforcer : coût cardio élevé pour une vitesse faible sur plat.' }
  }
  return { status: 'weak', statusReason: 'À renforcer : vitesse faible sur plat.' }
}

// ─── Drift status ─────────────────────────────────────────────────────────────

export type HrDriftStatus = 'stable' | 'moderate' | 'marked' | 'unknown'

export function computeDriftStatus(driftPct: number | null): HrDriftStatus {
  if (driftPct == null) return 'unknown'
  if (driftPct <= 5) return 'stable'
  if (driftPct <= 10) return 'moderate'
  return 'marked'
}

// ─── Recovery status ──────────────────────────────────────────────────────────

export type PostClimbRecoveryStatus = 'good' | 'moderate' | 'weak' | 'unknown'

export function computePostClimbRecoveryStatus(
  hrDropBpmPerMin: number | null,
  hrDropPctFcMax: number | null
): PostClimbRecoveryStatus {
  if (hrDropBpmPerMin == null && hrDropPctFcMax == null) return 'unknown'
  const bpm = hrDropBpmPerMin ?? 0
  const pct = hrDropPctFcMax ?? 0
  if (bpm >= 20 || pct >= 10) return 'good'
  if ((bpm >= 10 && bpm < 20) || (pct >= 5 && pct < 10)) return 'moderate'
  return 'weak'
}

// ─── Confidence label helpers ─────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'

// ─── Condition penalties ──────────────────────────────────────────────────────

export interface ConditionPenalty {
  /** % impact on pace vs neutral conditions (positive = slower, negative = faster) */
  paceImpactPct: number
  sampleCount: number
  confidence: ConfidenceLevel
}

export interface ConditionPenalties {
  heat?: ConditionPenalty    // temp > 22°C (Ely et al. 2007)
  cold?: ConditionPenalty    // temp < 5°C
  night?: ConditionPenalty   // start 20h–5h local time
  wind?: ConditionPenalty    // wind × 0.6 > 15 km/h (isotrope trail — direction Phase 6+)
  // precip: future — requires rain data per run
}

export function computeConfidenceFromCount(n: number, thresholds = { high: 5, medium: 2 }): ConfidenceLevel {
  if (n >= thresholds.high) return 'high'
  if (n >= thresholds.medium) return 'medium'
  if (n >= 1) return 'low'
  return 'none'
}

// ─── UI formatting helpers ────────────────────────────────────────────────────

export function fmtVam(vam: number | null): string {
  if (vam == null) return '—'
  return `${Math.round(vam)} m/h`
}

export function fmtSpeed(speedKmH: number | null): string {
  if (speedKmH == null) return '—'
  return `${speedKmH.toFixed(1)} km/h`
}

/** Allure de course (min:sec/km) depuis une vitesse en km/h — en course on parle en allure. */
export function fmtPaceFromKmh(speedKmH: number | null): string {
  if (speedKmH == null || speedKmH <= 0) return '—'
  const secPerKm = Math.round(3600 / speedKmH)
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')}/km`
}

export function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m} min`
}

export function statusColor(status: BucketStatus | PostClimbRecoveryStatus | HrDriftStatus): string {
  switch (status) {
    case 'strength':
    case 'good':
    case 'stable':
      return 'var(--vl-growth)'
    case 'ok':
    case 'moderate':
      return 'var(--vl-amber)'
    case 'weak':
    case 'marked':
      return 'var(--vl-ember)'
    case 'walk':
      return '#3d8eb9'
    default:
      return 'var(--vl-text-3)'
  }
}

export function statusLabel(status: BucketStatus | PostClimbRecoveryStatus | HrDriftStatus): string {
  switch (status) {
    case 'strength': return 'Point fort'
    case 'good':     return 'Bonne récupération'
    case 'stable':   return 'Stable'
    case 'ok':       return 'Correct'
    case 'moderate': return 'Modéré'
    case 'weak':     return 'À renforcer'
    case 'marked':   return 'Marquée'
    case 'walk':     return 'Marche trail'
    default:         return 'Inconnu'
  }
}

export function confidenceLabel(conf: ConfidenceLevel): string {
  switch (conf) {
    case 'high':   return 'Fiable'
    case 'medium': return 'Partiel'
    case 'low':    return 'Faible'
    default:       return 'Aucune donnée'
  }
}

export function cardioCostColor(cost: CardioCost): string {
  switch (cost) {
    case 'low':    return 'var(--vl-growth)'
    case 'medium': return 'var(--vl-amber)'
    case 'high':   return 'var(--vl-ember)'
    default:       return 'var(--vl-text-3)'
  }
}

export function cardioCostLabel(cost: CardioCost): string {
  switch (cost) {
    case 'low':    return 'FC faible'
    case 'medium': return 'FC modérée'
    case 'high':   return 'FC élevée'
    default:       return '—'
  }
}

// ─── Recovery bucket types ────────────────────────────────────────────────────

export interface RecoveryBucketStats {
  hrDropBpmPerMin: number | null
  resumeSpeedKmH: number | null
  avgHrPctFcMaxAfter: number | null
  speedDropVsNormalPct: number | null
  status: 'good' | 'moderate' | 'weak' | 'unknown'
  confidence: ConfidenceLevel
  sampleCount: number
}

export interface PostClimbRecoveryByBucket {
  after_mild_up?: RecoveryBucketStats
  after_mod_up?: RecoveryBucketStats
  after_steep_up?: RecoveryBucketStats
}

export interface PostDownhillRecoveryByBucket {
  after_mild_down?: RecoveryBucketStats
  after_mod_down?: RecoveryBucketStats
  after_steep_down?: RecoveryBucketStats
}

// ─── Technical (winding) descent profile ─────────────────────────────────────
// Combien l'athlète ralentit dans les descentes SINUEUSES (lacets) vs droites, appris
// sur son historique. Cascade : par tranche de pente → global perso → générique (projo).

export interface TechDescentFactor {
  /** Multiplicateur de temps en descente sinueuse vs droite (≥ 1 = plus lent). */
  factor: number
  confidence: ConfidenceLevel
  sampleCount: number
}

export interface TechnicalDescentProfile {
  byBucket: Partial<Record<'mild_down' | 'mod_down' | 'steep_down', TechDescentFactor>>
  global?: TechDescentFactor
}

// ─── Downhill fatigue profile ─────────────────────────────────────────────────

export type DownhillFatigueStatus = 'low' | 'moderate' | 'high' | 'unknown'

export interface DownhillFatigueProfile {
  status: DownhillFatigueStatus
  confidence: ConfidenceLevel
  /** Speed drop % at resume vs normal bucket speed */
  steepDownLateRaceEfficiencyDrop: number | null
  /** Scaffold — requires per-phase late-race stream data */
  accumulatedDminusImpact: number | null
}

// ─── Régimes de locomotion (marche / course) ──────────────────────────────────
//
// POURQUOI CE DÉCOUPAGE EXISTE.
// Un seau de pente ne stockait qu'UNE allure moyenne. Or dans « montée raide », un
// coureur alterne deux locomotions qui n'ont rien à voir : il court une partie, il
// marche l'autre. La moyenne des deux ne décrit ni l'une ni l'autre — et surtout,
// elle n'est valable que pour la PROPORTION de marche observée à l'entraînement.
// Une course plus longue ou plus raide fait marcher davantage : le moteur appliquait
// alors une allure apprise sur un mélange qui n'est plus le bon.
//
// LA MARCHE EST UN RÉGIME, PAS UNE PENTE. On ne la déclenche pas à un seuil de pente :
// on MESURE, à chaque pente, quelle fraction du temps est marchée. Certains marchent
// à 8 %, d'autres courent à 20 % — c'est une propriété du coureur, pas du terrain.
//
// La classification se fait sur la CADENCE, seul signal qui distingue directement les
// deux locomotions (l'allure, elle, confond « marcher » et « courir épuisé »).
// Un échantillon sans cadence est NON CLASSÉ, jamais rangé par défaut : d'où
// `classifiedSeconds`, qui permet à un consommateur de refuser une fraction de marche
// estimée sur trop peu de signal.

export interface RegimeStats {
  /** Temps passé dans ce régime (s). */
  totalSeconds: number
  /** Allure moyenne du régime, en km/h (pondérée par le temps). */
  avgSpeedKmH: number | null
  /** VAM du régime en m/h — montées uniquement. C'est l'invariant de la marche en côte. */
  vamMH: number | null
  /** Cadence moyenne du régime, en unités API Strava (foulées/min ; ×2 = pas/min). */
  avgCadence: number | null
  /** Distance horizontale parcourue dans ce régime (m). */
  totalDistanceM: number
  /** Dénivelé positif accumulé dans ce régime (m). */
  altGainM: number
}

export interface BucketRegimes {
  /** Fraction du temps CLASSÉ passée en marche (0..1). Mesurée, jamais supposée. */
  walkFraction: number
  /** Secondes effectivement classées (cadence disponible) — dénominateur de walkFraction. */
  classifiedSeconds: number
  /** Statistiques du régime marche, ou null si jamais observé dans ce seau. */
  walk: RegimeStats | null
  /** Statistiques du régime course, ou null si jamais observé dans ce seau. */
  run: RegimeStats | null
}

/**
 * La fraction de marche est-elle exploitable pour ce seau ?
 *
 * Deux garde-fous, tous deux nécessaires :
 *  • assez de temps CLASSÉ (une minute de cadence ne décrit pas un comportement) ;
 *  • une couverture suffisante du seau — si 90 % des secondes n'ont pas de cadence,
 *    la fraction mesurée sur les 10 % restants n'est pas représentative du reste.
 *
 * En dessous, le moteur ne devine pas : il retombe sur le comportement d'avant ce
 * découpage (allure unique du seau), qui reste correct, simplement moins fin.
 */
export const REGIME_MIN_CLASSIFIED_SECONDS = 180
export const REGIME_MIN_CLASSIFIED_COVERAGE = 0.5

export function isRegimeSplitUsable(
  regimes: BucketRegimes | undefined,
  bucketTotalSeconds: number,
): boolean {
  if (!regimes) return false
  if (regimes.classifiedSeconds < REGIME_MIN_CLASSIFIED_SECONDS) return false
  if (bucketTotalSeconds <= 0) return false
  return regimes.classifiedSeconds / bucketTotalSeconds >= REGIME_MIN_CLASSIFIED_COVERAGE
}

/**
 * Applique un facteur d'intensité (recalage effort d'entraînement → effort de course)
 * aux DEUX régimes. Le facteur porte sur les vitesses — allure au sol et vitesse
 * ascensionnelle —, jamais sur la part de marche : courir plus fort ne change pas la
 * pente à laquelle on bascule, et le supposer reviendrait à inventer une donnée.
 */
export function scaleRegimes(regimes: BucketRegimes, factor: number): BucketRegimes {
  if (!Number.isFinite(factor) || factor === 1) return regimes
  const scale = (r: RegimeStats | null): RegimeStats | null =>
    r == null ? null : {
      ...r,
      avgSpeedKmH: r.avgSpeedKmH != null ? r.avgSpeedKmH * factor : null,
      vamMH: r.vamMH != null ? r.vamMH * factor : null,
    }
  return { ...regimes, walk: scale(regimes.walk), run: scale(regimes.run) }
}

// ─── Bucket stats type ────────────────────────────────────────────────────────

export interface BucketStats {
  /** Average speed km/h for this bucket */
  avgSpeedKmH: number | null
  /** VAM in m/h (climbs only) */
  vamMH: number | null
  /** Average HR as % of FCmax */
  avgHrPctFcMax: number | null
  /** Number of stream seconds analyzed */
  totalSeconds: number
  /** Cumulative horizontal distance in this bucket (m) */
  totalDistanceM: number
  /** Cumulative altitude gain in this bucket (m D+) — climbs only */
  altGainM: number
  /** Number of GPS samples accumulated */
  sampleCount: number
  /** Number of runs contributing */
  runCount: number
  /** Confidence level based on total time / run count */
  confidence: 'high' | 'medium' | 'low' | 'none'
  /** Inertia: strength / ok / weak / unknown */
  status: BucketStatus
  /** Efficiency: VAM or speed per unit cardiac cost */
  efficiencyScore: number | null
  /** Cardio cost classification */
  cardioCost: CardioCost
  /** Human-readable explanation of status */
  statusReason: string
  /** Post-climb relance behavior (optional, only if ≥2 events) */
  relanceStatus?: 'strong' | 'normal' | 'limited' | 'unknown'
  /** Découpage marche/course mesuré sur la cadence (optionnel — profils anciens sans). */
  regimes?: BucketRegimes
}

// ─── Full profile type ────────────────────────────────────────────────────────

export interface RunnerProfileComputed {
  /** Version du schéma du profil (cf. RUNNER_PROFILE_SCHEMA_VERSION). */
  schemaVersion?: string
  /** Instant du calcul (ISO) — provenance explicite exigée par le schéma courant. */
  computedAt?: string
  /** Horloge de référence (ISO) : « à la date de » — égale computedAt en production. */
  asOfAt?: string
  /** Fenêtre d'historique moteur en jours (ENGINE_HISTORY_DAYS = 183). */
  historyDays?: number
  /** Fenêtre du profil détaillé récent en jours (RUNNER_PROFILE_WINDOW_DAYS = 56). */
  detailedProfileDays?: number
  /** Computed at timestamp (legacy — conservé pour compat ; = computedAt). */
  _computedAt: string
  /** FCmax used for computation */
  fcMax: number
  /** Total stream seconds analyzed across all runs */
  totalStreamSeconds: number
  /** Coverage ratio (stream seconds vs total activity time) */
  streamCoverage: number
  /** Months included in computation e.g. ["2024-01","2024-02"] */
  analyzedMonths?: string[]
  /** Number of runs analyzed */
  analyzedRuns?: number
  /** Per-gradient-bucket stats */
  buckets: Partial<Record<BucketKey, BucketStats>>

  // ── Post-climb HR recovery ──────────────────────────────────────────────────
  postClimbHrRecoveryBpmPerMin: number | null
  postClimbHrDropPctFcMax: number | null
  postClimbResumeSpeedKmH: number | null
  postClimbRecoveryConfidence: ConfidenceLevel
  postClimbRecoveryStatus: PostClimbRecoveryStatus

  // ── Cardiac drift ───────────────────────────────────────────────────────────
  hrDriftPct: number | null
  hrDriftConfidence: ConfidenceLevel
  hrDriftStatus: HrDriftStatus

  // ── Per-bucket recovery (optional) ─────────────────────────────────────────
  postClimbRecoveryByBucket?: PostClimbRecoveryByBucket
  postDownhillRecoveryByBucket?: PostDownhillRecoveryByBucket

  // ── Downhill fatigue (optional) ─────────────────────────────────────────────
  downhillFatigue?: DownhillFatigueProfile

  // ── Condition penalties (optional) ───────────────────────────────────────────
  conditionPenalties?: ConditionPenalties

  // ── Technical (winding) descent slowdown, learned from history (optional) ────
  technicalDescent?: TechnicalDescentProfile

  // ── Records AUTO détectés depuis les streams (Étapes 1–3) ────────────────────
  /** Meilleurs temps par distance (chrono réel + valeur équivalent-plat). */
  bestEfforts?: import('./bestEfforts.ts').MergedBestEffort[]
  /** Vitesse critique estimée depuis la courbe mean-max (alimente la durabilité). */
  criticalSpeed?: import('./criticalSpeed.ts').CriticalSpeedResult | null
  /** Meilleure ascension détectée (VAM), record de trail. */
  bestClimb?: import('./bestEfforts.ts').ClimbEffort | null
  // ── Courbe de marche apprise, par pente (optionnel) ──────────────────────────
  /**
   * Part de temps marchée à CHAQUE pente, mesurée sur la cadence (intervalles de 5 %).
   *
   * C'est le complément indispensable de `buckets[k].regimes`. Le seau « montée raide »
   * couvre tout ce qui dépasse 12 %, sans limite haute : sa part de marche moyenne est
   * celle du terrain que l'athlète a rencontré à l'entraînement. Or on ne marche pas
   * pareil à 13 % et à 28 %. Cette courbe permet d'estimer la part de marche à la pente
   * RÉELLE de chaque section de la course visée, au lieu de rejouer le mélange
   * d'entraînement.
   */
  walkProfile?: import('./walkTransition.ts').WalkTransitionProfile

  /**
   * Descente APPRISE : vitesse par pente descendante, et tenue de cette vitesse selon le
   * D− déjà encaissé (à pente contrôlée).
   *
   * Volontairement PERSONNELLE et sans valeur par défaut. Sur l'ensemble des athlètes, la
   * perte après 1000 m de D− n'est que de 5 % — mais cette moyenne mélange celui qui
   * déroule et celui dont les quadriceps lâchent, deux vécus opposés. La tenue en descente
   * dépend de la qualité excentrique des quadriceps, qui ne se déduit d'aucune autre donnée :
   * il faut la mesurer sur chaque coureur, ou s'abstenir.
   */
  descentProfile?: {
    byGrade: import('./walkTransition.ts').DescentGradeBin[]
    fatigue: import('./walkTransition.ts').DescentFatigueBin[]
  }

  /** Courbe verticale : meilleure ascension par palier de D+ (100/300/500/1000 m). §11 */
  bestClimbByTier?: Record<number, import('./bestEfforts.ts').VerticalEffort>
}
