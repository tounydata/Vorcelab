import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// Calibration de l'intervalle de confiance (issue du banc réel) : la fourchette doit
// englober l'incertitude terrain. Le trail (D+/km élevé) doit être PLUS LARGE que la
// route (erreurs ~±5 %), et les bornes rester ordonnées autour de la projection centrale.

function flatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0, dLon = 0.00127 // ~100 m/point, plat
  for (let i = 0; i < 100; i++) pts.push({ lat: lat0, lon: lon0 + i * dLon, ele: 100 })
  return pts
}
function steepTrail(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0, dLon = 0.00127 // ~40 m/km D+ (trail vallonné réaliste)
  for (let i = 0; i < 100; i++) pts.push({ lat: lat0, lon: lon0 + i * dLon, ele: 1000 + 120 * Math.sin(i / 8) })
  return pts
}
function run(type: string, distM: number, dplus: number, paceSecPerKm: number): Record<string, unknown> {
  return {
    type, sport_type: type, distance: distM, total_elevation_gain: dplus,
    moving_time: (distM / 1000) * paceSecPerKm, average_speed: 1000 / paceSecPerKm,
    average_heartrate: 150, max_heartrate: 190,
    start_date: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  }
}

const roadActs = [run('Run', 10000, 30, 300), run('Run', 12000, 40, 305), run('Run', 8000, 20, 295)]
const trailActs = [run('TrailRun', 12000, 450, 420), run('TrailRun', 15000, 600, 430), run('TrailRun', 10000, 350, 410)]

function halfWidth(p: { estTimeS: number; timeMin: number; timeMax: number }): number {
  return (p.timeMax - p.timeMin) / 2 / p.estTimeS
}

describe('intervalle de confiance — calibré (banc réel)', () => {
  it('bornes ordonnées autour de la projection centrale', () => {
    const p = computeRaceProjection(steepTrail(), trailActs, {}, { type: 'Trail', goal_time: null })
    expect(p.timeMin).toBeLessThan(p.estTimeS)
    expect(p.timeMax).toBeGreaterThan(p.estTimeS)
  })

  it('le trail (D+/km élevé) a une fourchette plus large que la route', () => {
    const road = computeRaceProjection(flatRoad(), roadActs, {}, { type: 'Run', goal_time: null })
    const trail = computeRaceProjection(steepTrail(), trailActs, {}, { type: 'Trail', goal_time: null })
    expect(halfWidth(trail)).toBeGreaterThan(halfWidth(road))
  })

  it('les intervalles ne sont plus étriqués : trail ≥ ±8 %, route ≥ ±5 %', () => {
    const road = computeRaceProjection(flatRoad(), roadActs, {}, { type: 'Run', goal_time: null })
    const trail = computeRaceProjection(steepTrail(), trailActs, {}, { type: 'Trail', goal_time: null })
    expect(halfWidth(trail)).toBeGreaterThanOrEqual(0.08)
    expect(halfWidth(road)).toBeGreaterThanOrEqual(0.05)
    expect(halfWidth(trail)).toBeLessThanOrEqual(0.301) // plafond 0.30 (tolérance flottante)
  })
})
