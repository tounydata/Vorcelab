// Port exact de training-load.js
// Charge d'entraînement — charge aiguë 7j, charge de fond 42j, ratio, tendance

const FC_MAX_DEFAULT = 185
const TRAIL_TYPES = ['TrailRun', 'Trail Run']
const MS_7D  =  7 * 86_400_000
const MS_14D = 14 * 86_400_000
const MS_42D = 42 * 86_400_000

export interface ActivityForLoad {
  moving_time?: number | null
  average_heartrate?: number | null
  sport_type?: string | null
  type?: string | null
  distance?: number | null
  total_elevation_gain?: number | null
  start_date: string
}

function isRun(type: string | null | undefined): boolean {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type ?? '')
}

// Load = durée_min × facteur_intensité × facteur_dénivelé × facteur_type
export function computeActivityLoad(activity: ActivityForLoad, fcMax?: number | null): number {
  const maxHR = fcMax || FC_MAX_DEFAULT
  const durationMin = (activity.moving_time || 0) / 60
  if (durationMin < 5) return 0

  // Facteur intensité — poids log-croissants inspirés Bannister TRIMP
  let intensity: number
  if (activity.average_heartrate && maxHR > 0) {
    const z = activity.average_heartrate / maxHR
    if (z >= 0.90)      intensity = 7.5
    else if (z >= 0.80) intensity = 4.5
    else if (z >= 0.70) intensity = 2.5
    else if (z >= 0.60) intensity = 1.5
    else                intensity = 1.0
  } else {
    const t = activity.sport_type || activity.type || ''
    const pace = (activity.distance ?? 0) > 100
      ? (activity.moving_time ?? 0) / ((activity.distance ?? 0) / 1000)
      : 0
    if (TRAIL_TYPES.includes(t))      intensity = 3.0
    else if (pace > 0 && pace < 280)  intensity = 3.5 // < 4:40/km → intensif
    else if (pace > 0 && pace < 360)  intensity = 3.0 // < 6:00/km
    else                              intensity = 2.5
  }

  // Facteur dénivelé — D+/km
  let elev = 1.0
  if ((activity.distance ?? 0) > 100 && (activity.total_elevation_gain ?? 0) > 0) {
    const dpKm = (activity.total_elevation_gain ?? 0) / ((activity.distance ?? 0) / 1000)
    if (dpKm >= 40)      elev = 1.30
    else if (dpKm >= 20) elev = 1.15
    else if (dpKm >= 10) elev = 1.05
  }

  // Facteur type
  const typeFactor = TRAIL_TYPES.includes(activity.sport_type || activity.type || '') ? 1.05 : 1.0

  return Math.round(durationMin * intensity * elev * typeFactor)
}

export function computeLoadTrend(activities: ActivityForLoad[], fcMax?: number | null): string {
  const now = Date.now()
  const runs = (activities || []).filter(a => isRun(a.sport_type || a.type))

  const load7 = runs
    .filter(a => now - new Date(a.start_date).getTime() <= MS_7D)
    .reduce((s, a) => s + computeActivityLoad(a, fcMax), 0)

  const load7prev = runs
    .filter(a => {
      const age = now - new Date(a.start_date).getTime()
      return age > MS_7D && age <= MS_14D
    })
    .reduce((s, a) => s + computeActivityLoad(a, fcMax), 0)

  if (load7prev === 0 && load7 === 0) return 'unknown'
  if (load7prev === 0) return 'increasing'
  const ratio = load7 / load7prev
  if (ratio > 1.15) return 'increasing'
  if (ratio < 0.85) return 'decreasing'
  return 'stable'
}

// ATL (charge aiguë) τ=7j / CTL (charge chronique) τ=42j — Bannister TRIMP model
export function computeTrainingLoad(activities: ActivityForLoad[], fcMax?: number | null) {
  const now = Date.now()
  const runs = (activities || []).filter(a => isRun(a.sport_type || a.type))

  const recent42 = runs.filter(a => now - new Date(a.start_date).getTime() <= MS_42D)
  const recent7  = recent42.filter(a => now - new Date(a.start_date).getTime() <= MS_7D)

  const acute = recent7.reduce((acc, a) => {
    const ageDays = (now - new Date(a.start_date).getTime()) / 86_400_000
    const weight = Math.exp(-ageDays / 7)
    const load = computeActivityLoad(a, fcMax)
    return { sum: acc.sum + load * weight, weight: acc.weight + weight }
  }, { sum: 0, weight: 0 })

  const chronic = recent42.reduce((acc, a) => {
    const ageDays = (now - new Date(a.start_date).getTime()) / 86_400_000
    const weight = Math.exp(-ageDays / 42)
    const load = computeActivityLoad(a, fcMax)
    return { sum: acc.sum + load * weight, weight: acc.weight + weight }
  }, { sum: 0, weight: 0 })

  const acuteLoad  = acute.weight   > 0 ? acute.sum   / acute.weight   : 0
  const chronicLoad = chronic.weight > 0 ? chronic.sum / chronic.weight : 0
  const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : null
  const trend = computeLoadTrend(activities, fcMax)

  return {
    acuteLoad:   Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
    ratio,
    trend,
    count7:  recent7.length,
    count42: recent42.length,
    hasHR:   recent7.some(a => a.average_heartrate),
  }
}

// Seuils ACWR issus de Gabbett 2016 (Br J Sports Med)
export function getLoadStatus(ratio: number | null) {
  if (ratio === null || ratio === undefined)
    return { label: 'inconnu',            color: 'var(--vl-text-3)', code: 'unknown'  }
  if (ratio < 0.80)
    return { label: 'récupération',       color: 'var(--vl-growth)', code: 'recovery' }
  if (ratio <= 1.30)
    return { label: 'stable',             color: 'var(--vl-growth)', code: 'stable'   }
  if (ratio <= 1.50)
    return { label: 'charge élevée',      color: '#f59e0b',          code: 'elevated' }
  return   { label: 'surcharge probable', color: 'var(--vl-ember)',  code: 'overload' }
}
