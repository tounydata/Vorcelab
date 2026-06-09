import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// Petit tracé trail : plat puis une bosse douce (faux-plat montant) puis plat.
// ~6 km, qq centaines de m de D+, assez pour activer le chemin "buckets".
function buildPoints(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0
  // ~100 m entre points en longitude à cette latitude (~0.00127°)
  const dLon = 0.00127
  for (let i = 0; i < 80; i++) {
    // élévation : plat (0-20), montée douce ~5% (20-50), descente (50-80)
    let ele = 200
    if (i >= 20 && i < 50) ele = 200 + (i - 20) * 5          // +5 m / 100 m = 5%
    else if (i >= 50) ele = 350 - (i - 50) * 5
    pts.push({ lat: lat0, lon: lon0 + i * dLon, ele })
  }
  return pts
}

// Buckets appris (allure d'entraînement), haute confiance.
const profile = {
  runner_profile: {
    buckets: {
      flat:    { avgSpeedKmH: 10.0, vamMH: null, confidence: 'high', cardioCost: 'medium', status: 'ok' },
      mild_up: { avgSpeedKmH: 8.5,  vamMH: 500,  confidence: 'high', cardioCost: 'medium', status: 'ok' },
      mod_up:  { avgSpeedKmH: 7.5,  vamMH: 650,  confidence: 'high', cardioCost: 'medium', status: 'ok' },
      mild_down: { avgSpeedKmH: 11.0, vamMH: null, confidence: 'high', cardioCost: 'medium', status: 'ok' },
      mod_down:  { avgSpeedKmH: 11.5, vamMH: null, confidence: 'high', cardioCost: 'medium', status: 'ok' },
    },
  },
}

function raceActivity(workoutType: number): Record<string, unknown> {
  // Course trail rapide : 10 km, 300 m D+, ~10 km/h réel → plat-équiv > bucket plat.
  return {
    type: 'TrailRun', sport_type: 'TrailRun',
    distance: 10000, total_elevation_gain: 300, moving_time: 3600,
    average_speed: 2.8, start_date: new Date(Date.now() - 30 * 86400000).toISOString(),
    raw_data: { workout_type: workoutType },
  }
}

const points = buildPoints()
const race = { type: 'Trail' as const, goal_time: null }

describe('Facteur d\'Intensité de Course (FIC)', () => {
  it('une course étiquetée accélère la projection (effort course > entraînement)', () => {
    const withRace = computeRaceProjection(points, [raceActivity(1)], profile, race)
    const without = computeRaceProjection(points, [raceActivity(0)], profile, race)
    expect(withRace.estTimeS).toBeLessThan(without.estTimeS)
    // Gain cohérent avec un FIC ~1.2 (≈ -15 à -20 %)
    const ratio = withRace.estTimeS / without.estTimeS
    expect(ratio).toBeGreaterThan(0.78)
    expect(ratio).toBeLessThan(0.92)
  })

  it('affiche l\'ajustement « Allure de course »', () => {
    const withRace = computeRaceProjection(points, [raceActivity(1)], profile, race)
    expect(withRace.personalAdjustments.some((a) => a.label.startsWith('Allure de course'))).toBe(true)
  })

  it('aucune course étiquetée → projection inchangée (pas de régression)', () => {
    const a = computeRaceProjection(points, [raceActivity(0)], profile, race)
    const b = computeRaceProjection(points, [], profile, race)
    expect(a.estTimeS).toBe(b.estTimeS)
    expect(a.personalAdjustments.some((x) => x.label.startsWith('Allure de course'))).toBe(false)
  })

  it('le FIC est plafonné (jamais > +50 %)', () => {
    // Course absurdement rapide → le plafond protège.
    const insane = { ...raceActivity(1), average_speed: 8, total_elevation_gain: 50 }
    const withRace = computeRaceProjection(points, [insane], profile, race)
    const without = computeRaceProjection(points, [raceActivity(0)], profile, race)
    expect(withRace.estTimeS / without.estTimeS).toBeGreaterThanOrEqual(1 / 1.5 - 0.001)
  })
})
