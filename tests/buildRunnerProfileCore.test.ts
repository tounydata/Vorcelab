// §1 : le module PUR partagé produit le contrat complet, identique web/mobile, et
// équivalent à l'assemblage du benchmark.
import { describe, it, expect } from 'vitest'
import {
  buildRunnerProfileFromActivitiesAndStreams,
  assembleRunnerProfile,
  type BuildRunnerProfileCoreInput,
} from '../src/lib/buildRunnerProfileCore'
import { buildRunnerProfileFromActivitiesAndStreams as mobileBuild } from '../mobile/src/lib/buildRunnerProfileCore'
import { isRunnerProfileCompatible, RUNNER_PROFILE_SCHEMA_VERSION } from '../src/lib/runnerProfileSchema'
import { buildRunnerProfileAtDate } from '../src/lib/runnerProfileAtDate'
import { buildAthleteBestEfforts } from '../src/lib/bestEfforts'

// Fixture : une sortie trail avec montée régulière + FC, avant la date de référence.
function trailStream(n = 1500) {
  const time: number[] = [], distance: number[] = [], altitude: number[] = [], heartrate: number[] = [], velocity: number[] = []
  let t = 0, d = 0, a = 1000
  for (let i = 0; i < n; i++) {
    time.push(t); distance.push(d); altitude.push(a); heartrate.push(150); velocity.push(3)
    t += 1; d += 3; a += 0.4
  }
  return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude }, heartrate: { data: heartrate }, velocity_smooth: { data: velocity } }
}

const asOfMs = Date.parse('2026-06-01T08:00:00Z')
const activities = [
  { id: 1, strava_activity_id: 'a1', sport_type: 'TrailRun', type: 'TrailRun', start_date: '2026-05-01T08:00:00Z', moving_time: 1500, total_elevation_gain: 600, average_speed: 3, average_heartrate: 150 },
  { id: 2, strava_activity_id: 'a2', sport_type: 'TrailRun', type: 'TrailRun', start_date: '2026-05-15T08:00:00Z', moving_time: 1500, total_elevation_gain: 600, average_speed: 3, average_heartrate: 150 },
]
const streamsByActivityId = { a1: trailStream(), a2: trailStream(1600) }
const input: BuildRunnerProfileCoreInput = { activities, streamsByActivityId, fcMax: 185, asOfMs }

const CONTRACT_KEYS = [
  'schemaVersion', 'computedAt', 'asOfAt', 'historyDays', 'detailedProfileDays',
  'bestEfforts', 'criticalSpeed', 'bestClimb', 'buckets', 'hrDriftPct', 'streamCoverage',
] as const

describe('buildRunnerProfileFromActivitiesAndStreams (§1)', () => {
  it('produit tous les champs du contrat + en-tête de schéma courant', () => {
    const p = buildRunnerProfileFromActivitiesAndStreams(input)
    for (const k of CONTRACT_KEYS) expect(p, `champ manquant : ${k}`).toHaveProperty(k)
    expect(p.schemaVersion).toBe(RUNNER_PROFILE_SCHEMA_VERSION)
    expect(p.historyDays).toBe(183)
    expect(p.detailedProfileDays).toBe(56)
    expect(isRunnerProfileCompatible(p)).toBe(true)
  })

  it('est déterministe et identique web/mobile', () => {
    const a = buildRunnerProfileFromActivitiesAndStreams(input)
    const b = buildRunnerProfileFromActivitiesAndStreams(input)
    expect(a).toEqual(b)
    expect(mobileBuild(input)).toEqual(a)
  })

  it('le full-builder = l’assemblage benchmark (mêmes sous-résultats → même profil)', () => {
    // Reproduit exactement ce que fait le benchmark (atDate 56 j + bestEfforts 183 j).
    const atDate = buildRunnerProfileAtDate({
      activities: activities.map((a) => ({ ...a })),
      activityStreams: streamsByActivityId,
      fcMax: 185,
      asOfDate: new Date(asOfMs).toISOString(),
      windowDays: 56,
    })
    const be = buildAthleteBestEfforts(activities, streamsByActivityId)
    const assembled = assembleRunnerProfile({
      atDateProfile: atDate,
      bestEfforts: { records: be.records, criticalSpeed: be.criticalSpeed, bestClimb: be.bestClimb, bestClimbByTier: be.bestClimbByTier },
      asOfMs,
    })
    expect(buildRunnerProfileFromActivitiesAndStreams(input)).toEqual(assembled)
  })

  it('disableStreamBestEfforts vide les records mais garde le contrat', () => {
    const p = buildRunnerProfileFromActivitiesAndStreams({ ...input, disableStreamBestEfforts: true })
    expect(p.bestEfforts).toEqual([])
    expect(p.criticalSpeed).toBeNull()
    expect(isRunnerProfileCompatible(p)).toBe(true)
  })
})
