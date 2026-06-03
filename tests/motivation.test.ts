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

describe('plan — l’orientation biaise l’intensité (séances qualité)', () => {
  const base = {
    raceName: 'Test', raceDateISO: '2026-10-01', raceDistanceKm: 21, raceElevationM: 300,
    raceType: 'Route', todayISO: '2026-06-01', daysPerWeek: 5, currentCTL: 45, level: 'intermediate' as const,
  }
  const HARD_OR_QUALITY = ['threshold', 'vo2max', 'speed', 'tempo', 'hills', 'descent', 'race_pace']
  // nb total de séances "qualité" sur le plan
  const qualityTotal = (motivation: 'plaisir' | 'mix' | 'performance') =>
    generateTrainingPlan({ ...base, motivation }).weeks
      .reduce((s, w) => s + w.sessions.filter((x) => HARD_OR_QUALITY.includes(x.system)).length, 0)
  // séances dures hors la course elle-même (le jour J est toujours « hard »)
  const hardTotal = (motivation: 'plaisir' | 'mix' | 'performance') =>
    generateTrainingPlan({ ...base, motivation }).weeks
      .reduce((s, w) => s + w.sessions.filter((x) => x.intensity === 'hard' && x.system !== 'race').length, 0)

  it('plaisir a moins (ou autant) de séances qualité que performance', () => {
    expect(qualityTotal('plaisir')).toBeLessThan(qualityTotal('performance'))
  })
  it('plaisir ne programme aucune séance d’intensité dure', () => {
    expect(hardTotal('plaisir')).toBe(0)
  })
})
