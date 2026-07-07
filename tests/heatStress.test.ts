import { describe, it, expect } from 'vitest'
import { apparentTempC, heatPenaltyPct, HEAT_COMFORT_C } from '../src/lib/heatStress'

describe('apparentTempC — ressenti (Steadman/BOM)', () => {
  it('humidité élevée fait MONTER le ressenti', () => {
    const dry = apparentTempC(30, 25, 0)
    const humid = apparentTempC(30, 90, 0)
    expect(humid).toBeGreaterThan(dry)
    expect(humid).toBeGreaterThan(30) // 30 °C humide ressenti > 30
  })

  it('le vent fait BAISSER le ressenti', () => {
    const calm = apparentTempC(28, 60, 0)
    const windy = apparentTempC(28, 60, 30)
    expect(windy).toBeLessThan(calm)
  })

  it('humidité inconnue → 50 % (neutre, proche de l\'air)', () => {
    const at = apparentTempC(22, null, 0)
    expect(Math.abs(at - 22)).toBeLessThan(1.5)
  })

  it('borné à ±15 °C de l\'air (anti-aberration)', () => {
    expect(apparentTempC(40, 100, 0)).toBeLessThanOrEqual(55)
    expect(apparentTempC(10, 0, 100)).toBeGreaterThanOrEqual(-5)
  })
})

describe('heatPenaltyPct', () => {
  it('nul en dessous du seuil de confort', () => {
    expect(heatPenaltyPct(HEAT_COMFORT_C - 1)).toBe(0)
    expect(heatPenaltyPct(18)).toBe(0)
  })
  it('croît avec le ressenti, borné à +12 %', () => {
    expect(heatPenaltyPct(27)).toBeCloseTo(5, 5)
    expect(heatPenaltyPct(50)).toBe(12) // plafond
  })
})
