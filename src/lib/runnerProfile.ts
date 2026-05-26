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
  if (hrPctFcMax < 70) return 'low'
  if (hrPctFcMax < 85) return 'medium'
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
): { status: BucketStatus; statusReason: string } {
  if (vamMH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  // Walking detection: < 5.0 km/h on uphill = marche active, pas de course
  if (avgSpeedKmH != null && avgSpeedKmH < 5.0) {
    return {
      status: 'walk',
      statusReason: `Marche active (${avgSpeedKmH.toFixed(1)} km/h · VAM ${Math.round(vamMH)}m/h) — les benchmarks running ne s'appliquent pas ici. VAM utilisée pour la projection de course.`,
    }
  }
  if (vamMH >= 900) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return {
        status: 'strength',
        statusReason: `Point fort efficient : VAM ${Math.round(vamMH)}m/h à ${cardioCost === 'low' ? '<70' : '70–84'}% FCmax.`,
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
      return 'var(--vl-text-3)'
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
    case 'walk':     return 'Marche active'
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
}

// ─── Full profile type ────────────────────────────────────────────────────────

export interface RunnerProfileComputed {
  /** Computed at timestamp */
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
}
