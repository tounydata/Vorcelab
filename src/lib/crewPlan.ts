import type { Section, ProjectionResult, GpxPoint } from './computeRaceProjection'
import type { NutritionRow } from './nutritionPlan'
import { getGradeBucket } from './runnerProfile'

export interface RavitoPoint {
  km: number
  label: string
  source: 'gpx' | 'manual'
}

export interface UnclassifiedWaypoint {
  km: number
  label: string
}

export interface GpxWaypointResult {
  ravitos: RavitoPoint[]
  unclassified: UnclassifiedWaypoint[]
}

export interface CrewCheckpoint {
  km: number
  label: string
  kind: 'ravito' | 'estimated'
  timeAgressif: string
  timeCible: string
  timePrudent: string
  nutritionConsumed: string
  nutritionToGive: string
  consigne: string
  vigilance: string
}

// Options interface for future Profil Coureur integration.
// gradeBucketMultipliers will hold per-bucket (pente) multipliers derived
// from the runner's force/faiblesse profile — not wired in yet.
export interface SectionScoreOptions {
  gradeBucketMultipliers?: Record<string, number>
}

// Score a race section for importance ranking (higher = more critical).
// Designed to be extensible: a short steep wall should never outscore
// a long moderate climb.
export function scoreRaceSection(
  section: Section,
  sectionTime: number,
  _options?: SectionScoreOptions,
): number {
  const distKm = section.dist / 1000
  const gradeAbs = Math.abs(section.grade)
  const elev = section.type === 'up' ? section.dplus : section.dminus

  // Time impact: longer time = more race impact (sqrt dampens outliers)
  const timeFactor = Math.sqrt(Math.max(sectionTime, 60) / 300)

  // Elevation density (m/km): rewards genuinely steep terrain, not just grade alone
  const elevDensity = distKm > 0 ? elev / distKm : 0

  // Long-section bonus 0→1: prevents very short walls from dominating.
  // Caps at 3 km so a 5 km climb doesn't score 5× a 1 km climb.
  const lengthBonus = Math.min(distKm, 3) / 3

  // Grade score blends absolute grade with elevation density context
  const gradeScore = gradeAbs * (1 + elevDensity / 150)

  const base = gradeScore * distKm * timeFactor * (1 + lengthBonus)

  // Personalize: if the runner is weak on this gradient bucket, the section
  // is scored higher → it rises in "Sections clés" and gets crew vigilance.
  const multiplier = _options?.gradeBucketMultipliers
    ? (_options.gradeBucketMultipliers[getGradeBucket(section.grade)] ?? 1)
    : 1

  return base * multiplier
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
}

const RAVITO_KEYWORDS = ['ravito', 'ravitaillement', 'aid', 'cp', 'checkpoint', 'refresh', 'drop', 'base']

function isRavitoKeyword(text: string): boolean {
  return RAVITO_KEYWORDS.some(kw => text.toLowerCase().includes(kw))
}

// Browser-only: requires DOMParser. Do not call in Node/test environments.
export function extractGpxWaypoints(gpxString: string, trackPoints: GpxPoint[]): GpxWaypointResult {
  const doc = new DOMParser().parseFromString(gpxString, 'application/xml')
  const wpts = Array.from(doc.querySelectorAll('wpt'))
  if (wpts.length === 0 || trackPoints.length < 2) return { ravitos: [], unclassified: [] }

  const cumDist: number[] = [0]
  for (let i = 1; i < trackPoints.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(trackPoints[i - 1], trackPoints[i]))
  }
  const totalKm = cumDist[cumDist.length - 1] / 1000

  const ravitos: RavitoPoint[] = []
  const unclassified: UnclassifiedWaypoint[] = []

  for (const wpt of wpts) {
    const lat = parseFloat(wpt.getAttribute('lat') ?? '0')
    const lon = parseFloat(wpt.getAttribute('lon') ?? '0')
    const name = wpt.querySelector('name')?.textContent?.trim() ?? ''
    const desc = wpt.querySelector('desc')?.textContent?.trim() ?? ''

    let minDist = Infinity
    let minIdx = 0
    for (let i = 0; i < trackPoints.length; i++) {
      const d = haversineM({ lat, lon }, trackPoints[i])
      if (d < minDist) { minDist = d; minIdx = i }
    }
    const km = Math.round((cumDist[minIdx] / 1000) * 10) / 10
    if (km > totalKm - 1) continue

    if (isRavitoKeyword(name) || isRavitoKeyword(desc)) {
      ravitos.push({ km, label: name || desc || `Ravito ${km} km`, source: 'gpx' })
    } else {
      // Not identified as a ravito — put in unclassified for user to review
      unclassified.push({ km, label: name || desc || `Waypoint ${km} km` })
    }
  }

  return {
    ravitos: ravitos.sort((a, b) => a.km - b.km),
    unclassified: unclassified.sort((a, b) => a.km - b.km),
  }
}

