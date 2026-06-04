import { describe, it, expect } from 'vitest'
import { computeWeatherImpact, type RaceConditions } from '../src/lib/raceWeather'
import type { ConditionPenalties } from '../src/lib/runnerProfile'

const baseCond: RaceConditions = {
  available: true, daysToRace: 5, tempC: 15, windKmh: 8, precipMm: 0, isNight: false, startHour: 9,
}

describe('computeWeatherImpact', () => {
  it('aucun impact en conditions neutres', () => {
    const r = computeWeatherImpact(baseCond, undefined)
    expect(r.items).toHaveLength(0)
    expect(r.factor).toBe(1)
    expect(r.totalPct).toBe(0)
  })

  it('indisponible → facteur neutre', () => {
    const r = computeWeatherImpact({ ...baseCond, available: false, reason: 'J-10' }, undefined)
    expect(r.factor).toBe(1)
    expect(r.items).toHaveLength(0)
  })

  it('utilise la pénalité perso quand la confiance est suffisante', () => {
    const pen: ConditionPenalties = { heat: { paceImpactPct: 8, sampleCount: 6, confidence: 'high' } }
    const r = computeWeatherImpact({ ...baseCond, tempC: 28 }, pen)
    const heat = r.items.find((i) => i.key === 'heat')!
    expect(heat.source).toBe('perso')
    expect(heat.pct).toBe(8)
  })

  it('repli générique quand la pénalité perso manque ou peu fiable', () => {
    const pen: ConditionPenalties = { heat: { paceImpactPct: 8, sampleCount: 1, confidence: 'low' } }
    const r = computeWeatherImpact({ ...baseCond, tempC: 28 }, pen)
    const heat = r.items.find((i) => i.key === 'heat')!
    expect(heat.source).toBe('générique')
    expect(heat.pct).toBeGreaterThan(0)
  })

  it('borne la pénalité perso aberrante (garde-fou physiologique)', () => {
    // une chaleur "qui accélère" (perso négatif) ne doit jamais accélérer la projection
    const pen: ConditionPenalties = { heat: { paceImpactPct: -35, sampleCount: 8, confidence: 'high' } }
    const r = computeWeatherImpact({ ...baseCond, tempC: 30 }, pen)
    // clampé à 0 → pas dans les items (pct > 0 requis), facteur neutre
    expect(r.items.find((i) => i.key === 'heat')).toBeUndefined()
    expect(r.factor).toBe(1)
  })

  it('cumule plusieurs conditions et borne à +20%', () => {
    const pen: ConditionPenalties = {
      heat: { paceImpactPct: 12, sampleCount: 6, confidence: 'high' },
      night: { paceImpactPct: 8, sampleCount: 6, confidence: 'high' },
      wind: { paceImpactPct: 8, sampleCount: 6, confidence: 'high' },
    }
    const r = computeWeatherImpact({ ...baseCond, tempC: 30, isNight: true, windKmh: 40 }, pen)
    expect(r.totalPct).toBeLessThanOrEqual(20)
    expect(r.factor).toBeCloseTo(1.2, 5)
  })

  it('déclenche le vent via le facteur isotrope (×0.6 > 15 km/h)', () => {
    const r = computeWeatherImpact({ ...baseCond, windKmh: 30 }, undefined) // 30×0.6=18 > 15
    expect(r.items.find((i) => i.key === 'wind')).toBeDefined()
    const r2 = computeWeatherImpact({ ...baseCond, windKmh: 20 }, undefined) // 20×0.6=12 < 15
    expect(r2.items.find((i) => i.key === 'wind')).toBeUndefined()
  })
})
