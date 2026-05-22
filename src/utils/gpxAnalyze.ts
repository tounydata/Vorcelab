import type { GpxPoint } from '../types/race'
import type { Activity } from '../types/activity'
import type { WeatherForecast } from '../lib/fetchForecastWeather'
import { hav, minettiGradePenalty, buildDetailedSections } from './gpxCore'
import type { KmSeg, Section, GpxSample } from './gpxCore'
import { isRun } from './formatters'

interface AnalyzeInput {
  points: GpxPoint[]
  race: { name: string; date?: string; type?: string; goal_time?: string }
  activities: Activity[]
  profile: { fc_max?: number; prs?: Record<string, { timeS: number; dist: number }>; nutrition_level?: string }
  weather: WeatherForecast | null
}

export interface AnalyzeResult {
  totalDist: number
  dplus: number
  dminus: number
  altMin: number
  altMax: number
  samples: GpxSample[]
  sections: Section[]
  sectionTimes: number[]
  estTimeS: number
  timeMin: number
  timeMax: number
  basePaceS: number
  projSource: string
  confidence: 'good' | 'medium' | 'low'
  isTrail: boolean
  cumDist: number[]
}

export function analyzeGPX(input: AnalyzeInput): AnalyzeResult {
  const { points, race, activities, profile, weather } = input

  // Build cumulative distances and elevation
  const cumDist: number[] = [0]
  let dplus = 0, dminus = 0
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + hav(points[i - 1], points[i]))
    if (points[i].ele != null && points[i - 1].ele != null) {
      const diff = points[i].ele! - points[i - 1].ele!
      if (diff > 0) dplus += diff
      else dminus += Math.abs(diff)
    }
  }
  const totalDist = cumDist[cumDist.length - 1]
  const eles = points.map(p => p.ele).filter((e): e is number => e != null)
  const altMin = eles.length ? Math.min(...eles) : 0
  const altMax = eles.length ? Math.max(...eles) : 0

  // Samples every 100m
  const samples: GpxSample[] = []
  let target = 0
  for (let i = 0; i < points.length; i++) {
    if (cumDist[i] >= target) {
      samples.push({ d: +(cumDist[i] / 1000).toFixed(2), alt: points[i].ele != null ? Math.round(points[i].ele!) : null })
      target += 100
    }
  }
  samples.push({ d: +(totalDist / 1000).toFixed(2), alt: eles.length ? Math.round(eles[eles.length - 1]) : null })

  // 500m segments
  const kmSecs: KmSeg[] = []
  let segTarget = 500, prevIdx = 0
  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= segTarget || i === cumDist.length - 1) {
      let sdp = 0, sdm = 0
      for (let j = prevIdx + 1; j <= i; j++) {
        if (points[j].ele != null && points[j - 1].ele != null) {
          const diff = points[j].ele! - points[j - 1].ele!
          if (diff > 0) sdp += diff
          else sdm += Math.abs(diff)
        }
      }
      const segDist = cumDist[i] - cumDist[prevIdx]
      const elevChange = (points[i].ele != null && points[prevIdx].ele != null) ? points[i].ele! - points[prevIdx].ele! : 0
      const grade = segDist > 0 ? (elevChange / segDist) * 100 : 0
      kmSecs.push({
        km: +(cumDist[i] / 1000).toFixed(2),
        startKm: +(cumDist[prevIdx] / 1000).toFixed(2),
        dist: segDist,
        dplus: Math.round(sdp),
        dminus: Math.round(sdm),
        grade: +grade.toFixed(1),
        altEnd: points[i].ele != null ? Math.round(points[i].ele!) : null,
      })
      prevIdx = i
      segTarget = cumDist[i] + 500
    }
  }

  // Detect trail vs road
  const raceType = race.type || ''
  const isTrail = (['Trail', 'TrailRun', 'trail'].includes(raceType))
    || (!['Run', 'Road', 'road', 'Route', 'route', 'Running'].includes(raceType) && totalDist > 0 && (dplus / (totalDist / 1000)) > 20)

  // Base pace computation
  const now = Date.now()
  const cutoff60 = now - 60 * 24 * 3600 * 1000
  const distKmRace = totalDist / 1000
  const dpKmRace = distKmRace > 0 ? dplus / distKmRace : 0

  const progressionFactor = 1.0

  let basePaceS: number
  let projSource: string
  let dataQuality = { trailCount: 0, recentCount: 0, hasHR: false }

  if (isTrail) {
    const trailRuns = activities
      .filter(a => (a.type === 'TrailRun' || /trail/i.test(a.sport_type || '')) && a.distance > 5000 && a.average_speed > 0)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
      .slice(0, 20)
    if (trailRuns.length >= 1) {
      const top = trailRuns.slice(0, 10)
      const scored = top.map(a => {
        const aDpKm = (a.total_elevation_gain || 0) / (a.distance / 1000)
        const similarity = 1 - Math.min(1, Math.abs(aDpKm - dpKmRace) / (dpKmRace + 1))
        const recency = new Date(a.start_date).getTime() >= cutoff60 ? 2 : 1
        return { paceS: 1000 / a.average_speed, weight: (0.4 + 0.6 * similarity) * recency }
      })
      const totalW = scored.reduce((s, x) => s + x.weight, 0)
      const weightedPace = scored.reduce((s, x) => s + x.paceS * x.weight, 0) / totalW
      basePaceS = weightedPace / progressionFactor
      const recentCount = trailRuns.filter(a => new Date(a.start_date).getTime() >= cutoff60).length
      projSource = `${trailRuns.length} sortie${trailRuns.length > 1 ? 's' : ''} trail · D+ pondéré · progression stable`
      dataQuality = { trailCount: trailRuns.length, recentCount, hasHR: trailRuns.some(a => a.average_heartrate != null) }
    } else {
      basePaceS = 420
      projSource = 'Aucune sortie trail — estimation par défaut · sync Strava'
    }
  } else {
    const prs = profile.prs
    if (prs) {
      const candidates = (['semi', '10k', '15k', 'marathon', '5k'] as const).filter(k => prs[k]?.timeS && prs[k]?.dist)
      if (candidates.length) {
        const pr = prs[candidates[0]]
        basePaceS = (pr.timeS / pr.dist * 1000) / progressionFactor
        projSource = `PR ${candidates[0].toUpperCase()} · progression stable`
        const roadRuns = activities.filter(a => isRun(a.type) && a.distance > 3000)
        dataQuality = { trailCount: 0, recentCount: roadRuns.filter(a => new Date(a.start_date).getTime() >= cutoff60).length, hasHR: roadRuns.some(a => a.average_heartrate != null) }
      } else {
        basePaceS = 320
        projSource = 'Estimation par défaut — renseigne tes PR dans ton profil'
      }
    } else {
      // Fallback: best recent road run
      const roadRuns = activities
        .filter(a => isRun(a.type) && a.distance > 5000 && a.average_speed > 0)
        .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
        .slice(0, 10)
      if (roadRuns.length >= 1) {
        const recentCount = roadRuns.filter(a => new Date(a.start_date).getTime() >= cutoff60).length
        const top = roadRuns.slice(0, 5)
        const avg = top.reduce((s, a) => s + 1000 / a.average_speed, 0) / top.length
        basePaceS = avg / progressionFactor
        projSource = `${roadRuns.length} sortie${roadRuns.length > 1 ? 's' : ''} route · allure moyenne`
        dataQuality = { trailCount: 0, recentCount, hasHR: top.some(a => a.average_heartrate != null) }
      } else {
        basePaceS = 320
        projSource = 'Estimation par défaut — sync Strava pour une projection personnalisée'
      }
    }
  }

  // Weather adjustments
  let weatherMultiplier = 1
  if (weather) {
    if (weather.temp != null) weatherMultiplier += Math.max(0, (weather.temp - 15) * 0.005)
    if (weather.precip_prob != null && weather.precip_prob > 30) weatherMultiplier += Math.min(0.02, weather.precip_prob * 0.0003)
    if (weather.wind != null) weatherMultiplier += Math.min(0.03, Math.pow(weather.wind / 30, 2) * 0.02)
  }

  // Build sections
  const sections = buildDetailedSections(kmSecs)

  // Section times (Minetti penalty)
  const sectionTimes: number[] = []
  let estTimeS = 0
  sections.forEach(s => {
    const g = s.grade / 100
    const penalty = 1 + minettiGradePenalty(g)
    const t = basePaceS * penalty * weatherMultiplier * s.dist / 1000
    sectionTimes.push(t)
    estTimeS += t
  })

  // Confidence scoring
  let confScore = 0
  if (isTrail) {
    if (dataQuality.trailCount >= 5) confScore += 2
    else if (dataQuality.trailCount >= 2) confScore += 1
  } else {
    if (dataQuality.recentCount >= 3) confScore += 2
    else if (dataQuality.recentCount >= 1) confScore += 1
  }
  if (dataQuality.recentCount >= 3) confScore += 1
  if (dataQuality.hasHR) confScore += 1
  if (weather) confScore += 1
  if (totalDist > 5000 && sections.length >= 5) confScore += 1
  confScore = Math.max(0, confScore)
  const confidence: 'good' | 'medium' | 'low' = confScore >= 6 ? 'good' : confScore >= 3 ? 'medium' : 'low'

  // Range
  const rf = confidence === 'good' ? { min: 0.96, max: 1.08 } : confidence === 'medium' ? { min: 0.95, max: 1.15 } : { min: 0.97, max: 1.25 }
  const timeMin = estTimeS * rf.min
  const timeMax = estTimeS * rf.max

  // Scale section times to match final estTimeS
  {
    const rawSum = sectionTimes.reduce((s, t) => s + t, 0)
    const sf = rawSum > 0 ? estTimeS / rawSum : 1
    for (let i = 0; i < sectionTimes.length; i++) sectionTimes[i] = Math.round(sectionTimes[i] * sf)
  }

  return { totalDist, dplus, dminus, altMin, altMax, samples, sections, sectionTimes, estTimeS, timeMin, timeMax, basePaceS, projSource, confidence, isTrail, cumDist }
}
