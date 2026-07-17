import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { selectEngineHistoryAtDate, type EngineActivity } from '../src/lib/engineHistory'

const USER = 'user-valid-1'

// Section 23 — VRAIE sensibilité de la projection à une donnée de calibration.
// Ce test ÉCHOUERAIT si la calibration de pente n'était qu'un regroupement d'erreurs
// (fausse validation) : retirer une course qui alimente la calibration DOIT modifier
// réellement la projection.

const DAY = 86_400_000
const now = Date.parse('2026-06-01T08:00:00Z')

// Trail vallonné ~18 km, D+/km élevé → branche trail + calibration de pente.
function steepTrail(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 180; i++) pts.push({ lat: 45, lon: 6 + i * 0.0012, ele: 1000 + 420 * Math.sin(i / 11) })
  return pts
}

let seq = 0
function labeledTrail(daysAgo: number, distM: number, dpkm: number, speed: number): Record<string, unknown> {
  return {
    id: `lt${seq}`, user_id: USER, strava_activity_id: `lt${seq++}`,
    type: 'TrailRun', sport_type: 'TrailRun', distance: distM, moving_time: Math.round(distM / speed),
    total_elevation_gain: (dpkm * distM) / 1000, average_speed: speed, average_heartrate: 155, max_heartrate: 185,
    start_date: new Date(now - daysAgo * DAY).toISOString(), is_race: true, workout_type: 1,
    raw_data: { workout_type: 1 }, deleted_at: null,
  }
}

// Simule le pipeline PRODUCTION : la fenêtre de six mois est sélectionnée AVANT le moteur.
function windowFor(activities: Record<string, unknown>[]): Record<string, unknown>[] {
  return selectEngineHistoryAtDate({
    activities: activities as unknown as EngineActivity[],
    userId: USER,
    asOfMs: now,
  }) as unknown as Record<string, unknown>[]
}

const profile = { fc_max: 185 }
const race = { type: 'TrailRun', goal_time: null }
const ctx = { asOfMs: now }

describe('validation — retirer une donnée de calibration change la projection (section 23)', () => {
  // 3 courses variées → calibration de pente ACTIVE (l'athlète encaisse mal la pente).
  const calibrationRaces = [
    labeledTrail(30, 15000, 15, 3.0),
    labeledTrail(60, 14000, 30, 2.3),
    labeledTrail(90, 16000, 55, 1.8),
  ]

  it('retirer une course de calibration modifie réellement estTimeS', () => {
    const pts = steepTrail()
    const withAll = computeRaceProjection(pts, calibrationRaces, profile, race, null, ctx)
    // On retire la course la plus raide (celle qui porte le signal de pente).
    const without = computeRaceProjection(pts, calibrationRaces.slice(0, 2), profile, race, null, ctx)
    expect(withAll.steepness_calibration_race_count).toBe(3)
    expect(withAll.estTimeS).not.toBeCloseTo(without.estTimeS, 0)
  })

  it('la course évaluée n’entre jamais dans son propre historique (borne asOf stricte)', () => {
    const pts = steepTrail()
    // Une "course" au même instant que asOf est exclue par la sélection de fenêtre.
    const withSelf = windowFor([...calibrationRaces, labeledTrail(0, 18000, 40, 2.0)])
    const proj = computeRaceProjection(pts, withSelf, profile, race, null, ctx)
    expect(proj.steepness_calibration_race_count).toBe(3)
  })

  it('une course future n’est jamais utilisée', () => {
    const pts = steepTrail()
    const withFuture = windowFor([...calibrationRaces, labeledTrail(-10, 18000, 40, 2.0)])
    const proj = computeRaceProjection(pts, withFuture, profile, race, null, ctx)
    expect(proj.steepness_calibration_race_count).toBe(3)
  })

  it('un footing (non course) ne compte pas comme course de calibration', () => {
    const pts = steepTrail()
    const footing = { ...labeledTrail(20, 12000, 25, 2.5), is_race: false, workout_type: 0, raw_data: { workout_type: 0 } }
    const proj = computeRaceProjection(pts, [...calibrationRaces, footing], profile, race, null, ctx)
    expect(proj.steepness_calibration_race_count).toBe(3) // le footing n'entre pas
  })
})
