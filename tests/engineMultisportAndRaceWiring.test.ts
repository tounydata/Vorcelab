import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'

// Wiring de isEligiblePersonalCalibrationRace dans le FIC / l'ancrage / la calibration
// de pente + séparation multisport de la charge (décision produit).

const DAY = 86_400_000
const now = Date.parse('2026-06-01T08:00:00Z')
const ctx = { asOfMs: now }
const profile = { fc_max: 185 }

// Trail vallonné ~18 km (D+/km élevé → branche trail + calibration de pente).
function steepTrail(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 180; i++) pts.push({ lat: 45, lon: 6 + i * 0.0012, ele: 1000 + 420 * Math.sin(i / 11) })
  return pts
}
const raceTrail = { type: 'TrailRun', goal_time: null }

let seq = 0
function trail(daysAgo: number, distM: number, dpkm: number, speed: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `t${seq}`, strava_activity_id: `t${seq++}`,
    type: 'TrailRun', sport_type: 'TrailRun', distance: distM, moving_time: Math.round(distM / speed),
    elapsed_time: Math.round(distM / speed) + 30,
    total_elevation_gain: (dpkm * distM) / 1000, average_speed: speed, average_heartrate: 155, max_heartrate: 185,
    start_date: new Date(now - daysAgo * DAY).toISOString(), is_race: true, workout_type: 1,
    raw_data: { workout_type: 1 }, deleted_at: null, ...extra,
  }
}

describe('wiring compétitions confirmées (FIC / ancrage / calibration de pente)', () => {
  // 3 courses confirmées variées → calibration active.
  const confirmed = [
    trail(30, 15000, 15, 3.0, { name: 'Trail des Crêtes' }),
    trail(60, 14000, 30, 2.3, { name: '10 km nature' }),
    trail(90, 16000, 55, 1.8, { name: 'Kilomètre Vertical' }),
  ]

  it('un « footing » ÉTIQUETÉ course (is_race=true) n’alimente PAS la calibration', () => {
    const withFooting = [
      ...confirmed,
      trail(20, 12000, 40, 2.5, { name: 'Footing récup' }), // nom → exclu
    ]
    const proj = computeRaceProjection(steepTrail(), withFooting, profile, raceTrail, null, ctx)
    // Le footing étiqueté est exclu → 3 courses de calibration, pas 4.
    expect(proj.steepness_calibration_race_count).toBe(3)
  })

  it('un échauffement étiqueté course est exclu de l’ancrage', () => {
    const withWarmup = [
      ...confirmed,
      trail(15, 13000, 35, 2.4, { name: 'Échauffement avant course' }),
    ]
    const proj = computeRaceProjection(steepTrail(), withWarmup, profile, raceTrail, null, ctx)
    expect(proj.steepness_calibration_race_count).toBe(3)
  })

  it('une vitesse invraisemblable (labeled mais artefact) est exclue', () => {
    // speed 8 m/s ≈ 2:05/km sur 14 km → au-delà du record → rejet.
    const withArtifact = [...confirmed, trail(25, 14000, 30, 8.0, { name: 'GPS bug' })]
    const proj = computeRaceProjection(steepTrail(), withArtifact, profile, raceTrail, null, ctx)
    expect(proj.steepness_calibration_race_count).toBe(3)
  })

  it('trois vraies compétitions confirmées activent bien la calibration', () => {
    const proj = computeRaceProjection(steepTrail(), confirmed, profile, raceTrail, null, ctx)
    expect(proj.steepness_calibration_race_count).toBe(3)
    expect(proj.steepness_calibration_reason).toBe('active')
  })

  it('web et mobile appliquent le même filtrage', () => {
    const withFooting = [...confirmed, trail(20, 12000, 40, 2.5, { name: 'Footing récup' })]
    const web = computeRaceProjection(steepTrail(), withFooting, profile, raceTrail, null, ctx)
    const mob = mobileProjection(steepTrail(), withFooting, profile, raceTrail, null, ctx)
    expect(mob.steepness_calibration_race_count).toBe(web.steepness_calibration_race_count)
    expect(mob.estTimeS).toBeCloseTo(web.estTimeS, 6)
  })
})

// ── Séparation multisport de la charge ───────────────────────────────────────
// Route plate ~10 km pour un test de charge/allure propre.
function flatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 100; i++) pts.push({ lat: 47, lon: 7 + i * 0.001, ele: 100 })
  return pts
}
const raceRoad = { type: 'Run', goal_time: null }

function road(daysAgo: number, speed: number): Record<string, unknown> {
  return {
    id: `r${seq}`, strava_activity_id: `r${seq++}`,
    type: 'Run', sport_type: 'Run', distance: 10000, moving_time: Math.round(10000 / speed),
    elapsed_time: Math.round(10000 / speed) + 10, total_elevation_gain: 30, average_speed: speed,
    average_heartrate: 150, max_heartrate: 185, start_date: new Date(now - daysAgo * DAY).toISOString(),
    is_race: false, workout_type: 0, raw_data: { workout_type: 0 }, deleted_at: null,
  }
}
function bike(daysAgo: number): Record<string, unknown> {
  return {
    id: `b${seq}`, strava_activity_id: `b${seq++}`,
    type: 'Ride', sport_type: 'Ride', distance: 40000, moving_time: 5400, elapsed_time: 5500,
    total_elevation_gain: 300, average_speed: 7.4, average_heartrate: 150, max_heartrate: 185,
    start_date: new Date(now - daysAgo * DAY).toISOString(), is_race: false, workout_type: 0,
    raw_data: { workout_type: 0 }, deleted_at: null,
  }
}

describe('séparation multisport de la charge', () => {
  // Historique running de base (réparti pour une charge chronique établie).
  const runs = Array.from({ length: 14 }, (_, i) => road(3 + i * 3, 3.3))

  it('une grosse charge vélo récente pèse sur la charge générale (fatigue) sans toucher l’allure', () => {
    // Bloc vélo intense sur les 7 derniers jours → ACWR aigu ↑.
    const bikeBlock = [bike(1), bike(2), bike(3), bike(4), bike(5)]
    const withoutBike = computeRaceProjection(flatRoad(), runs, profile, raceRoad, null, ctx)
    const withBike = computeRaceProjection(flatRoad(), [...runs, ...bikeBlock], profile, raceRoad, null, ctx)
    // L'allure de base (running) est IDENTIQUE : le vélo n'alimente pas les allures.
    expect(withBike.basePaceS).toBeCloseTo(withoutBike.basePaceS, 6)
    // Mais la charge générale change la projection (fatigue) → temps ≥ (jamais plus rapide).
    expect(withBike.estTimeS).toBeGreaterThanOrEqual(withoutBike.estTimeS)
  })

  it('une activité vélo n’est jamais comptée comme course de calibration', () => {
    const bikeAsRace = { ...bike(20), is_race: true, workout_type: 1, raw_data: { workout_type: 1 } }
    const proj = computeRaceProjection(flatRoad(), [...runs, bikeAsRace], profile, raceRoad, null, ctx)
    // Un vélo étiqueté course reste exclu (sport ≠ running).
    expect(proj.steepness_calibration_race_count).toBe(0)
  })
})
