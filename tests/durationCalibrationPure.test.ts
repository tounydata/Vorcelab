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

const pt = (
  durationS: number,
  flatEquivalentPaceS: number,
  weight = 1,
  dplusPerKm?: number,
): DurationCalibrationPoint => ({ durationS, flatEquivalentPaceS, weight, dplusPerKm })

// Profil réaliste : l'allure plat-équivalente se dégrade avec la durée. 4 courses —
// le minimum d'identifiabilité (à 3 points pour 2 paramètres, un seul effort long
// atypique dicte toute la pente).
const DECAYING = [pt(4402, 358), pt(7831, 398), pt(10527, 428), pt(14405, 488)]

describe('computePersonalDurationCalibration', () => {
  it('1. moins de quatre courses → désactivée (not_enough_races)', () => {
    const res = computePersonalDurationCalibration(DECAYING.slice(0, 3), { targetDurationS: 20000 })
    expect(res.active).toBe(false)
    expect(res.reason).toBe('not_enough_races')
    // Repli neutre : la moyenne pondérée, jamais null quand il y a des points.
    expect(res.predictedFlatEquivalentPaceS).toBeCloseTo((358 + 398 + 428) / 3, 0)
  })

  it('2. étalement de durée insuffisant → désactivée (insufficient_spread)', () => {
    // 3 courses toutes autour d'1 h (ratio max/min < 1.5) → la pente serait du bruit.
    const res = computePersonalDurationCalibration(
      [pt(3600, 300), pt(3900, 305), pt(4200, 302), pt(4400, 304)],
      { targetDurationS: 12000 },
    )
    expect(res.active).toBe(false)
    expect(res.reason).toBe('insufficient_spread')
  })

  it('3. allure qui se dégrade avec la durée → activée, et RALENTIT au-delà du vécu', () => {
    const res = computePersonalDurationCalibration(DECAYING, { targetDurationS: 17000 })
    expect(res.reason).toBe('active')
    expect(res.active).toBe(true)
    // Plus lente que la moyenne pondérée démontrée (la régression lisse : elle ne
    // repasse pas au-dessus du point brut le plus lent, elle décrit la tendance).
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThan(res.referenceFlatEquivalentPaceS!)
    // Monotonie : plus la cible est longue, plus l'allure prédite est lente.
    const court = computePersonalDurationCalibration(DECAYING, { targetDurationS: 8000 })
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThan(court.predictedFlatEquivalentPaceS!)
    expect(res.exponent!).toBeGreaterThan(0)
    expect(res.extrapolationRatio).toBeCloseTo(17000 / 14405, 2)
  })

  it('4. exposant borné : une régression très raide sur 3 points reste plafonnée', () => {
    // Décroissance volontairement extrême → k brut très au-dessus du plafond.
    const res = computePersonalDurationCalibration(
      [pt(3600, 250), pt(7200, 400), pt(10800, 550), pt(14400, 700)],
      { targetDurationS: 30000, maxExponent: 0.15 },
    )
    expect(res.rawExponent!).toBeGreaterThan(0.15)
    expect(res.exponent).toBe(0.15)
  })

  it('5. RALENTISSEMENT seul : une allure qui s’améliore avec la durée n’accélère jamais', () => {
    // Cas inverse (bruit ou coureur diesel) : k brut < 0 → borné à 0, prédiction = moyenne.
    const res = computePersonalDurationCalibration(
      [pt(3600, 400), pt(7200, 350), pt(10800, 320), pt(14400, 300)],
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
    expect(res.predictedFlatEquivalentPaceS!).toBeLessThanOrEqual(488 * 1.3 + 1e-6)
  })

  it('6bis. l’extrapolation de DURÉE est plafonnée (pas de composition à l’infini)', () => {
    // Au-delà de 1.25 × ta plus longue course, la durée servant à la prédiction gèle :
    // deux cibles très lointaines donnent donc la même allure prédite.
    const loin = computePersonalDurationCalibration(DECAYING, { targetDurationS: 30_000 })
    const tresLoin = computePersonalDurationCalibration(DECAYING, { targetDurationS: 60_000 })
    expect(loin.predictedFlatEquivalentPaceS).toBeCloseTo(tresLoin.predictedFlatEquivalentPaceS!, 6)
  })

  it('6ter. durée corrélée à la pente → désactivée (collinear_with_steepness)', () => {
    // Les courses longues sont aussi les plus raides : l'attribution durée vs pente
    // n'est pas identifiable → le moteur s'abstient.
    const res = computePersonalDurationCalibration(
      [pt(4402, 358, 1, 20), pt(7831, 398, 1, 32), pt(10527, 428, 1, 44), pt(14405, 488, 1, 56)],
      { targetDurationS: 17000 },
    )
    expect(res.steepnessCollinearity!).toBeGreaterThan(0.5)
    expect(res.active).toBe(false)
    expect(res.reason).toBe('collinear_with_steepness')
  })

  it('6quater. pente qui varie SANS lien avec la durée → l’axe durée reste actif', () => {
    const res = computePersonalDurationCalibration(
      [pt(4402, 358, 1, 45), pt(7831, 398, 1, 20), pt(10527, 428, 1, 50), pt(14405, 488, 1, 25)],
      { targetDurationS: 17000 },
    )
    expect(res.steepnessCollinearity!).toBeLessThan(0.5)
    expect(res.reason).toBe('active')
  })

  it('7. durée cible courte → plancher à la moyenne (pas d’accélération)', () => {
    const res = computePersonalDurationCalibration(DECAYING, { targetDurationS: 1200 })
    expect(res.predictedFlatEquivalentPaceS!).toBeGreaterThanOrEqual(res.referenceFlatEquivalentPaceS!)
  })

  it('8. points inexploitables (durée ou allure nulles) ignorés sans planter', () => {
    const res = computePersonalDurationCalibration(
      [pt(0, 300), pt(4670, 0), pt(4402, 358), pt(7831, 398), pt(10527, 428), pt(14405, 488)],
      { targetDurationS: 17000 },
    )
    // 3 points exploitables restants → régression possible.
    expect(res.reason).toBe('active')
    expect(Number.isFinite(res.predictedFlatEquivalentPaceS!)).toBe(true)
  })

  it('9. pondération respectée : une course lourdement pondérée tire la référence', () => {
    const light = computePersonalDurationCalibration(DECAYING, { targetDurationS: 12000 })
    const heavy = computePersonalDurationCalibration(
      [pt(4402, 358, 0.1), pt(7831, 398, 0.1), pt(10527, 428, 0.1), pt(14405, 488, 10)],
      { targetDurationS: 12000 },
    )
    expect(heavy.referenceFlatEquivalentPaceS!).toBeGreaterThan(light.referenceFlatEquivalentPaceS!)
  })

  it('10. parité web ↔ mobile sur le même jeu d’entrées', () => {
    const opts = { targetDurationS: 17000 }
    expect(mobileCompute(DECAYING, opts)).toEqual(computePersonalDurationCalibration(DECAYING, opts))
  })
})
