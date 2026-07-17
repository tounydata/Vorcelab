import { describe, it, expect } from 'vitest'
import {
  computePersonalSteepnessCalibration,
  type SteepnessCalibrationPoint,
} from '../src/lib/steepnessCalibration'
import { computePersonalSteepnessCalibration as mobileCompute } from '../mobile/src/lib/steepnessCalibration'

// Fonction PURE extraite de computeRaceProjection : régression pondérée
// allure plat-équivalente ~ D+/km sur les COURSES CONFIRMÉES. RALENTISSEMENT seul.

const pt = (dplusPerKm: number, flatEquivalentPaceS: number, weight = 1): SteepnessCalibrationPoint => ({
  dplusPerKm,
  flatEquivalentPaceS,
  weight,
})

describe('computePersonalSteepnessCalibration (section 21)', () => {
  it('1. moins de trois courses → désactivée (not_enough_races)', () => {
    const res = computePersonalSteepnessCalibration([pt(10, 300), pt(40, 340)], { targetDplusPerKm: 50 })
    expect(res.active).toBe(false)
    expect(res.reason).toBe('not_enough_races')
  })

  it('2. étalement de D+/km insuffisant → désactivée (insufficient_spread)', () => {
    // 3 courses mais toutes autour de 10 m/km (spread < 12).
    const res = computePersonalSteepnessCalibration(
      [pt(8, 300), pt(12, 305), pt(15, 302)],
      { targetDplusPerKm: 50 },
    )
    expect(res.active).toBe(false)
    expect(res.reason).toBe('insufficient_spread')
  })

  it('3. trois courses variées avec pente montante d’allure → activée', () => {
    // Plus c'est raide, plus l'allure plat-équivalente est lente → l'athlète encaisse mal.
    const res = computePersonalSteepnessCalibration(
      [pt(10, 300), pt(30, 340), pt(55, 400)],
      { targetDplusPerKm: 70 },
    )
    expect(res.reason).toBe('active')
    expect(res.active).toBe(true)
    // Prédiction plus lente que la moyenne (ralentissement).
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThan(res.referenceFlatEquivalentPaceS!)
  })

  it('8. ne peut jamais ACCÉLÉRER (plancher = moyenne pondérée)', () => {
    // Pente d'allure DÉCROISSANTE (plus raide = plus rapide, physiquement improbable) :
    // la prédiction ne doit jamais descendre sous la moyenne.
    const res = computePersonalSteepnessCalibration(
      [pt(10, 400), pt(30, 340), pt(55, 300)],
      { targetDplusPerKm: 70 },
    )
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThanOrEqual(res.referenceFlatEquivalentPaceS!)
    expect(res.active).toBe(false) // aucun ralentissement → inactive
  })

  it('9. extrapolation bornée au plafond (× la course la plus lente)', () => {
    const points = [pt(10, 300), pt(30, 340), pt(55, 400)]
    const res = computePersonalSteepnessCalibration(points, { targetDplusPerKm: 500, maxExtrapolationRatio: 1.3 })
    const maxObs = Math.max(...points.map((p) => p.flatEquivalentPaceS))
    expect(res.predictedFlatEquivalentPaceS!).toBeLessThanOrEqual(maxObs * 1.3 + 1e-6)
  })

  it('10. web et mobile produisent le même résultat', () => {
    const points = [pt(10, 300), pt(30, 340), pt(55, 400)]
    const web = computePersonalSteepnessCalibration(points, { targetDplusPerKm: 70 })
    const mob = mobileCompute(points, { targetDplusPerKm: 70 })
    expect(mob).toEqual(web)
  })

  it('spread et sampleCount sont toujours renseignés', () => {
    const res = computePersonalSteepnessCalibration([pt(10, 300), pt(50, 380), pt(30, 340)], { targetDplusPerKm: 40 })
    expect(res.sampleCount).toBe(3)
    expect(res.spread).toBeCloseTo(40, 5)
  })
})
