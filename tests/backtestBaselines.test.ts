import { describe, it, expect } from 'vitest'
import {
  effortKm,
  baselinePredict,
  computeBaselineMetrics,
  BASELINE_NAMES,
  RIEGEL_EXPONENT,
  type BaselineRaceInput,
} from '../src/lib/backtestBaselines'

function race(over: Partial<BaselineRaceInput>): BaselineRaceInput {
  return {
    athleteId: 'A', raceId: 'r', distanceKm: 10, dplusM: 0,
    actualMovingS: 3000, actualElapsedS: 3000, predictedNoBeS: 3000, ...over,
  }
}

describe('backtestBaselines (§15)', () => {
  it('effortKm ajoute 1 km par 100 m de D+', () => {
    expect(effortKm(10, 0)).toBe(10)
    expect(effortKm(10, 500)).toBe(15)
  })

  it('riegel_distance_only applique T2 = T1·(D2/D1)^1.06', () => {
    const target = race({ raceId: 't', distanceKm: 20 })
    const refs = [race({ raceId: 'ref', distanceKm: 10, actualMovingS: 2400 }), target]
    const pred = baselinePredict('riegel_distance_only', target, refs, 'moving')!
    expect(pred).toBeCloseTo(2400 * 2 ** RIEGEL_EXPONENT, 0)
  })

  it('previous_engine_version reprend predicted_s_no_be', () => {
    const target = race({ raceId: 't', predictedNoBeS: 3333 })
    expect(baselinePredict('previous_engine_version', target, [target], 'moving')).toBe(3333)
  })

  it('recent_average_pace ignore le D+ (allure plate × distance)', () => {
    const target = race({ raceId: 't', distanceKm: 10, dplusM: 800 })
    const refs = [race({ raceId: 'r1', distanceKm: 5, dplusM: 0, actualMovingS: 1500 }), target] // 300 s/km
    const pred = baselinePredict('recent_average_pace', target, refs, 'moving')!
    expect(pred).toBeCloseTo(3000, 0) // 300 s/km × 10 km, D+ ignoré
  })

  it('kilometre_effort tient compte du D+ (allure par km-effort)', () => {
    // Réf : 10 km + 500 m D+ = 15 km-effort en 4500 s → 300 s/km-effort.
    const ref = race({ raceId: 'r1', distanceKm: 10, dplusM: 500, actualMovingS: 4500 })
    const target = race({ raceId: 't', distanceKm: 20, dplusM: 1000 }) // 30 km-effort
    const pred = baselinePredict('kilometre_effort', target, [ref, target], 'moving')!
    expect(pred).toBeCloseTo(9000, 0) // 300 × 30
  })

  it('best_similar_past_race choisit la course la plus proche en D+/km', () => {
    const flat = race({ raceId: 'flat', distanceKm: 10, dplusM: 50, actualMovingS: 2500 })
    const steep = race({ raceId: 'steep', distanceKm: 10, dplusM: 1000, actualMovingS: 5000 })
    const target = race({ raceId: 't', distanceKm: 10, dplusM: 950 }) // proche de steep
    const pred = baselinePredict('best_similar_past_race', target, [flat, steep, target], 'moving')!
    // Échelle par km-effort : steep effort=20, target effort=19.5 → ~5000×19.5/20
    expect(pred).toBeCloseTo(5000 * (19.5 / 20), 0)
  })

  it('retourne null si l’athlète n’a pas d’autre course de référence', () => {
    const solo = race({ raceId: 'solo' })
    expect(baselinePredict('riegel_distance_only', solo, [solo], 'moving')).toBeNull()
    expect(baselinePredict('kilometre_effort', solo, [solo], 'moving')).toBeNull()
  })

  it('ne se sert JAMAIS de la course cible comme sa propre référence (anti-fuite)', () => {
    // Deux courses distinctes du même athlète ; la cible ne doit pas se prédire elle-même.
    const a = race({ raceId: 'a', distanceKm: 10, actualMovingS: 3000 })
    const b = race({ raceId: 'b', distanceKm: 10, actualMovingS: 9999 })
    // Pour cible=a, la seule réf est b (9999), pas a.
    const pred = baselinePredict('recent_average_pace', a, [a, b], 'moving')!
    expect(pred).toBeCloseTo(9999, 0)
  })

  it('computeBaselineMetrics couvre les 6 baselines, déterministe', () => {
    const rows: BaselineRaceInput[] = [
      race({ athleteId: 'A', raceId: 'a1', distanceKm: 10, actualMovingS: 3000, actualElapsedS: 3100 }),
      race({ athleteId: 'A', raceId: 'a2', distanceKm: 21, dplusM: 200, actualMovingS: 6600, actualElapsedS: 6800 }),
      race({ athleteId: 'B', raceId: 'b1', distanceKm: 42, dplusM: 500, actualMovingS: 15000, actualElapsedS: 15600 }),
      race({ athleteId: 'B', raceId: 'b2', distanceKm: 10, actualMovingS: 3200, actualElapsedS: 3300 }),
    ]
    const m1 = computeBaselineMetrics(rows, 'moving')
    const m2 = computeBaselineMetrics(rows, 'moving')
    expect(m1.map((b) => b.baseline).sort()).toEqual([...BASELINE_NAMES].sort())
    expect(m1).toEqual(m2) // déterministe
    for (const b of m1) expect(b.covered).toBeGreaterThanOrEqual(0)
  })
})
