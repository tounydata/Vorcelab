// Profil Coureur Vorcelab — types matching the `compute-runner-profile` edge function.
// Stream-based: VAM per gradient bucket computed from second-by-second Strava streams.

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

// Per-bucket stats returned by the edge function
export interface BucketStats {
  timeSec: number
  dplusM: number
  vamMH: number | null          // null for descents/flat or insufficient data
  avgSpeedKmH: number | null
  avgHrBpm: number | null
  avgHrPctFcMax: number | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  status: 'strength' | 'ok' | 'weak' | 'unknown'
}

// Full response from compute-runner-profile edge function
export interface RunnerProfileComputed {
  computedAt: string
  periodDays: number
  activitiesAnalyzed: number
  totalActivitiesFound: number
  fcMax: number
  buckets: Record<GradientBucketKey, BucketStats>
  gradeBucketMultipliers: Record<GradientBucketKey, number>
  errors?: string[]
}

// Profile row from profiles table (JSONB column)
export interface ProfileRow {
  fc_max?: number | null
  name?: string | null
  runner_profile?: RunnerProfileComputed | null
  runner_profile_at?: string | null
}

export type MetricStatus = 'strength' | 'ok' | 'weak' | 'unknown'

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

export function confidenceLabel(c: BucketStats['confidence']): string {
  if (c === 'high') return 'Fiable'
  if (c === 'medium') return 'Moyen'
  if (c === 'low') return 'Peu de données'
  return '—'
}

export function fmtVam(vam: number | null): string {
  if (vam === null) return '—'
  return `${Math.round(vam)} m/h`
}

export function fmtSpeed(kmh: number | null): string {
  if (kmh === null) return '—'
  return `${kmh.toFixed(1)} km/h`
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m} min`
}
