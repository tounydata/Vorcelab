import { describe, it, expect } from 'vitest'
import {
  vo2AtVelocity,
  velocityForVo2,
  computeVdot,
  vdotConfidence,
  trainingPaces,
  thresholdPaceSecPerKm,
  paceSecPerKmAtPct,
  riegelPredict,
  vmaFromDistanceTest,
  vmaFromVdot,
  vmaVdotCoherence,
  hrFromReserve,
  hrFromMax,
  lthrFromSamples,
  formatPace,
  type PaceZone,
} from '../src/lib/paceEngine'

// ─── VO2 ↔ vitesse (inverses) ───────────────────────────────────────────────────

describe('vo2AtVelocity / velocityForVo2', () => {
  it('sont inverses l\'une de l\'autre', () => {
    const v = 250
    expect(velocityForVo2(vo2AtVelocity(v))).toBeCloseTo(v, 5)
  })
})

// ─── A1 — VDOT ────────────────────────────────────────────────────────────────────

describe('computeVdot', () => {
  it('10 km en 50:00 → VDOT ≈ 40', () => {
    const vdot = computeVdot({ distanceM: 10000, timeSec: 3000 })
    expect(vdot).toBeGreaterThan(39.5)
    expect(vdot).toBeLessThan(40.5)
  })

  it('un coureur plus rapide a un VDOT plus élevé', () => {
    const slow = computeVdot({ distanceM: 10000, timeSec: 3000 })
    const fast = computeVdot({ distanceM: 10000, timeSec: 2400 }) // 40:00
    expect(fast).toBeGreaterThan(slow)
  })
})

describe('vdotConfidence', () => {
  it('classe les distances par fiabilité', () => {
    expect(vdotConfidence(10000)).toBe('good')
    expect(vdotConfidence(2000)).toBe('medium')
    expect(vdotConfidence(42195)).toBe('medium')
    expect(vdotConfidence(800)).toBe('low')
    expect(vdotConfidence(50000)).toBe('low')
  })
})

// ─── A2 — Allures d'entraînement ──────────────────────────────────────────────────

describe('trainingPaces', () => {
  it('VDOT 50 → T-pace ≈ 4:15/km', () => {
    const t = thresholdPaceSecPerKm(50)
    expect(t).toBeGreaterThan(252)
    expect(t).toBeLessThan(258)
    expect(formatPace(t)).toBe('4:15')
  })

  it('les zones sont ordonnées de la plus lente (E) à la plus rapide (R)', () => {
    const p = trainingPaces(50)
    // chaque zone : borne rapide ≤ borne lente
    const zones: PaceZone[] = ['E', 'M', 'T', 'I', 'R']
    for (const z of zones) expect(p[z].fastSecPerKm).toBeLessThanOrEqual(p[z].slowSecPerKm)
    // E la plus lente, R la plus rapide
    expect(p.E.slowSecPerKm).toBeGreaterThan(p.T.slowSecPerKm)
    expect(p.T.fastSecPerKm).toBeGreaterThan(p.I.fastSecPerKm)
    expect(p.I.fastSecPerKm).toBeGreaterThan(p.R.fastSecPerKm)
  })

  it('paceSecPerKmAtPct : plus d\'intensité = plus rapide', () => {
    expect(paceSecPerKmAtPct(50, 0.95)).toBeLessThan(paceSecPerKmAtPct(50, 0.7))
  })
})

// ─── A5 — Seuil + Riegel ────────────────────────────────────────────────────────

describe('riegelPredict', () => {
  it('extrapole un temps plus long sur une distance plus longue', () => {
    const half = riegelPredict(10000, 2400, 21097) // 10k 40:00 → semi
    expect(half).toBeGreaterThan(2400)
    // semi ≈ 10k × (21097/10000)^1.06 ≈ 40:00 × 2.22 ≈ 1:29
    expect(half).toBeGreaterThan(5200)
    expect(half).toBeLessThan(5500)
  })

  it('redonne le temps connu pour la même distance', () => {
    expect(riegelPredict(10000, 2400, 10000)).toBeCloseTo(2400, 5)
  })
})

// ─── A3 — VMA ────────────────────────────────────────────────────────────────────

describe('VMA', () => {
  it('demi-Cooper : 1500 m en 6 min → 15 km/h', () => {
    expect(vmaFromDistanceTest(1500, 6)).toBeCloseTo(15, 5)
  })

  it('vmaFromVdot donne une VMA plausible', () => {
    const vma = vmaFromVdot(50)
    expect(vma).toBeGreaterThan(14)
    expect(vma).toBeLessThan(17)
  })

  it('vmaVdotCoherence flague un écart > 10 %', () => {
    const predicted = vmaFromVdot(50)
    expect(vmaVdotCoherence(predicted, 50).coherent).toBe(true)
    expect(vmaVdotCoherence(predicted * 1.2, 50).coherent).toBe(false)
  })
})

// ─── A4 — Zones FC ────────────────────────────────────────────────────────────────

describe('zones FC', () => {
  it('Karvonen : FCmax 190 / FCrepos 50, Z2 60-70 %FCR → 134-148 bpm', () => {
    expect(hrFromReserve(190, 50, 0.6)).toBe(134)
    expect(hrFromReserve(190, 50, 0.7)).toBe(148)
  })

  it('% FCmax', () => {
    expect(hrFromMax(190, 0.9)).toBe(171)
  })

  it('lthrFromSamples moyenne les échantillons', () => {
    expect(lthrFromSamples([160, 162, 164])).toBe(162)
    expect(lthrFromSamples([])).toBeNull()
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────────

describe('formatPace', () => {
  it('formate en m:ss', () => {
    expect(formatPace(255)).toBe('4:15')
    expect(formatPace(300)).toBe('5:00')
    expect(formatPace(305)).toBe('5:05')
  })
})
