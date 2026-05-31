import { describe, it, expect } from 'vitest'
import { deriveRunnerPaces } from '../src/lib/runnerPaces'

describe('deriveRunnerPaces', () => {
  it('dérive le VDOT depuis un record numérique (10 km en 50:00 → ~40)', () => {
    const r = deriveRunnerPaces({ '10k': { timeS: 3000, dist: 10000 } }, null)
    expect(r).not.toBeNull()
    expect(r!.source).toBe('race_pr')
    expect(r!.vdot).toBeGreaterThan(39)
    expect(r!.vdot).toBeLessThan(41)
    expect(r!.paces.T.fastSecPerKm).toBeGreaterThan(0)
  })

  it('retient le meilleur record (VDOT le plus élevé)', () => {
    const r = deriveRunnerPaces(
      { '10k': { timeS: 3000, dist: 10000 }, '5k': { timeS: 1200, dist: 5000 } },
      null,
    )
    // 5k en 20:00 a un meilleur VDOT qu'un 10k en 50:00
    expect(r!.vdot).toBeGreaterThan(42)
  })

  it('ignore les PR non numériques (format lisible) et retombe sur la VO2max', () => {
    const r = deriveRunnerPaces({ '10 km': { time: '50:00' } } as Record<string, unknown>, 50)
    expect(r!.source).toBe('vo2max')
    expect(r!.vdot).toBe(50)
    expect(r!.confidence).toBe('low')
  })

  it('VO2max seule → proxy à confiance faible', () => {
    const r = deriveRunnerPaces(null, 48)
    expect(r!.source).toBe('vo2max')
    expect(r!.vdot).toBe(48)
  })

  it('aucune donnée → null (pas d\'erreur)', () => {
    expect(deriveRunnerPaces(null, null)).toBeNull()
    expect(deriveRunnerPaces({}, 0)).toBeNull()
  })
})
