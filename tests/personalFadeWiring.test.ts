import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'
import type { MergedBestEffort } from '../src/lib/bestEfforts'

const now = Date.parse('2026-06-01T08:00:00Z')
const ctx = { asOfMs: now }

// Longue route ~43 km (≈ 550 points), plate → l'extrapolation au-delà du vécu déclenche
// le fade d'endurance.
function longRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 560; i++) pts.push({ lat: 47, lon: 7 + i * 0.001, ele: 100 })
  return pts
}
const raceRoad = { type: 'Run', goal_time: null }

// Une plus longue sortie de 20 km / 2 h (borne du fade = « ta plus longue sortie »).
function longRun(daysAgo: number): Record<string, unknown> {
  return {
    type: 'Run', sport_type: 'Run', distance: 20000, moving_time: 7200, average_speed: 2.78,
    average_heartrate: 150, max_heartrate: 185,
    start_date: new Date(now - daysAgo * 86_400_000).toISOString(), is_race: false, workout_type: 0,
  }
}
const activities = [longRun(7), longRun(14), longRun(21)]

// Records suivant T = a·D^b → impose l'exposant d'endurance appris.
// Records avec provenance DISTINCTE (une activité par distance) : condition d'un vrai profil.
function recordsWithExponent(a: number, b: number): MergedBestEffort[] {
  return [5000, 10000, 21097].map((D, i) => {
    const t = Math.round(a * D ** b)
    const src = {
      activityId: `act-${i}`, activityDate: '2026-05-01', sportType: 'Run',
      rawTimeSec: t, gapTimeSec: t, suspectDownhill: false, hasTimeGap: false, altitudeCoveragePct: 100,
    }
    return { distanceM: D, rawTimeSec: t, rawFromDownhill: false, gapTimeSec: t, rawSource: src, gapSource: src }
  })
}

describe('branchement de la durabilité personnelle (fade) dans la projection', () => {
  it('sans records, le fade reste sur l’exposant fixe (used_personal_fade=false)', () => {
    const proj = computeRaceProjection(longRoad(), activities, { fc_max: 185 }, raceRoad, null, ctx)
    expect(proj.used_personal_fade).toBe(false)
    expect(proj.personal_fade_exponent).toBeNull()
  })

  it('avec des records étalés, le fade utilise l’exposant PERSONNEL appris', () => {
    const profile = { fc_max: 185, runner_profile: { bestEfforts: recordsWithExponent(0.2, 1.08) } }
    const proj = computeRaceProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    expect(proj.used_personal_fade).toBe(true)
    expect(proj.personal_fade_exponent!).toBeGreaterThan(1.01)
    expect(proj.personal_fade_exponent!).toBeLessThanOrEqual(1.2)
  })

  it('un coureur qui s’effondre (exposant élevé) est projeté PLUS LENT sur le long', () => {
    const durable = { fc_max: 185, runner_profile: { bestEfforts: recordsWithExponent(0.2, 1.02) } }
    const fades = { fc_max: 185, runner_profile: { bestEfforts: recordsWithExponent(0.2, 1.15) } }
    const pDurable = computeRaceProjection(longRoad(), activities, durable, raceRoad, null, ctx)
    const pFades = computeRaceProjection(longRoad(), activities, fades, raceRoad, null, ctx)
    // Même allure de base (mêmes records courts), mais fade plus raide → plus lent.
    expect(pFades.estTimeS).toBeGreaterThan(pDurable.estTimeS)
  })

  it('parité web/mobile', () => {
    const profile = { fc_max: 185, runner_profile: { bestEfforts: recordsWithExponent(0.2, 1.1) } }
    const web = computeRaceProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    const mob = mobileProjection(longRoad(), activities, profile, raceRoad, null, ctx)
    expect(mob.estTimeS).toBeCloseTo(web.estTimeS, 6)
    expect(mob.personal_fade_exponent).toBe(web.personal_fade_exponent)
  })
})
