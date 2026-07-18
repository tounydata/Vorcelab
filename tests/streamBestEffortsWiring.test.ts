import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'
import type { MergedBestEffort } from '../src/lib/bestEfforts'

const now = Date.parse('2026-06-01T08:00:00Z')
const ctx = { asOfMs: now }

// Route plate 10 km.
function flatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 100; i++) pts.push({ lat: 47, lon: 7 + i * 0.001, ele: 100 })
  return pts
}
const raceRoad = { type: 'Run', goal_time: null }

// Footings NON étiquetés course → deriveAutoPrs (qui exige l'étiquette) reste vide.
function footing(daysAgo: number): Record<string, unknown> {
  return {
    type: 'Run', sport_type: 'Run', distance: 8000, moving_time: 2400, average_speed: 3.33,
    average_heartrate: 140, max_heartrate: 185,
    start_date: new Date(now - daysAgo * 86_400_000).toISOString(), is_race: false, workout_type: 0,
  }
}
const activities = [footing(5), footing(12), footing(20)]

const bestEfforts: MergedBestEffort[] = [
  // 10 km « équivalent plat » en 2400 s = 4:00/km (bien plus rapide que le repli 5:20).
  { distanceM: 10000, rawTimeSec: 2400, rawFromDownhill: false, gapTimeSec: 2400 },
]

const projRoad = (profile: Record<string, unknown>) =>
  computeRaceProjection(flatRoad(), activities, profile, raceRoad, null, ctx)

describe('branchement des records auto dans la projection route', () => {
  it('sans records auto, la projection retombe sur le repli (et used=false)', () => {
    const proj = projRoad({ fc_max: 185 })
    expect(proj.used_stream_best_efforts).toBe(false)
  })

  it('avec records auto, la projection les utilise et devient plus fidèle (plus rapide ici)', () => {
    const withRec = projRoad({ fc_max: 185, runner_profile: { bestEfforts } })
    const without = projRoad({ fc_max: 185 })
    expect(withRec.used_stream_best_efforts).toBe(true)
    // Un vrai 10 km à 4:00/km projette plus vite que le repli générique.
    expect(withRec.estTimeS).toBeLessThan(without.estTimeS)
  })

  it('un record en DESCENTE : le brut est IGNORÉ, seule la valeur équivalent-plat compte', () => {
    // Même valeur équivalent-plat (2600), chrono brut très différent (2000 vs 9999).
    const a = projRoad({ fc_max: 185, runner_profile: { bestEfforts: [{ distanceM: 10000, rawTimeSec: 2000, rawFromDownhill: true, gapTimeSec: 2600 }] } })
    const b = projRoad({ fc_max: 185, runner_profile: { bestEfforts: [{ distanceM: 10000, rawTimeSec: 9999, rawFromDownhill: true, gapTimeSec: 2600 }] } })
    // Le chrono brut n'influence pas la projection : seule la valeur équivalent-plat le fait.
    expect(a.estTimeS).toBeCloseTo(b.estTimeS, 6)

    // Et la valeur équivalent-plat, elle, pilote bien l'allure (2600 plus lent que 2400).
    const slower = projRoad({ fc_max: 185, runner_profile: { bestEfforts: [{ distanceM: 10000, rawTimeSec: 2600, rawFromDownhill: false, gapTimeSec: 2600 }] } })
    const faster = projRoad({ fc_max: 185, runner_profile: { bestEfforts } }) // gap 2400
    expect(slower.estTimeS).toBeGreaterThan(faster.estTimeS)
  })

  it('parité web/mobile', () => {
    const profile = { fc_max: 185, runner_profile: { bestEfforts } }
    const web = computeRaceProjection(flatRoad(), activities, profile, raceRoad, null, ctx)
    const mob = mobileProjection(flatRoad(), activities, profile, raceRoad, null, ctx)
    expect(mob.estTimeS).toBeCloseTo(web.estTimeS, 6)
    expect(mob.used_stream_best_efforts).toBe(web.used_stream_best_efforts)
  })
})
