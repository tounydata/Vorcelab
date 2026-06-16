import { describe, it, expect } from 'vitest'
import { estimate1RM, workingLoad } from '../src/lib/oneRepMax'

describe('estimate1RM', () => {
  it('1 rep = la charge elle-même', () => {
    expect(estimate1RM(100, 1)).toBe(100)
  })
  it('Brzycki pour reps ≤ 6 (100 kg × 5 → 112.5)', () => {
    expect(estimate1RM(100, 5)).toBe(112.5) // 100*36/32
  })
  it('Epley pour reps ≥ 7 (100 kg × 10 → 133.5)', () => {
    expect(estimate1RM(100, 10)).toBe(133.5) // 100*(1+10/30)=133.33 → 133.5
  })
  it('croît avec les reps', () => {
    expect(estimate1RM(80, 3)).toBeLessThan(estimate1RM(80, 6))
  })
  it('borne les reps à 12 et gère charge nulle', () => {
    expect(estimate1RM(80, 20)).toBe(estimate1RM(80, 12))
    expect(estimate1RM(0, 5)).toBe(0)
  })
})

describe('workingLoad', () => {
  it('arrondit à 2.5 kg', () => {
    expect(workingLoad(112.5, 0.8)).toBe(90) // 90.0
    expect(workingLoad(100, 0.87)).toBe(87.5) // 87 → 87.5
  })
})
