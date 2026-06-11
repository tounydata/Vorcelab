import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// Tracé route quasi plat ~5 km (pas de buckets → branche basePace route).
function flatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0, dLon = 0.00127 // ~100 m/point
  for (let i = 0; i < 50; i++) pts.push({ lat: lat0, lon: lon0 + i * dLon, ele: 100 })
  return pts
}

// Course route ÉTIQUETÉE (Strava « Course ») : 10 km plat en 40 min (4:00/km).
function labeledRoad10k(workoutType: number): Record<string, unknown> {
  return {
    type: 'Run', sport_type: 'Run',
    distance: 10000, total_elevation_gain: 30, moving_time: 2400,
    average_speed: 10000 / 2400, start_date: new Date(Date.now() - 20 * 86400000).toISOString(),
    raw_data: { workout_type: workoutType },
  }
}

const road = flatRoad()
const race = { type: 'Route' as const, goal_time: null }

describe('Convergence route — VDOT auto dans la projection (sans saisie manuelle)', () => {
  it('utilise les courses étiquetées au lieu du repli générique', () => {
    const withLabel = computeRaceProjection(road, [labeledRoad10k(1)], {}, race)
    const noData = computeRaceProjection(road, [], {}, race)
    // 4:00/km appris > 5:20/km générique → projection plus rapide.
    expect(withLabel.estTimeS).toBeLessThan(noData.estTimeS)
  })

  it('n\'utilise PAS une sortie non étiquetée course (pas d\'invention)', () => {
    const withNonRace = computeRaceProjection(road, [labeledRoad10k(0)], {}, race)
    const noData = computeRaceProjection(road, [], {}, race)
    expect(withNonRace.estTimeS).toBe(noData.estTimeS) // repli générique inchangé
  })

  it('le PR manuel reste prioritaire sur la course auto (manuel > auto)', () => {
    const acts = [labeledRoad10k(1)] // auto : 4:00/km
    const manualSlower = { prs: { '10k': { timeS: 3000, dist: 10000 } } } // 5:00/km
    const withAuto = computeRaceProjection(road, acts, {}, race)
    const withManual = computeRaceProjection(road, acts, manualSlower, race)
    // même historique (même progressionFactor) → seul le PR change : le manuel (plus lent) prime.
    expect(withManual.estTimeS).toBeGreaterThan(withAuto.estTimeS)
  })
})
