import { describe, it, expect } from 'vitest'
import { motivationBias } from '../src/lib/coach/motivation'
import { generateTrainingPlan } from '../src/lib/coach/planGenerator'

describe('motivationBias', () => {
  it('plaisir allège le volume et coupe l’intensité dure', () => {
    const b = motivationBias('plaisir')
    expect(b.volumeScale).toBeLessThan(1)
    expect(b.maxQualityPerWeek).toBeLessThanOrEqual(1)
    expect(b.allowHardIntensity).toBe(false)
  })
  it('performance pousse volume + 2 qualités', () => {
    const b = motivationBias('performance')
    expect(b.volumeScale).toBeGreaterThan(1)
    expect(b.maxQualityPerWeek).toBe(2)
    expect(b.allowHardIntensity).toBe(true)
  })
  it('mix (défaut) = neutre', () => {
    expect(motivationBias('mix').volumeScale).toBe(1)
    expect(motivationBias(null).volumeScale).toBe(1)
    expect(motivationBias(undefined).volumeScale).toBe(1)
  })
})

describe('plan — l’orientation biaise le volume', () => {
  const base = {
    raceName: 'Test', raceDateISO: '2026-09-01', raceDistanceKm: 42, raceElevationM: 500,
    raceType: 'Route', todayISO: '2026-06-01', daysPerWeek: 5, currentCTL: 50,
  }
  const totalVol = (motivation: 'plaisir' | 'mix' | 'performance') =>
    generateTrainingPlan({ ...base, motivation }).weeks.reduce((s, w) => s + w.volumeHours, 0)

  it('plaisir < mix < performance en volume total', () => {
    const plaisir = totalVol('plaisir'), mix = totalVol('mix'), perf = totalVol('performance')
    expect(plaisir).toBeLessThan(mix)
    expect(perf).toBeGreaterThan(mix)
  })
  it('sans motivation = identique à mix (rétro-compat)', () => {
    const noMot = generateTrainingPlan(base).weeks.reduce((s, w) => s + w.volumeHours, 0)
    expect(noMot).toBeCloseTo(totalVol('mix'), 1)
  })
})
