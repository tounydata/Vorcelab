import type { AnalyzeResult } from './gpxAnalyze'
import type { Section } from './gpxCore'

export interface CrewCheckpoint {
  km: number
  label: string
  timeAggH: string
  timeCibleH: string
  timePrudentH: string
  nutrDonner: string
  alreadyTaken: string
  rappel: string
  vigilance: string
  isHighlight: boolean
}

export interface CrewPlan {
  raceName: string
  raceDate: string
  athleteName: string
  estTimeS: number
  timeMinS: number
  timeMaxS: number
  raceStartHour: number
  checkpoints: CrewCheckpoint[]
}

interface CrewPlanInput {
  result: AnalyzeResult
  race: { name: string; date?: string; goal_time?: string }
  athleteName: string
  raceStartHour?: number
  nutritionLevel?: string
}

function toHHMM(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return '--:--'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

// Nutrition events at specific km positions (mirrors nutritionPlan.ts logic without duplicating rows)
function nutrEventsAtKm(distM: number, estTimeS: number, nutritionLevel = 'standard'): Array<{ km: number; action: string }> {
  const dh = estTimeS / 3600
  const dk = distM / 1000
  if (dh < 1.5) return []
  const events: Array<{ km: number; action: string }> = []
  events.push({ km: Math.round(dk * 0.30), action: 'Gel sans caféine + eau 150ml' })
  if (dh >= 1.75) events.push({ km: Math.round(dk * 0.50), action: 'Boisson isotonique 200ml' })
  events.push({ km: Math.round(dk * 0.65), action: 'Gel caféiné + eau ☕' })
  if (dh >= 2.5) events.push({ km: Math.round(dk * 0.80), action: 'Solide (barre/datte) + eau' })
  void nutritionLevel
  return events
}

// Score a section by importance for crew plan checkpoint selection
function sectionScore(s: Section): number {
  return s.dplus * 2 + s.dminus * 0.5 + (s.type === 'up' ? 80 : s.type === 'down' ? 20 : 0) + s.dist / 200
}

export function generateCrewPlan(input: CrewPlanInput): CrewPlan {
  const { result, race, athleteName, raceStartHour = 8, nutritionLevel = 'standard' } = input
  const { sections, sectionTimes, estTimeS, timeMin, timeMax, totalDist } = result

  if (sections.length === 0) {
    return {
      raceName: race.name, raceDate: race.date ?? '',
      athleteName, estTimeS, timeMinS: timeMin, timeMaxS: timeMax,
      raceStartHour, checkpoints: [],
    }
  }

  const sfAgg = estTimeS > 0 ? timeMin / estTimeS : 1
  const sfPrudent = estTimeS > 0 ? timeMax / estTimeS : 1

  // Cumulative times at each section end
  const cumTimes: number[] = []
  let acc = 0
  for (const t of sectionTimes) { acc += t; cumTimes.push(acc) }

  // Select up to 6 most significant sections as checkpoints
  const MAX = 6
  let cpIndices: number[]
  if (sections.length <= MAX) {
    cpIndices = sections.map((_, i) => i)
  } else {
    cpIndices = sections
      .map((s, i) => ({ i, score: sectionScore(s) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX)
      .map(x => x.i)
      .sort((a, b) => a - b)
  }

  const nutrEvents = nutrEventsAtKm(totalDist, estTimeS, nutritionLevel)
  const startSecs = raceStartHour * 3600

  const checkpoints: CrewCheckpoint[] = cpIndices.map((secIdx, cpPos) => {
    const s = sections[secIdx]
    const km = s.endKm
    const cumS = cumTimes[secIdx]

    const prevCpIdx = cpPos > 0 ? cpIndices[cpPos - 1] : -1
    const prevKm = prevCpIdx >= 0 ? sections[prevCpIdx].endKm : 0

    const eventsHere = nutrEvents.filter(e => e.km > prevKm && e.km <= km)
    const eventsBefore = nutrEvents.filter(e => e.km <= prevKm)

    const nutrDonner = eventsHere.length > 0
      ? eventsHere.map(e => e.action).join(' + ')
      : '—'
    const alreadyTaken = eventsBefore.length > 0
      ? eventsBefore.map(e => e.action).join(', ')
      : '—'

    const nextSec = sections[secIdx + 1]
    const isHighlight = s.dplus > 100 || (nextSec?.dplus ?? 0) > 150

    let vigilance: string
    let rappel: string
    if (s.type === 'up') {
      const steep = Math.abs(s.grade) > 10
      vigilance = steep
        ? `Montée raide — D+${s.dplus}m · ${Math.abs(s.grade).toFixed(0)}%`
        : `Montée modérée — D+${s.dplus}m · ${Math.abs(s.grade).toFixed(0)}%`
      rappel = steep ? 'Marche active si RPE > 8 · boire ici' : 'Foulée courte et régulière · boire ici'
    } else if (s.type === 'down') {
      vigilance = Math.abs(s.grade) > 12
        ? `Descente technique — D-${s.dminus}m · ${Math.abs(s.grade).toFixed(0)}%`
        : `Descente — D-${s.dminus}m · récupération active`
      rappel = Math.abs(s.grade) > 12 ? 'Surveiller les appuis · risque chute' : 'Récupération active'
    } else {
      vigilance = `Section plate — ${(s.dist / 1000).toFixed(1)} km`
      rappel = 'Maintenir l\'allure cible'
    }

    if (nextSec?.type === 'up' && nextSec.dplus > 100) {
      rappel += ` · Section suivante : montée D+${nextSec.dplus}m`
    }

    return {
      km,
      label: `km ${km.toFixed(1)}`,
      timeAggH: toHHMM(startSecs + cumS * sfAgg),
      timeCibleH: toHHMM(startSecs + cumS),
      timePrudentH: toHHMM(startSecs + cumS * sfPrudent),
      nutrDonner,
      alreadyTaken,
      rappel,
      vigilance,
      isHighlight,
    }
  })

  return {
    raceName: race.name,
    raceDate: race.date ?? '',
    athleteName,
    estTimeS,
    timeMinS: timeMin,
    timeMaxS: timeMax,
    raceStartHour,
    checkpoints,
  }
}
