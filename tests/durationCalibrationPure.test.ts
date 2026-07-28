import { describe, it, expect } from 'vitest'
import {
  computePersonalDurationCalibration,
  type DurationCalibrationPoint,
} from '../src/lib/durationCalibration'
import { computePersonalDurationCalibration as mobileCompute } from '../mobile/src/lib/durationCalibration'

// Fonction PURE extraite de computeRaceProjection : régression log-log pondérée
// allure plat-équivalente ~ DURÉE sur les COURSES CONFIRMÉES. RALENTISSEMENT seul.
//
// Motivation (bug corrigé) : l'ancrage moyennait l'allure de courses de durées très
// différentes, puis appliquait ce scalaire à une course plus longue → optimisme
// systématique sur les formats longs.

const pt = (durationS: number, flatEquivalentPaceS: number, weight = 1): DurationCalibrationPoint => ({
  durationS,
  flatEquivalentPaceS,
  weight,
})

// Profil réaliste : l'allure plat-équivalente se dégrade avec la durée
// (1 h 18 → 5:04/km ; 1 h 31 → 5:14/km ; 2 h 55 → 5:55/km).
const DECAYING = [pt(4670, 304), pt(5486, 314), pt(10494, 355)]

describe('computePersonalDurationCalibration', () => {
  it('1. moins de trois courses → désactivée (not_enough_races)', () => {
    const res = computePersonalDurationCalibration([pt(4000, 300), pt(9000, 350)], { targetDurationS: 12000 })
    expect(res.active).toBe(false)
    expect(res.reason).toBe('not_enough_races')
    // Repli neutre : la moyenne pondérée, jamais null quand il y a des points.
    expect(res.predictedFlatEquivalentPaceS).toBeCloseTo(325, 0)
  })

  it('2. étalement de durée insuffisant → désactivée (insufficient_spread)', () => {
    // 3 courses toutes autour d'1 h (ratio max/min < 1.5) → la pente serait du bruit.
    const res = computePersonalDurationCalibration(
      [pt(3600, 300), pt(3900, 305), pt(4200, 302)],
      { targetDurationS: 12000 },
    )
    expect(res.active).toBe(false)
    expect(res.reason).toBe('insufficient_spread')
  })

  it('3. allure qui se dégrade avec la durée → activée, et RALENTIT au-delà du vécu', () => {
    const res = computePersonalDurationCalibration(DECAYING, { targetDurationS: 14000 })
    expect(res.reason).toBe('active')
    expect(res.active).toBe(true)
    // Plus lente que la course la plus longue observée (355 s/km) puisqu'on extrapole.
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThan(355)
    expect(res.exponent!).toBeGreaterThan(0)
    expect(res.extrapolationRatio).toBeCloseTo(14000 / 10494, 2)
  })

  it('4. exposant borné : une régression très raide sur 3 points reste plafonnée', () => {
    // Décroissance volontairement extrême → k brut très au-dessus du plafond.
    const res = computePersonalDurationCalibration(
      [pt(3600, 250), pt(7200, 400), pt(14400, 700)],
      { targetDurationS: 30000, maxExponent: 0.15 },
    )
    expect(res.rawExponent!).toBeGreaterThan(0.15)
    expect(res.exponent).toBe(0.15)
  })

  it('5. RALENTISSEMENT seul : une allure qui s’améliore avec la durée n’accélère jamais', () => {
    // Cas inverse (bruit ou coureur diesel) : k brut < 0 → borné à 0, prédiction = moyenne.
    const res = computePersonalDurationCalibration(
      [pt(3600, 400), pt(7200, 350), pt(14400, 300)],
      { targetDurationS: 20000 },
    )
    expect(res.rawExponent!).toBeLessThan(0)
    expect(res.exponent).toBe(0)
    expect(res.active).toBe(false)
    // Jamais plus rapide que la moyenne pondérée démontrée.
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThanOrEqual(res.referenceFlatEquivalentPaceS!)
  })

  it('6. plafond d’extrapolation : jamais au-delà de la plus lente × 1.30', () => {
    const res = computePersonalDurationCalibration(DECAYING, { targetDurationS: 200_000 })
    expect(res.predictedFlatEquivalentPaceS!).toBeLessThanOrEqual(355 * 1.3 + 1e-6)
  })

  it('7. durée cible courte → plancher à la moyenne (pas d’accélération)', () => {
    const res = computePersonalDurationCalibration(DECAYING, { targetDurationS: 1200 })
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThanOrEqual(res.referenceFlatEquivalentPaceS!)
  })

  it('8. points inexploitables (durée ou allure nulles) ignorés sans planter', () => {
    const res = computePersonalDurationCalibration(
      [pt(0, 300), pt(4670, 0), pt(5486, 314), pt(10494, 355), pt(4670, 304)],
      { targetDurationS: 14000 },
    )
    // 3 points exploitables restants → régression possible.
    expect(res.reason).toBe('active')
    expect(Number.isFinite(res.predictedFlatEquivalentPaceS!)).toBe(true)
  })

  it('9. pondération respectée : une course lourdement pondérée tire la référence', () => {
    const light = computePersonalDurationCalibration(DECAYING, { targetDurationS: 12000 })
    const heavy = computePersonalDurationCalibration(
      [pt(4670, 304, 0.1), pt(5486, 314, 0.1), pt(10494, 355, 10)],
      { targetDurationS: 12000 },
    )
    expect(heavy.referenceFlatEquivalentPaceS!).toBeGreaterThan(light.referenceFlatEquivalentPaceS!)
  })

  it('10. parité web ↔ mobile sur le même jeu d’entrées', () => {
    const opts = { targetDurationS: 14000 }
    expect(mobileCompute(DECAYING, opts)).toEqual(computePersonalDurationCalibration(DECAYING, opts))
  })
})