function cumulativeTimeAtKm(km: number, sections: Section[], sectionTimes: number[]): number {
  let cumTime = 0
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const sEndKm = s.startKm + s.dist / 1000
    if (sEndKm <= km) {
      cumTime += sectionTimes[i]
    } else if (s.startKm < km) {
      cumTime += sectionTimes[i] * (km - s.startKm) / (s.dist / 1000)
      break
    } else {
      break
    }
  }
  return cumTime
}

function nutritionKmFromMoment(moment: string): number | null {
  const m = moment.match(/~?(\d+)\s*km/i)
  return m ? parseInt(m[1], 10) : null
}

function vigilanceMsg(km: number, sections: Section[]): string {
  for (const s of sections) {
    if (s.startKm >= km && s.startKm <= km + 5 && s.type === 'up' && s.grade > 12) {
      return `Grosse montée à venir +${Math.round(s.dplus)}m D+`
    }
  }
  return ''
}

export function generateCrewPlan(
  projection: ProjectionResult,
  nutritionRows: NutritionRow[],
  ravitos: RavitoPoint[],
): CrewCheckpoint[] {
  const { sections, sectionTimes, totalDistM, estTimeS, timeMin, timeMax } = projection
  const totalKm = totalDistM / 1000
  const ratioMin = timeMin / estTimeS
  const ratioMax = timeMax / estTimeS

  const ravitoCheckpoints = ravitos
    .filter(r => r.km > 1 && r.km < totalKm - 1)
    .map(r => ({ km: r.km, label: r.label, kind: 'ravito' as const }))
    .sort((a, b) => a.km - b.km)

  const filledBoundaries = [0, ...ravitoCheckpoints.map(r => r.km), totalKm]
  const autoPoints: { km: number; label: string; kind: 'estimated' }[] = []

  for (let i = 0; i < filledBoundaries.length - 1; i++) {
    const gapStart = filledBoundaries[i]
    const gapEnd = filledBoundaries[i + 1]
    const gap = gapEnd - gapStart
    if (gap > 15) {
      const n = Math.floor(gap / 15)
      for (let j = 1; j <= n; j++) {
        const km = Math.round((gapStart + (gap / (n + 1)) * j) * 10) / 10
        autoPoints.push({ km, label: `km ${km}`, kind: 'estimated' })
      }
    }
  }

  const allCheckpoints = [...ravitoCheckpoints, ...autoPoints].sort((a, b) => a.km - b.km)
  if (allCheckpoints.length === 0) return []

  return allCheckpoints.map(cp => {
    const cumTime = cumulativeTimeAtKm(cp.km, sections, sectionTimes)
    const consumed = nutritionRows
      .filter(r => { const k = nutritionKmFromMoment(r.moment); return k !== null && k <= cp.km })
      .map(r => r.action)
    const nextNutrition = nutritionRows.find(r => {
      const k = nutritionKmFromMoment(r.moment)
      return k !== null && k > cp.km
    })

    const consigne = cp.kind === 'ravito'
      ? `Ravito — vérifier eau + ${nextNutrition ? nextNutrition.action : 'nutrition'}`
      : 'Checkpoint estimé — vérifier état coureur'

    return {
      km: cp.km,
      label: cp.label,
      kind: cp.kind,
      timeAgressif: fmtTime(cumTime * ratioMin),
      timeCible: fmtTime(cumTime),
      timePrudent: fmtTime(cumTime * ratioMax),
      nutritionConsumed: consumed.length > 0 ? consumed.join(', ') : '—',
      nutritionToGive: nextNutrition ? nextNutrition.action : '—',
      consigne,
      vigilance: vigilanceMsg(cp.km, sections),
    }
  })
}
