import { describe, it, expect } from 'vitest'
import {
  ENGINE_VERSION, deriveConfidence, normalizeContributions, stampProjection,
  type ProjectionSourceContribution,
} from '../src/lib/engineVersion'

const NOW = new Date('2026-07-15T00:00:00Z')

describe('deriveConfidence', () => {
  it('repli dominant → confiance faible', () => {
    const c: ProjectionSourceContribution[] = [
      { source: 'fallback', weight: 0.6 }, { source: 'gradient', weight: 0.4 },
    ]
    expect(deriveConfidence(c)).toBe('low')
  })
  it('historique réel dominant → confiance élevée', () => {
    const c: ProjectionSourceContribution[] = [
      { source: 'history', weight: 0.4 }, { source: 'past_races', weight: 0.3 }, { source: 'weather', weight: 0.3 },
    ]
    expect(deriveConfidence(c)).toBe('high')
  })
  it('mélange sans dominante → confiance moyenne', () => {
    const c: ProjectionSourceContribution[] = [
      { source: 'vam', weight: 0.4 }, { source: 'gradient', weight: 0.4 }, { source: 'history', weight: 0.2 },
    ]
    expect(deriveConfidence(c)).toBe('medium')
  })
  it('aucune contribution → faible', () => {
    expect(deriveConfidence([])).toBe('low')
  })
})

describe('normalizeContributions', () => {
  it('normalise les poids en parts sommant à 1', () => {
    const out = normalizeContributions([
      { source: 'history', weight: 3 }, { source: 'vam', weight: 1 },
    ])
    expect(out.map((c) => c.weight)).toEqual([0.75, 0.25])
    expect(out.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 6)
  })
  it('ramène les poids négatifs à 0', () => {
    const out = normalizeContributions([
      { source: 'history', weight: 2 }, { source: 'fallback', weight: -1 },
    ])
    expect(out[0].weight).toBe(1)
    expect(out[1].weight).toBe(0)
  })
})

describe('stampProjection', () => {
  it('estampille version, confiance, repli et explicabilité normalisée', () => {
    const p = stampProjection({
      profileVersion: 'p-42',
      lowS: 3600, centralS: 3660, highS: 3720,
      explanations: [{ source: 'history', weight: 2 }, { source: 'gradient', weight: 2 }],
      now: NOW,
    })
    expect(p.engineVersion).toBe(ENGINE_VERSION)
    expect(p.profileVersion).toBe('p-42')
    expect(p.computedAt).toBe('2026-07-15T00:00:00.000Z')
    expect(p.usedFallback).toBe(false)
    expect(p.explanations.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 6)
    expect(p.actualResultS).toBeNull()
  })

  it('réordonne low <= central <= high', () => {
    const p = stampProjection({ lowS: 3720, centralS: 3600, highS: 3660, explanations: [], now: NOW })
    expect([p.lowS, p.centralS, p.highS]).toEqual([3600, 3660, 3720])
  })

  it('marque usedFallback + confiance faible quand le repli domine', () => {
    const p = stampProjection({
      lowS: 2000, centralS: 2100, highS: 2200,
      explanations: [{ source: 'fallback', weight: 1 }],
      now: NOW,
    })
    expect(p.usedFallback).toBe(true)
    expect(p.confidence).toBe('low')
  })
})
