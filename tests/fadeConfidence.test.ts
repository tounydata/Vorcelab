import { describe, it, expect } from 'vitest'
import { fitFadeExponent, type FadeEffort } from '../src/lib/fadeModel'
import { fitFadeExponent as mobileFit } from '../mobile/src/lib/fadeModel'

// Efforts suivant EXACTEMENT Riegel T = a·D^b (R² ≈ 1) — on contrôle la provenance.
function riegel(a: number, b: number, dists: number[], activityId?: string | number): FadeEffort[] {
  return dists.map((D) => ({ distM: D, timeSec: a * D ** b, activityId }))
}

describe('durabilité personnelle — garde-fous de confiance (§6/§19)', () => {
  it('trois distances issues d’UNE SEULE activité ne donnent pas une confiance élevée', () => {
    // Même activityId → 1 seule activité distincte, même si R² parfait et étalement fort.
    const efforts = riegel(0.2, 1.08, [5000, 10000, 21097, 42195], 'act-1')
    const res = fitFadeExponent(efforts)
    expect(res.distinctActivityCount).toBe(1)
    expect(res.confidence).not.toBe('high')
    // 1 activité < 2 → pas d'activation personnelle du tout.
    expect(res.confidence === 'none' || res.confidence === 'low').toBe(true)
    expect(res.reason).not.toBe('personal')
  })

  it('un R² faible désactive le fade personnel', () => {
    // Données bruitées, distances issues d'activités distinctes mais courbe non-Riegel.
    const efforts: FadeEffort[] = [
      { distM: 5000, timeSec: 1500, activityId: 'a' },
      { distM: 10000, timeSec: 1600, activityId: 'b' }, // à peine plus lent que le 5 km
      { distM: 21097, timeSec: 9000, activityId: 'c' }, // effondrement brutal
      { distM: 42195, timeSec: 9500, activityId: 'd' },
    ]
    const res = fitFadeExponent(efforts)
    expect(res.r2).toBeLessThan(0.9)
    expect(res.confidence === 'none' || res.confidence === 'low').toBe(true)
    expect(res.reason).toBe('low_r2')
    expect(res.exponent).toBe(1.06) // exposant par défaut, aucune activation
  })

  it('un R² élevé avec plusieurs activités distinctes active la durabilité', () => {
    const efforts = [
      ...riegel(0.2, 1.08, [5000], 'a'),
      ...riegel(0.2, 1.08, [10000], 'b'),
      ...riegel(0.2, 1.08, [21097], 'c'),
      ...riegel(0.2, 1.08, [42195], 'd'),
    ]
    const res = fitFadeExponent(efforts)
    expect(res.distinctActivityCount).toBe(4)
    expect(res.r2).toBeGreaterThan(0.95)
    expect(res.confidence).toBe('high')
    expect(res.reason).toBe('personal')
    expect(res.exponent).toBeCloseTo(1.08, 2)
  })

  it('trois distances / deux activités / R² parfait → confiance medium (pas high)', () => {
    const efforts = [
      ...riegel(0.2, 1.07, [5000, 10000], 'a'),
      ...riegel(0.2, 1.07, [21097], 'b'),
    ]
    const res = fitFadeExponent(efforts)
    expect(res.distinctActivityCount).toBe(2)
    expect(res.confidence).toBe('medium')
    expect(res.reason).toBe('personal')
  })

  it('provenance inconnue (pas d’activityId) → NON fiable : 0 activité distincte, pas d’activation', () => {
    const efforts = riegel(0.2, 1.06, [5000, 10000, 21097, 42195]) // sans activityId
    const res = fitFadeExponent(efforts)
    expect(res.distinctActivityCount).toBe(0)
    expect(res.confidence === 'none' || res.confidence === 'low').toBe(true)
    expect(res.reason).not.toBe('personal')
  })

  it('deux exécutions avec les mêmes entrées sont déterministes', () => {
    const efforts = riegel(0.2, 1.09, [5000, 10000, 21097, 42195], undefined)
    expect(fitFadeExponent(efforts)).toEqual(fitFadeExponent(efforts))
  })

  it('régression PONDÉRÉE : un point aberrant fortement dépondéré influence peu l’exposant (§8)', () => {
    // Courbe propre à b=1.10 (≠ exposant par défaut 1.06) sur 5 activités distinctes.
    const B = 1.1
    const clean = [5000, 8000, 12000, 21097, 42195].map((D, i) => ({ distM: D, timeSec: 0.2 * D ** B, activityId: `c${i}` }))
    // Point légèrement aberrant (8 % trop lent) : plein poids vs poids ~0.
    const outlier = { distM: 15000, timeSec: 0.2 * 15000 ** B * 1.08, activityId: 'out' }
    const full = fitFadeExponent([...clean, { ...outlier, weight: 1 }])
    const damped = fitFadeExponent([...clean, { ...outlier, weight: 0.02 }])
    const cleanOnly = fitFadeExponent(clean)
    // Garde-fous : les trois restent des ajustements personnels exploitables.
    expect(cleanOnly.reason).toBe('personal')
    expect(full.reason).toBe('personal')
    expect(damped.reason).toBe('personal')
    // Le point dépondéré tire l'exposant BEAUCOUP moins que le point à plein poids.
    expect(Math.abs(damped.exponent - cleanOnly.exponent)).toBeLessThan(Math.abs(full.exponent - cleanOnly.exponent))
  })

  it('trois records tous douteux (poids 0.3) → nombre d’efforts effectif trop bas, pas d’activation (§19.4)', () => {
    const efforts = [
      { distM: 5000, timeSec: 0.2 * 5000 ** 1.06, activityId: 'a', weight: 0.3 },
      { distM: 10000, timeSec: 0.2 * 10000 ** 1.06, activityId: 'b', weight: 0.3 },
      { distM: 21097, timeSec: 0.2 * 21097 ** 1.06, activityId: 'c', weight: 0.3 },
    ]
    const res = fitFadeExponent(efforts)
    expect(res.confidence === 'none' || res.confidence === 'low').toBe(true)
  })

  it('parité web/mobile sur la confiance et l’exposant', () => {
    const efforts = [
      ...riegel(0.2, 1.1, [5000], 'a'),
      ...riegel(0.2, 1.1, [10000], 'b'),
      ...riegel(0.2, 1.1, [21097], 'c'),
    ]
    expect(mobileFit(efforts)).toEqual(fitFadeExponent(efforts))
  })
})
