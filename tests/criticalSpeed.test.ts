import { describe, it, expect } from 'vitest'
import { computeCriticalSpeed, racePaceGuard, dPrimeReps } from '../src/lib/criticalSpeed'

describe('computeCriticalSpeed', () => {
  it('retrouve CS et D′ d\'un jeu synthétique (CS=4 m/s, D′=200 m)', () => {
    // d = 4·t + 200
    const efforts = [
      { timeSec: 60, distM: 4 * 60 + 200 },   // 440
      { timeSec: 180, distM: 4 * 180 + 200 }, // 920
      { timeSec: 600, distM: 4 * 600 + 200 }, // 2600
    ]
    const cs = computeCriticalSpeed(efforts)!
    expect(cs.csMetersPerSec).toBeCloseTo(4, 2)
    expect(cs.dPrimeMeters).toBe(200)
    expect(cs.csPaceSecPerKm).toBe(250) // 1000/4
  })

  it('null si moins de 2 efforts', () => {
    expect(computeCriticalSpeed([{ timeSec: 180, distM: 1000 }])).toBeNull()
  })
})

describe('racePaceGuard', () => {
  const cs = computeCriticalSpeed([
    { timeSec: 60, distM: 440 },
    { timeSec: 600, distM: 2600 },
  ])! // CS=4 m/s (250/km), D′=200 m

  it('allure ≤ CS → toujours tenable', () => {
    const r = racePaceGuard(10000, 260, cs) // 3.85 m/s < CS
    expect(r.sustainable).toBe(true)
  })

  it('allure trop au-dessus de CS sur longue distance → crash prévu', () => {
    const r = racePaceGuard(10000, 230, cs) // 4.35 m/s ≫ CS, 10 km
    expect(r.sustainable).toBe(false)
    expect(r.marginM).toBeLessThan(0)
  })

  it('allure légèrement au-dessus de CS sur courte distance → tenable', () => {
    const r = racePaceGuard(800, 245, cs) // ~4.08 m/s, 800 m → faible dépense D′
    expect(r.requiredDPrimeM).toBeLessThanOrEqual(cs.dPrimeMeters)
    expect(r.sustainable).toBe(true)
  })
})

describe('dPrimeReps', () => {
  const cs = computeCriticalSpeed([
    { timeSec: 60, distM: 440 },
    { timeSec: 600, distM: 2600 },
  ])! // CS=4 m/s, D′=200 m

  it('dimensionne le nombre de reps au-dessus de CS', () => {
    const reps = dPrimeReps(cs, 400, 222) // 400 m à ~4.5 m/s
    expect(reps).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(reps)).toBe(true)
  })

  it('sous CS → illimité (pas de tirage sur D′)', () => {
    expect(dPrimeReps(cs, 1000, 280)).toBe(Infinity)
  })
})
