import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// ── L'axe DURÉE de l'ancrage accepte les compétitions sur route ───────────────
// Cas réel à l'origine du changement (Trail du Jura Alsacien, 02/08/2026) : trois
// trails confirmés et un semi sur route. L'axe durée exige quatre courses ; en
// écartant le semi, il n'en voyait que trois et restait éteint — la projection
// gardait donc l'allure d'un format court pour un format de quatre heures.

/** Parcours de test : trail vallonné d'environ 30 km. */
function trailCourse(): GpxPoint[] {
  const N = 300
  return Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    return {
      lat: 47.5 + Math.sin(t * Math.PI * 1.4) * 0.03,
      lon: 7.3 + t * 0.09,
      ele: 400 + Math.sin(t * Math.PI * 3) * 180 + t * 120,
    }
  })
}

let clock = Date.parse('2026-08-01T08:00:00Z')
const ctx = { asOfMs: clock }
const profile = { vdot: 46, fc_max: 183, runner_type: 'trail' }
const raceTrail = { type: 'Trail', goal_time: null as string | null }

/** Compétition confirmée (nom explicite + intensité) — route ou trail. */
function race(opts: {
  daysAgo: number; distanceM: number; dplus: number; movingS: number
  trail: boolean; name: string
}) {
  return {
    name: opts.name,
    type: 'Run',
    sport_type: opts.trail ? 'TrailRun' : 'Run',
    distance: opts.distanceM,
    total_elevation_gain: opts.dplus,
    moving_time: opts.movingS,
    elapsed_time: opts.movingS,
    average_speed: opts.distanceM / opts.movingS,
    average_heartrate: 172,
    start_date: new Date(clock - opts.daysAgo * 86_400_000).toISOString(),
    is_race: true,
  }
}

// Trois trails : courts et rapides, comme dans le cas réel.
const troisTrails = [
  race({ daysAgo: 29, distanceM: 15393, dplus: 336, movingS: 5486, trail: true, name: 'Trail des collines' }),
  race({ daysAgo: 50, distanceM: 22168, dplus: 1048, movingS: 10494, trail: true, name: 'Trail Run’in night' }),
  race({ daysAgo: 93, distanceM: 12033, dplus: 488, movingS: 4670, trail: true, name: 'Trail du muguet' }),
]
// Le semi sur route : une vraie compétition, sur un format d'1h45.
const semiRoute = race({ daysAgo: 126, distanceM: 21053, dplus: 66, movingS: 6302, trail: false, name: 'Semi marathon de Mulhouse' })

describe('ancrage — axe durée alimenté par toutes les compétitions à pied', () => {
  it('trois trails seuls : l’axe durée reste éteint faute d’une quatrième course', () => {
    const p = computeRaceProjection(trailCourse(), troisTrails, profile, raceTrail, null, ctx)
    expect(p.duration_calibration_active).toBe(false)
    expect(p.duration_calibration_reason).toBe('not_enough_races')
  })

  it('le semi sur route fournit le quatrième point et allume l’axe durée', () => {
    const p = computeRaceProjection(trailCourse(), [...troisTrails, semiRoute], profile, raceTrail, null, ctx)
    expect(p.duration_calibration_race_count).toBe(4)
    expect(p.duration_calibration_reason).not.toBe('not_enough_races')
  })

  it('l’axe PENTE, lui, reste réservé au terrain : le semi ne le nourrit pas', () => {
    // La sensibilité à la pente ne s'apprend pas sur du plat — le compte des
    // courses de calibration de pente ne bouge pas quand on ajoute la route.
    const sans = computeRaceProjection(trailCourse(), troisTrails, profile, raceTrail, null, ctx)
    const avec = computeRaceProjection(trailCourse(), [...troisTrails, semiRoute], profile, raceTrail, null, ctx)
    expect(avec.steepness_calibration_race_count).toBe(sans.steepness_calibration_race_count)
  })

  it('une course sur ROUTE continue de se caler sur toutes les courses (inchangé)', () => {
    const raceRoute = { type: 'Route', goal_time: null as string | null }
    const flat: GpxPoint[] = Array.from({ length: 201 }, (_, i) => ({ lat: 47.5, lon: 7.3 + i * 0.0009, ele: 240 }))
    const p = computeRaceProjection(flat, [...troisTrails, semiRoute], profile, raceRoute, null, ctx)
    // Le pool route était déjà « toutes courses » : le comportement ne change pas.
    expect(p.duration_calibration_race_count).toBe(4)
  })

  it('projette plus lentement une fois l’axe durée allumé (le format long cesse d’hériter de l’allure d’un format court)', () => {
    const sans = computeRaceProjection(trailCourse(), troisTrails, profile, raceTrail, null, ctx)
    const avec = computeRaceProjection(trailCourse(), [...troisTrails, semiRoute], profile, raceTrail, null, ctx)
    expect(avec.estTimeS).toBeGreaterThan(sans.estTimeS)
  })
})
