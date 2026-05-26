// Profil Coureur Vorcelab — computed from aggregate Strava activity data.
//
// VAM per gradient bucket (3-6%, 6-10%, etc.) requires Strava GPS streams,
// which are not stored in strava_activities. The estimates here use global
// D+/time which overestimates VAM (flat portions dilute climbing time).
// gradeBucketMultipliers for scoreRaceSection will remain null until
// stream data is available (Phase 5+).

export const GRADIENT_BUCKETS = [
  { key: 'climb_easy',       label: 'Montée roulante',    min: 3,    max: 6,    type: 'up'   },
  { key: 'climb_moderate',   label: 'Montée modérée',     min: 6,    max: 10,   type: 'up'   },
  { key: 'climb_steep',      label: 'Montée raide',       min: 10,   max: 15,   type: 'up'   },
  { key: 'climb_wall',       label: 'Très raide / marche',min: 15,   max: 999,  type: 'up'   },
  { key: 'flat',             label: 'Plat',               min: -3,   max: 3,    type: 'flat' },
  { key: 'descent_easy',     label: 'Descente roulante',  min: -8,   max: -3,   type: 'down' },
  { key: 'descent_moderate', label: 'Descente technique', min: -15,  max: -8,   type: 'down' },
  { key: 'descent_steep',    label: 'Descente très raide',min: -999, max: -15,  type: 'down' },
] as const

export type GradientBucketKey = typeof GRADIENT_BUCKETS[number]['key']

export function getGradeBucket(grade: number): GradientBucketKey {
  for (const b of GRADIENT_BUCKETS) {
    if (grade >= b.min && grade < b.max) return b.key
  }
  return grade >= 0 ? 'climb_wall' : 'descent_steep'
}

export interface ActivityAggregate {
  id: string
  distM: number
  dplus: number
  movingTimeSec: number
  avgHrBpm: number | null
  avgSpeedMs: number | null
  type: string
  sportType: string | null
  startDate: string
}

// Status for a metric: strength / ok / weak / unknown
export type MetricStatus = 'strength' | 'ok' | 'weak' | 'unknown'

function metricStatus(value: number | null, thresholds: { ok: number; strength: number }): MetricStatus {
  if (value === null) return 'unknown'
  if (value >= thresholds.strength) return 'strength'
  if (value >= thresholds.ok) return 'ok'
  return 'weak'
}

export interface RunnerProfile {
  // Volume
  totalActivities: number
  trailActivities: number
  totalDistKm: number
  totalDplus: number
  totalTimeH: number
  periodMonths: number

  // Terrain
  avgDplusPerKm: number
  terrainLabel: string  // 'montagne' | 'vallonné' | 'roulant'

  // Pace (trail only, m/s → min/km)
  avgPaceSecPerKm: number | null

  // Cardio
  avgHrBpm: number | null
  avgHrPctFcMax: number | null

  // VAM (global estimate — not per bucket, explains limitation)
  estimatedVamMH: number | null
  vamStatus: MetricStatus

  // Cadence (sorties/mois)
  cadencePerMonth: number
  cadenceStatus: MetricStatus

  // Load
  avgDplusPerSession: number

  // Gradient-bucket multipliers for scoreRaceSection — null until streams available
  gradeBucketMultipliers: Record<GradientBucketKey, number> | null
  streamsAvailable: false  // will become true when streams are stored
}

const TRAIL_TYPES = new Set([
  'run', 'trail', 'virtualrun',
  'Run', 'Trail', 'VirtualRun',
])

function isTrail(a: ActivityAggregate): boolean {
  return TRAIL_TYPES.has(a.type) || TRAIL_TYPES.has(a.sportType ?? '')
}

export function computeRunnerProfile(
  activities: ActivityAggregate[],
  fcMax: number,
  periodMonths = 12,
): RunnerProfile {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - periodMonths)

  const recent = activities.filter(a => new Date(a.startDate) >= cutoff)
  const trail = recent.filter(isTrail)

  const totalDistKm = trail.reduce((s, a) => s + a.distM / 1000, 0)
  const totalDplus  = trail.reduce((s, a) => s + (a.dplus ?? 0), 0)
  const totalTimeH  = trail.reduce((s, a) => s + a.movingTimeSec / 3600, 0)

  const avgDplusPerKm = totalDistKm > 0 ? totalDplus / totalDistKm : 0
  const terrainLabel =
    avgDplusPerKm >= 50 ? 'montagne' :
    avgDplusPerKm >= 25 ? 'vallonné' : 'roulant'

  const withSpeed = trail.filter(a => a.avgSpeedMs && a.avgSpeedMs > 0)
  const avgPaceSecPerKm = withSpeed.length > 0
    ? withSpeed.reduce((s, a) => s + 1000 / a.avgSpeedMs!, 0) / withSpeed.length
    : null

  const withHr = trail.filter(a => a.avgHrBpm && a.avgHrBpm > 0)
  const avgHrBpm = withHr.length > 0
    ? withHr.reduce((s, a) => s + a.avgHrBpm!, 0) / withHr.length
    : null
  const avgHrPctFcMax = avgHrBpm ? avgHrBpm / fcMax : null

  // Global VAM estimate: only meaningful if terrain has significant D+
  const estimatedVamMH = totalTimeH > 0 && totalDplus > 500
    ? Math.round(totalDplus / totalTimeH)
    : null

  const cadencePerMonth = trail.length / periodMonths

  return {
    totalActivities: recent.length,
    trailActivities: trail.length,
    totalDistKm: Math.round(totalDistKm),
    totalDplus: Math.round(totalDplus),
    totalTimeH: Math.round(totalTimeH * 10) / 10,
    periodMonths,

    avgDplusPerKm: Math.round(avgDplusPerKm),
    terrainLabel,

    avgPaceSecPerKm: avgPaceSecPerKm ? Math.round(avgPaceSecPerKm) : null,
    avgHrBpm: avgHrBpm ? Math.round(avgHrBpm) : null,
    avgHrPctFcMax: avgHrPctFcMax ? Math.round(avgHrPctFcMax * 100) / 100 : null,

    estimatedVamMH,
    vamStatus: metricStatus(estimatedVamMH, { ok: 600, strength: 900 }),

    cadencePerMonth: Math.round(cadencePerMonth * 10) / 10,
    cadenceStatus: metricStatus(cadencePerMonth, { ok: 2, strength: 4 }),

    avgDplusPerSession: trail.length > 0 ? Math.round(totalDplus / trail.length) : 0,

    gradeBucketMultipliers: null,
    streamsAvailable: false,
  }
}

export function fmtPaceProfile(secPerKm: number | null): string {
  if (!secPerKm) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}'${String(s).padStart(2, '0')}/km`
}

export function statusColor(s: MetricStatus): string {
  if (s === 'strength') return 'var(--vl-growth)'
  if (s === 'ok') return 'var(--vl-text)'
  if (s === 'weak') return 'var(--vl-ember)'
  return 'var(--vl-text-3)'
}

export function statusLabel(s: MetricStatus): string {
  if (s === 'strength') return 'Point fort'
  if (s === 'ok') return 'Correct'
  if (s === 'weak') return 'À renforcer'
  return '—'
}
