import { describe, it, expect } from 'vitest'
import {
  computeProjectionAccuracy,
  describeBias,
  type AccuracySnapshot,
} from '../src/lib/projectionAccuracy'

// Boucle de validation : confronte les prédictions FIGÉES avant la course aux résultats
// réels, par version de moteur. C'est ce qui manquait — le moteur se calait sur les
// courses de l'athlète mais n'a jamais lu ses propres erreurs.

const snap = (o: Partial<AccuracySnapshot> & { predictionCentralS: number }): AccuracySnapshot => ({
  engineVersion: '2026.07-9',
  predictionAggressiveS: Math.round(o.predictionCentralS * 0.84),
  predictionPrudentS: Math.round(o.predictionCentralS * 1.16),
  status: 'evaluated',
  ...o,
})

describe('computeProjectionAccuracy', () => {
  it('1. aucun snapshot → rapport vide, jamais de NaN propagé en compteur', () => {
    const r = computeProjectionAccuracy([])
    expect(r.evaluatedCount).toBe(0)
    expect(r.pendingCount).toBe(0)
    expect(r.byVersion).toEqual([])
    expect(r.optimisticRate).toBeNull()
  })

  it('2. snapshots sans résultat → comptés en attente, pas en évalués', () => {
    const r = computeProjectionAccuracy([
      snap({ predictionCentralS: 12000, status: 'locked', resultMovingS: null }),
      snap({ predictionCentralS: 9000, status: 'locked' }),
    ])
    expect(r.evaluatedCount).toBe(0)
    expect(r.pendingCount).toBe(2)
  })

  it('3. un moteur OPTIMISTE ressort avec un biais négatif', () => {
    // Prédit 2h30, réalisé 2h55 — le cas réel qui a motivé tout ce travail.
    const r = computeProjectionAccuracy([
      snap({ predictionCentralS: 9000, resultMovingS: 10494 }),
      snap({ predictionCentralS: 4560, resultMovingS: 5486 }),
    ])
    expect(r.evaluatedCount).toBe(2)
    expect(r.overallMoving.meanBiasS).toBeLessThan(0) // prédit − réel < 0 ⇒ optimiste
    expect(r.overallMoving.mapePct).toBeGreaterThan(10)
    expect(r.optimisticRate).toBe(1)
  })

  it('4. un moteur CONSERVATEUR ressort avec un biais positif', () => {
    const r = computeProjectionAccuracy([
      snap({ predictionCentralS: 11000, resultMovingS: 10000 }),
      snap({ predictionCentralS: 6000, resultMovingS: 5500 }),
    ])
    expect(r.overallMoving.meanBiasS).toBeGreaterThan(0)
    expect(r.optimisticRate).toBe(0)
  })

  it('5. ventilation PAR VERSION — c’est là qu’une régression devient visible', () => {
    const r = computeProjectionAccuracy([
      // Version -7 : juste.
      snap({ engineVersion: '2026.07-7', predictionCentralS: 10000, resultMovingS: 10100 }),
      snap({ engineVersion: '2026.07-7', predictionCentralS: 5000, resultMovingS: 5050 }),
      // Version -8 : sur-corrige lourdement (annonce beaucoup trop lent).
      snap({ engineVersion: '2026.07-8', predictionCentralS: 14600, resultMovingS: 12000 }),
      snap({ engineVersion: '2026.07-8', predictionCentralS: 7300, resultMovingS: 6000 }),
    ])
    expect(r.byVersion.map((v) => v.engineVersion)).toEqual(['2026.07-8', '2026.07-7'])
    const v7 = r.byVersion.find((v) => v.engineVersion === '2026.07-7')!
    const v8 = r.byVersion.find((v) => v.engineVersion === '2026.07-8')!
    expect(v7.moving.mapePct).toBeLessThan(3)
    expect(v8.moving.mapePct).toBeGreaterThan(15)
    expect(v8.moving.meanBiasS).toBeGreaterThan(0) // trop lent
  })

  it('6. couverture de l’intervalle [agressif, prudent]', () => {
    const r = computeProjectionAccuracy([
      snap({ predictionCentralS: 10000, resultMovingS: 10200 }), // dedans
      snap({ predictionCentralS: 10000, resultMovingS: 14000 }), // dehors
    ])
    expect(r.overallMoving.intervalCoverage).toBeCloseTo(0.5, 6)
  })

  it('7. les snapshots invalidés ne sont jamais jugés', () => {
    const r = computeProjectionAccuracy([
      snap({ predictionCentralS: 10000, resultMovingS: 20000, status: 'invalidated' }),
      snap({ predictionCentralS: 10000, resultMovingS: 10100 }),
    ])
    expect(r.evaluatedCount).toBe(1)
    expect(r.overallMoving.mapePct).toBeLessThan(3)
  })

  it('8. moving et elapsed sont mesurés séparément', () => {
    // 10 % d'arrêts : le chrono officiel est plus lent que le temps de mouvement.
    const r = computeProjectionAccuracy([
      snap({ predictionCentralS: 10000, resultMovingS: 10000, resultElapsedS: 11000 }),
    ])
    expect(r.overallMoving.mapePct).toBeCloseTo(0, 6)
    expect(r.overallElapsed.mapePct).toBeCloseTo(9.09, 1)
  })

  it('9. filtrage par data_split (isoler la campagne de validation)', () => {
    const r = computeProjectionAccuracy(
      [
        snap({ predictionCentralS: 10000, resultMovingS: 10100, dataSplit: 'validation' }),
        snap({ predictionCentralS: 10000, resultMovingS: 20000, dataSplit: 'development' }),
      ],
      { dataSplit: 'validation' },
    )
    expect(r.evaluatedCount).toBe(1)
    expect(r.overallMoving.mapePct).toBeLessThan(3)
  })

  it('10. describeBias reste muet tant que l’échantillon est trop mince', () => {
    const few = computeProjectionAccuracy([snap({ predictionCentralS: 9000, resultMovingS: 10494 })])
    expect(describeBias(few.overallMoving)).toBeNull()

    const enough = computeProjectionAccuracy([
      snap({ predictionCentralS: 9000, resultMovingS: 10494 }),
      snap({ predictionCentralS: 4560, resultMovingS: 5486 }),
      snap({ predictionCentralS: 4271, resultMovingS: 4670 }),
    ])
    expect(describeBias(enough.overallMoving)).toMatch(/Optimiste/)
  })
})
