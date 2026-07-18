import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'

// Parcours PLAT (route) : aucun D+ → aucune fatigue globale de montée.
function flatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < 300; i++) pts.push({ lat: 47, lon: 7 + i * 0.001, ele: 100 })
  return pts
}

// Trail très vertical : oscillations d'altitude marquées → beaucoup de D+ cumulé.
function bigClimbTrail(amp: number, n = 300): GpxPoint[] {
  const pts: GpxPoint[] = []
  for (let i = 0; i < n; i++) pts.push({ lat: 45, lon: 6 + i * 0.0012, ele: 1000 + amp * Math.sin(i / 4) })
  return pts
}

// Profil coureur avec buckets de montée VAM fiables (déclenche le chemin VAM où la
// fatigue globale s'applique réellement au temps).
const vamProfile = {
  fc_max: 190,
  runner_profile: {
    buckets: {
      mod_up: { avgSpeedKmH: 6, vamMH: 900, confidence: 'high', cardioCost: 'medium', status: 'solide' },
      steep_up: { avgSpeedKmH: 4, vamMH: 800, confidence: 'high', cardioCost: 'medium', status: 'solide' },
      flat: { avgSpeedKmH: 11, vamMH: null, confidence: 'high', cardioCost: 'low', status: 'solide' },
      mild_down: { avgSpeedKmH: 12, vamMH: null, confidence: 'high', cardioCost: 'low', status: 'solide' },
    },
  },
}
function trailRun(): Record<string, unknown> {
  return {
    type: 'TrailRun', sport_type: 'TrailRun', distance: 12000, total_elevation_gain: 600,
    moving_time: 4200, average_speed: 12000 / 4200, average_heartrate: 150, max_heartrate: 190,
    start_date: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  }
}
const trailRace = { type: 'Trail' as const, goal_time: null }
const roadRace = { type: 'Run', goal_time: null }

describe('global_climb_fatigue_v1 — diagnostics (§10/§20)', () => {
  it('aucune pénalité sur un parcours plat', () => {
    const p = computeRaceProjection(flatRoad(), [], { fc_max: 185 }, roadRace)
    expect(p.global_climb_fatigue_active).toBe(false)
    expect(p.global_climb_fatigue_seconds_added).toBe(0)
    expect(p.global_climb_fatigue_max_multiplier).toBe(1)
  })

  it('devient active dès qu’un D+ significatif s’accumule', () => {
    const p = computeRaceProjection(bigClimbTrail(180), [trailRun(), trailRun()], vamProfile, trailRace)
    expect(p.global_climb_fatigue_active).toBe(true)
    expect(p.global_climb_fatigue_max_multiplier).toBeGreaterThan(1)
  })

  it('le multiplicateur reste plafonné à 1.18 (cap respecté, valeurs inchangées)', () => {
    // Très gros D+ cumulé (>2500 m) → plafond 0.18 atteint.
    const p = computeRaceProjection(bigClimbTrail(220, 600), [trailRun(), trailRun()], vamProfile, trailRace)
    expect(p.global_climb_fatigue_max_multiplier).toBeLessThanOrEqual(1.18)
    expect(p.global_climb_fatigue_max_multiplier).toBeCloseTo(1.18, 2)
  })

  it('les secondes ajoutées sont exposées et jamais négatives', () => {
    const p = computeRaceProjection(bigClimbTrail(180), [trailRun(), trailRun()], vamProfile, trailRace)
    expect(p.global_climb_fatigue_seconds_added).toBeGreaterThanOrEqual(0)
    // Avec un chemin VAM actif sur un gros vertical, des secondes sont réellement ajoutées.
    expect(p.global_climb_fatigue_seconds_added).toBeGreaterThan(0)
  })

  it('parité web/mobile des diagnostics de fatigue globale', () => {
    const acts = [trailRun(), trailRun()]
    const web = computeRaceProjection(bigClimbTrail(180), acts, vamProfile, trailRace)
    const mob = mobileProjection(bigClimbTrail(180), acts, vamProfile, trailRace)
    expect(mob.global_climb_fatigue_active).toBe(web.global_climb_fatigue_active)
    expect(mob.global_climb_fatigue_max_multiplier).toBe(web.global_climb_fatigue_max_multiplier)
    expect(mob.global_climb_fatigue_seconds_added).toBe(web.global_climb_fatigue_seconds_added)
  })
})
