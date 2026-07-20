import { describe, it, expect } from 'vitest'
import { clusteredBootstrap, mulberry32, type BootstrapPoint } from '../src/lib/backtestBootstrap'

function pts(spec: Array<[string, number, number]>): BootstrapPoint[] {
  // [clusterId, predicted, actual]
  return spec.map(([c, p, a]) => ({ clusterId: c, predictedS: p, actualS: a, low: p * 0.9, high: p * 1.1 }))
}

describe('backtestBootstrap (§17)', () => {
  it('mulberry32 est déterministe pour un seed donné', () => {
    const r1 = mulberry32(42), r2 = mulberry32(42)
    const s1 = [r1(), r1(), r1()], s2 = [r2(), r2(), r2()]
    expect(s1).toEqual(s2)
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('même seed → IC identiques (reproductibilité)', () => {
    const data = pts([
      ['A', 3000, 3100], ['A', 6000, 5800], ['B', 4000, 4200], ['B', 8000, 7600], ['C', 5000, 5000],
    ])
    const a = clusteredBootstrap(data, { seed: 7, iterations: 500 })
    const b = clusteredBootstrap(data, { seed: 7, iterations: 500 })
    expect(a).toEqual(b)
  })

  it('rééchantillonne les CLUSTERS, pas les lignes (clusters = nb d’athlètes)', () => {
    const data = pts([['A', 3000, 3100], ['A', 6000, 5800], ['B', 4000, 4200]])
    const res = clusteredBootstrap(data, { iterations: 300 })
    expect(res.clusters).toBe(2)
    expect(res.n).toBe(3)
  })

  it('l’IC encadre le point estimé (lo ≤ point ≤ hi)', () => {
    const data = pts([
      ['A', 3000, 3100], ['A', 6100, 5800], ['B', 4000, 4200], ['B', 8000, 7600],
      ['C', 5000, 5000], ['C', 5200, 5400], ['D', 9000, 9500],
    ])
    const res = clusteredBootstrap(data, { iterations: 1000, seed: 3 })
    expect(res.mapePct.lo).toBeLessThanOrEqual(res.mapePct.point)
    expect(res.mapePct.point).toBeLessThanOrEqual(res.mapePct.hi)
    expect(res.maeS.lo).toBeLessThanOrEqual(res.maeS.hi)
    expect(res.coverage).not.toBeNull()
    expect(res.coverage!.lo).toBeLessThanOrEqual(res.coverage!.hi)
  })

  it('un prédicteur parfait donne MAPE ~0 et IC serré', () => {
    const data = pts([['A', 3000, 3000], ['A', 6000, 6000], ['B', 4000, 4000], ['B', 8000, 8000]])
    const res = clusteredBootstrap(data, { iterations: 500 })
    expect(res.mapePct.point).toBeCloseTo(0, 5)
    expect(res.mapePct.hi).toBeCloseTo(0, 5)
  })

  it('le point estimé est la statistique OBSERVÉE, pas la médiane des rééchantillons (§17)', () => {
    const data = pts([
      ['A', 3200, 3000], ['A', 6100, 5800], ['B', 4300, 4000], ['B', 8200, 7600], ['C', 5100, 5000],
    ])
    const res = clusteredBootstrap(data, { iterations: 800, seed: 5 })
    // MAPE observé sur l'échantillon complet.
    const obsMape = (data.reduce((s, p) => s + Math.abs(p.predictedS - p.actualS) / p.actualS, 0) / data.length) * 100
    expect(res.mapePct.point).toBeCloseTo(obsMape, 6)
    const obsBias = data.reduce((s, p) => s + (p.predictedS - p.actualS), 0) / data.length
    expect(res.biasS.point).toBeCloseTo(obsBias, 6)
  })

  it('gère un échantillon vide sans planter', () => {
    const res = clusteredBootstrap([], { iterations: 100 })
    expect(res.clusters).toBe(0)
    expect(res.n).toBe(0)
  })

  it('coverage null quand aucune ligne ne porte d’intervalle', () => {
    const data: BootstrapPoint[] = [
      { clusterId: 'A', predictedS: 3000, actualS: 3100 },
      { clusterId: 'B', predictedS: 4000, actualS: 4200 },
    ]
    const res = clusteredBootstrap(data, { iterations: 200 })
    expect(res.coverage).toBeNull()
  })
})
