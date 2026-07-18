import { describe, it, expect } from 'vitest'
import {
  fitFadeExponent,
  projectWithFade,
  durabilityScore,
  MARATHON_M,
  type FadeEffort,
} from '../src/lib/fadeModel'
import { fitFadeExponent as mobileFit } from '../mobile/src/lib/fadeModel'

// Génère des efforts suivant EXACTEMENT une loi de Riegel T = a·D^b (pour vérifier
// qu'on retrouve b).
function riegelEfforts(a: number, b: number, dists: number[]): FadeEffort[] {
  return dists.map((D) => ({ distM: D, timeSec: a * D ** b }))
}

describe('fitFadeExponent — apprend l’exposant d’endurance', () => {
  it('retrouve l’exposant sur des données parfaitement Riegel', () => {
    const efforts = riegelEfforts(0.2, 1.08, [5000, 10000, 21097, 42195])
    const res = fitFadeExponent(efforts)
    expect(res.reason).toBe('personal')
    expect(res.exponent).toBeCloseTo(1.08, 2)
    expect(res.r2).toBeGreaterThan(0.999)
    // Référence = le plus long effort.
    expect(res.reference!.distM).toBe(42195)
  })

  it('moins de 3 efforts → exposant par défaut, raison insufficient_data', () => {
    const res = fitFadeExponent([{ distM: 5000, timeSec: 1200 }, { distM: 10000, timeSec: 2500 }])
    expect(res.reason).toBe('insufficient_data')
    expect(res.exponent).toBe(1.06)
  })

  it('étalement de distance trop faible → défaut, raison insufficient_spread', () => {
    // 3 efforts mais toutes distances proches (10–12 km) → pas d'écart pour régresser.
    const res = fitFadeExponent([
      { distM: 10000, timeSec: 2500 },
      { distM: 11000, timeSec: 2760 },
      { distM: 12000, timeSec: 3020 },
    ])
    expect(res.reason).toBe('insufficient_spread')
    expect(res.exponent).toBe(1.06)
  })

  it('borne l’exposant appris (anti-aberration)', () => {
    // Données absurdes qui donneraient un exposant énorme.
    const efforts = [
      { distM: 5000, timeSec: 1000 },
      { distM: 10000, timeSec: 5000 },
      { distM: 20000, timeSec: 40000 },
    ]
    const res = fitFadeExponent(efforts)
    expect(res.exponent).toBeLessThanOrEqual(1.2)
    expect(res.exponent).toBeGreaterThanOrEqual(1.01)
  })

  it('parité web/mobile', () => {
    const efforts = riegelEfforts(0.2, 1.07, [5000, 10000, 21097])
    expect(mobileFit(efforts)).toEqual(fitFadeExponent(efforts))
  })
})

describe('projectWithFade — projette avec l’exposant personnel', () => {
  const ref: FadeEffort = { distM: 10000, timeSec: 2400 } // 10 km en 40 min

  it('applique la loi de Riegel avec l’exposant', () => {
    const t = projectWithFade(21097, ref, 1.06)!
    // 2400 · (21097/10000)^1.06 ≈ 2400 · 2.11 ≈ ~5240 s.
    expect(t).toBeGreaterThan(5000)
    expect(t).toBeLessThan(5500)
  })

  it('ajoute une pénalité ULTRA au-delà du marathon (plus lent que Riegel simple)', () => {
    const b = 1.06
    const at50k = projectWithFade(50000, ref, b)!
    const riegelPlain = ref.timeSec * (50000 / ref.distM) ** b
    expect(at50k).toBeGreaterThan(riegelPlain) // la rampe ultra ralentit
    // À exactement le marathon, pas de pénalité.
    const atMara = projectWithFade(MARATHON_M, ref, b)!
    const maraPlain = ref.timeSec * (MARATHON_M / ref.distM) ** b
    expect(atMara).toBeCloseTo(maraPlain, 3)
  })

  it('référence invalide → null', () => {
    expect(projectWithFade(10000, null, 1.06)).toBeNull()
    expect(projectWithFade(10000, { distM: 0, timeSec: 0 }, 1.06)).toBeNull()
  })
})

describe('durabilityScore', () => {
  it('un exposant bas + faible dérive = très durable', () => {
    expect(durabilityScore(1.03, 3)).toBeGreaterThan(80)
  })
  it('un exposant élevé + forte dérive = peu durable', () => {
    expect(durabilityScore(1.14, 15)).toBeLessThan(20)
  })
  it('sans dérive cardiaque, n’utilise que l’exposant', () => {
    expect(durabilityScore(1.02, null)).toBe(100)
  })
})
