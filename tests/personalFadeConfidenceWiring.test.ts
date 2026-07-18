import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'
import type { MergedBestEffort, BestEffortSource } from '../src/lib/bestEfforts'

const now = Date.parse('2026-06-01T08:00:00Z')
const ctx = { asOfMs: now }

function longRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 560; i++) pts.push({ lat: 47, lon: 7 + i * 0.001, ele: 100 })
  return pts
}
const raceRoad = { type: 'Run', goal_time: null }
function longRun(daysAgo: number): Record<string, unknown> {
  return {
    type: 'Run', sport_type: 'Run', distance: 20000, moving_time: 7200, average_speed: 2.78,
    average_heartrate: 150, max_heartrate: 185,
    start_date: new Date(now - daysAgo * 86_400_000).toISOString(), is_race: false, workout_type: 0,
  }
}
const activities = [longRun(7), longRun(14), longRun(21)]

function src(activityId: string): BestEffortSource {
  return {
    activityId, activityDate: '2026-05-01T08:00:00Z', sportType: 'Run',
    rawTimeSec: 0, gapTimeSec: 0, suspectDownhill: false, hasTimeGap: false, altitudeCoveragePct: 100,
  }
}

// Records Riegel, avec provenance contrôlée (une ou plusieurs activités).
function records(a: number, b: number, ids: string[]): MergedBestEffort[] {
  return [5000, 10000, 21097].map((D, i) => {
    const t = Math.round(a * D ** b)
    const s = src(ids[i % ids.length])
    return { distanceM: D, rawTimeSec: t, rawFromDownhill: false, gapTimeSec: t, gapSource: { ...s, rawTimeSec: t, gapTimeSec: t } }
  })
}

describe('branchement des garde-fous de durabilité dans la projection (§6/§19.1)', () => {
  it('trois records d’UNE SEULE activité n’activent PAS le fade personnel', () => {
    const profile = { fc_max: 185, runner_profile: { bestEfforts: records(0.2, 1.08, ['solo']) } }
    const proj = computeRaceProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    expect(proj.personal_fade_distinct_activity_count).toBe(1)
    expect(proj.used_personal_fade).toBe(false)
    expect(proj.personal_fade_confidence).not.toBe('high')
  })

  it('trois records de deux activités distinctes activent le fade (medium)', () => {
    const profile = { fc_max: 185, runner_profile: { bestEfforts: records(0.2, 1.08, ['a', 'b', 'a']) } }
    const proj = computeRaceProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    expect(proj.personal_fade_distinct_activity_count).toBe(2)
    expect(proj.used_personal_fade).toBe(true)
    expect(proj.personal_fade_confidence).toBe('medium')
    expect(proj.personal_fade_reason).toBe('personal')
  })

  it('les records en descente suspecte sont exclus de l’activation (§19.4)', () => {
    const recs = records(0.2, 1.08, ['a', 'b', 'c'])
    // Marque toutes les sources comme descente suspecte → exclues → plus assez d'efforts.
    for (const r of recs) { r.rawFromDownhill = true; if (r.gapSource) r.gapSource.suspectDownhill = true }
    const profile = { fc_max: 185, runner_profile: { bestEfforts: recs } }
    const proj = computeRaceProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    expect(proj.used_personal_fade).toBe(false)
    expect(proj.personal_fade_effort_count).toBe(0)
  })

  it('les diagnostics de durabilité sont toujours exposés', () => {
    const proj = computeRaceProjection(longRoad(), activities, { fc_max: 185 }, raceRoad, null, ctx)
    expect(proj).toHaveProperty('personal_fade_r2')
    expect(proj).toHaveProperty('personal_fade_confidence')
    expect(proj).toHaveProperty('personal_fade_spread_ratio')
    expect(proj.personal_fade_confidence).toBe('none')
  })

  it('parité web/mobile des diagnostics de durabilité', () => {
    const profile = { fc_max: 185, runner_profile: { bestEfforts: records(0.2, 1.09, ['a', 'b', 'c']) } }
    const web = computeRaceProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    const mob = mobileProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    expect(mob.personal_fade_confidence).toBe(web.personal_fade_confidence)
    expect(mob.personal_fade_distinct_activity_count).toBe(web.personal_fade_distinct_activity_count)
    expect(mob.used_personal_fade).toBe(web.used_personal_fade)
  })
})
