import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'

// ── Calibration de pente INDIVIDUELLE (apprise sur les courses de l'athlète) ─────
// Si l'athlète ralentit plus que Minetti quand ça devient raide, son allure
// « plat-équivalente » dérive avec le D+/km. Le moteur l'apprend (régression) et
// applique cette sensibilité à la pente de la course — nul sur sa pente habituelle,
// et il ne fait que RALENTIR (jamais accélérer).

// Trail vallonné ~15 km, D+/km ≈ 50 (pente raide → branche trail).
function steepTrail(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45, lon0 = 6, dLon = 0.00127
  for (let i = 0; i < 150; i++) pts.push({ lat: lat0, lon: lon0 + i * dLon, ele: 1000 + 380 * Math.sin(i / 12) })
  return pts
}

const DAY = 86_400_000
const now = Date.parse('2026-06-01T08:00:00Z')

// Course étiquetée (is_race) trail : D+/km + allure contrôlés.
function labeledTrail(daysAgo: number, distM: number, dpkm: number, speed: number): Record<string, unknown> {
  return {
    type: 'TrailRun', sport_type: 'TrailRun', distance: distM, moving_time: Math.round(distM / speed),
    total_elevation_gain: (dpkm * distM) / 1000, average_speed: speed, average_heartrate: 155, max_heartrate: 185,
    start_date: new Date(now - daysAgo * DAY).toISOString(), is_race: true, workout_type: 1,
  }
}

const profile = { fc_max: 185 }
const race = { type: 'TrailRun', goal_time: null }

describe('calibration de pente individuelle', () => {
  it('apprend la sensibilité à la pente et ralentit une course plus raide que d’habitude', () => {
    // 3 courses : plus c'est raide, plus l'allure plat-équivalente est lente
    // (l'athlète encaisse mal la pente au-delà de Minetti).
    const steepSensitive = [
      labeledTrail(30, 15000, 15, 3.0),
      labeledTrail(60, 14000, 30, 2.3),
      labeledTrail(90, 13000, 50, 1.7),
    ]
    const proj = computeRaceProjection(steepTrail(), steepSensitive, profile, race, null, { asOfMs: now })
    const labels = proj.personalAdjustments.map((a) => a.label)
    expect(labels.some((l) => l.startsWith('Calé sur tes courses (pente)'))).toBe(true)
  })

  it('reste NEUTRE (pas de terme de pente) sans étalement de pente suffisant', () => {
    // 3 courses toutes à la même pente → aucune régression possible.
    const flatSpread = [
      labeledTrail(30, 15000, 30, 2.3),
      labeledTrail(60, 14000, 31, 2.28),
      labeledTrail(90, 13000, 29, 2.32),
    ]
    const proj = computeRaceProjection(steepTrail(), flatSpread, profile, race, null, { asOfMs: now })
    const labels = proj.personalAdjustments.map((a) => a.label)
    expect(labels.some((l) => l.startsWith('Calé sur tes courses (pente)'))).toBe(false)
  })

  it('ne fait jamais accélérer : projection ≥ celle sans le signal de pente', () => {
    const steepSensitive = [
      labeledTrail(30, 15000, 15, 3.0),
      labeledTrail(60, 14000, 30, 2.3),
      labeledTrail(90, 13000, 50, 1.7),
    ]
    const withSignal = computeRaceProjection(steepTrail(), steepSensitive, profile, race, null, { asOfMs: now })
    // Une seule course (pas d'apprentissage de pente possible) = référence sans signal.
    const oneRace = [labeledTrail(30, 15000, 15, 3.0)]
    const baseline = computeRaceProjection(steepTrail(), oneRace, profile, race, null, { asOfMs: now })
    expect(withSignal.estTimeS).toBeGreaterThanOrEqual(baseline.estTimeS - 1)
  })

  it('web et mobile identiques', () => {
    const acts = [
      labeledTrail(30, 15000, 15, 3.0),
      labeledTrail(60, 14000, 30, 2.3),
      labeledTrail(90, 13000, 50, 1.7),
    ]
    const web = computeRaceProjection(steepTrail(), acts, profile, race, null, { asOfMs: now })
    const mob = mobileProjection(steepTrail() as never, acts as never, profile as never, race, null, { asOfMs: now })
    expect(web.estTimeS).toBe(mob.estTimeS)
  })
})
