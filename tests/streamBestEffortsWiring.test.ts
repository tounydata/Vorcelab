import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import type { MergedBestEffort } from '../src/lib/bestEfforts'

// DÉCISION (benchmark réel) : les records auto (streams) NE PILOTENT PAS l'allure route
// — l'A/B a montré que ça la dégrade (4.6 %→6.3 %). Ils servent à la durabilité et à
// l'affichage. Ces tests VERROUILLENT ce découplage : les records ne changent pas
// l'allure route. (La durabilité, elle, est testée dans personalFadeWiring.test.ts.)

const now = Date.parse('2026-06-01T08:00:00Z')
const ctx = { asOfMs: now }

// Route plate 10 km (courte → le fade d'endurance ne s'applique pas ici).
function flatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 100; i++) pts.push({ lat: 47, lon: 7 + i * 0.001, ele: 100 })
  return pts
}
const raceRoad = { type: 'Run', goal_time: null }

function footing(daysAgo: number): Record<string, unknown> {
  return {
    type: 'Run', sport_type: 'Run', distance: 8000, moving_time: 2400, average_speed: 3.33,
    average_heartrate: 140, max_heartrate: 185,
    start_date: new Date(now - daysAgo * 86_400_000).toISOString(), is_race: false, workout_type: 0,
  }
}
const activities = [footing(5), footing(12), footing(20)]
const bestEfforts: MergedBestEffort[] = [
  { distanceM: 10000, rawTimeSec: 2400, rawFromDownhill: false, gapTimeSec: 2400 },
]

const projRoad = (profile: Record<string, unknown>) =>
  computeRaceProjection(flatRoad(), activities, profile, raceRoad, null, ctx)

describe('découplage : les records auto ne pilotent pas l’allure route', () => {
  it('used_stream_best_efforts est toujours false (records non utilisés pour l’allure)', () => {
    const proj = projRoad({ fc_max: 185, runner_profile: { bestEfforts } })
    expect(proj.used_stream_best_efforts).toBe(false)
  })

  it('la présence de records ne change PAS l’allure route (courte course)', () => {
    const withRec = projRoad({ fc_max: 185, runner_profile: { bestEfforts } })
    const without = projRoad({ fc_max: 185 })
    expect(withRec.estTimeS).toBeCloseTo(without.estTimeS, 6)
  })

  it('un record en descente n’a aucun effet sur l’allure (records découplés)', () => {
    const a = projRoad({ fc_max: 185, runner_profile: { bestEfforts: [{ distanceM: 10000, rawTimeSec: 2000, rawFromDownhill: true, gapTimeSec: 2600 }] } })
    const none = projRoad({ fc_max: 185 })
    expect(a.estTimeS).toBeCloseTo(none.estTimeS, 6)
  })
})
