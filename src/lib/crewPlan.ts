import type { Section, ProjectionResult, GpxPoint } from './computeRaceProjection'
import type { NutritionRow } from './nutritionPlan'

export interface RavitoPoint {
  km: number
  label: string
  source: 'gpx' | 'manual'
}

export interface CrewCheckpoint {
  km: number
  label: string
  timeAgressif: string
  timeCible: string
  timePrudent: string
  nutritionConsumed: string
  nutritionToGive: string
  consigne: string
  vigilance: string
  isRavito: boolean
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
  const lower = text.toLowerCase()
  return RAVITO_KEYWORDS.some(kw => lower.includes(kw))
}

// Browser-only: requires DOMParser. Do not call in Node/test environments.
export function extractGpxWaypoints(gpxString: string, trackPoints: GpxPoint[]): RavitoPoint[] {
  const doc = new DOMParser().parseFromString(gpxString, 'application/xml')
  const wpts = Array.from(doc.querySelectorAll('wpt'))
  if (wpts.length === 0 || trackPoints.length < 2) return []

  const cumDist: number[] = [0]
  for (let i = 1; i < trackPoints.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(trackPoints[i - 1], trackPoints[i]))
  }
  const totalKm = cumDist[cumDist.length - 1] / 1000

  const results: RavitoPoint[] = []

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
    const km = cumDist[minIdx] / 1000
    if (km > totalKm - 2) continue

    const nameMatch = isRavitoKeyword(name)
    const descMatch = isRavitoKeyword(desc)
    const displayLabel = name || desc || `Ravito ${km.toFixed(1)} km`

    if (nameMatch || descMatch) {
      results.push({ km, label: displayLabel, source: 'gpx' })
    } else if (!name && !desc) {
      // Unnamed waypoint — candidate auto-ravito, marked with "?" prefix
      results.push({ km, label: `? ${km.toFixed(1)} km`, source: 'gpx' })
    }
  }

  results.sort((a, b) => a.km - b.km)

  // Filter unnamed auto-candidates: keep only if ≥5 km from previous and ≤10 km before end
  const filtered: RavitoPoint[] = []
  for (const r of results) {
    if (r.label.startsWith('?')) {
      const prev = filtered[filtered.length - 1]
      if (prev && r.km - prev.km < 5) continue
      if (r.km > totalKm - 10) continue
    }
    filtered.push(r)
  }

  return filtered
}

function cumulativeTimeAtKm(km: number, sections: Section[], sectionTimes: number[]): number {
  let cumTime = 0
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const sEndKm = s.startKm + s.dist / 1000
    if (sEndKm <= km) {
      cumTime += sectionTimes[i]
    } else if (s.startKm < km) {
      const fraction = (km - s.startKm) / (s.dist / 1000)
      cumTime += sectionTimes[i] * fraction
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
    .map(r => ({ km: r.km, label: r.label, isRavito: true }))
    .sort((a, b) => a.km - b.km)

  // Fill gaps > 15 km between ravitos (or start/end) with auto-spaced points
  const filledBoundaries = [0, ...ravitoCheckpoints.map(r => r.km), totalKm]
  const autoPoints: { km: number; label: string; isRavito: boolean }[] = []

  for (let i = 0; i < filledBoundaries.length - 1; i++) {
    const gapStart = filledBoundaries[i]
    const gapEnd = filledBoundaries[i + 1]
    const gap = gapEnd - gapStart
    if (gap > 15) {
      const n = Math.floor(gap / 15)
      for (let j = 1; j <= n; j++) {
        const km = Math.round((gapStart + (gap / (n + 1)) * j) * 10) / 10
        autoPoints.push({ km, label: `km ${km}`, isRavito: false })
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

    return {
      km: cp.km,
      label: cp.label,
      timeAgressif: fmtTime(cumTime * ratioMin),
      timeCible: fmtTime(cumTime),
      timePrudent: fmtTime(cumTime * ratioMax),
      nutritionConsumed: consumed.length > 0 ? consumed.join(', ') : '—',
      nutritionToGive: nextNutrition ? nextNutrition.action : '—',
      consigne: cp.isRavito
        ? `Ravito — vérifier eau + ${nextNutrition ? nextNutrition.action : 'nutrition'}`
        : 'Point de contrôle — vérifier état coureur',
      vigilance: vigilanceMsg(cp.km, sections),
      isRavito: cp.isRavito,
    }
  })
}
