import { describe, it, expect } from 'vitest'
import { estimateVdotGainRange, MIN_PLAN_WEEKS, predictRaceTimeS } from '../src/lib/raceTimeProjection'

describe('estimateVdotGainRange — honnêteté du teaser', () => {
  it('ne génère AUCUN gain si le plan est trop court (données insuffisantes)', () => {
    expect(estimateVdotGainRange(MIN_PLAN_WEEKS - 1)).toEqual({ low: 0, high: 0 })
    expect(estimateVdotGainRange(0)).toEqual({ low: 0, high: 0 })
    expect(estimateVdotGainRange(NaN)).toEqual({ low: 0, high: 0 })
  })

  it('renvoie une plage basse < haute pour un plan crédible', () => {
    const r = estimateVdotGainRange(8)
    expect(r.low).toBeGreaterThan(0)
    expect(r.low).toBeLessThan(r.high)
    expect(r.high).toBe(Math.min(8 * 0.4, 7))
  })

  it('plafonne la borne haute (progression non illimitée)', () => {
    expect(estimateVdotGainRange(100).high).toBe(7)
    expect(estimateVdotGainRange(100).low).toBe(3.5)
  })
})

describe('predictRaceTimeS', () => {
  it('un VDOT plus élevé → temps plus court', () => {
    const t1 = predictRaceTimeS(45, 10000)
    const t2 = predictRaceTimeS(50, 10000)
    expect(t2).toBeLessThan(t1)
  })
  it('garde-fous : entrées non valides → 0', () => {
    expect(predictRaceTimeS(0, 10000)).toBe(0)
    expect(predictRaceTimeS(50, 0)).toBe(0)
  })
})
