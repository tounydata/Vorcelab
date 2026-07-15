import { describe, it, expect } from 'vitest'
import {
  percentile, computeErrorMetrics, activitiesBefore, distanceBucket, dplusBucket, runBacktest,
  type RaceCase,
} from '../src/lib/engineBacktest'

describe('percentile (nearest-rank)', () => {
  const v = [10, 20, 30, 40, 50]
  it('médiane et quantiles', () => {
    expect(percentile(v, 50)).toBe(30)
    expect(percentile(v, 75)).toBe(40)
    expect(percentile(v, 90)).toBe(50)
    expect(percentile(v, 0)).toBe(10)
  })
})

describe('computeErrorMetrics', () => {
  it('calcule MAE, MAPE, biais, médiane/P75/P90 et couverture d’intervalle', () => {
    const m = computeErrorMetrics([
      { predictedS: 3600, actualS: 3600, low: 3500, high: 3700 }, // parfait ; réel dans l’intervalle
      { predictedS: 3660, actualS: 3600, low: 3500, high: 3700 }, // +60 ; réel dans l’intervalle
      { predictedS: 3480, actualS: 3900, low: 3500, high: 3700 }, // réel 3900 HORS [3500,3700]
    ])
    expect(m.n).toBe(3)
    expect(m.maeS).toBeCloseTo((0 + 60 + 420) / 3, 5)
    expect(m.meanBiasS).toBeCloseTo((0 + 60 - 420) / 3, 5)
    expect(m.medianAbsS).toBe(60)
    // Calibration : fraction des RÉELS tombant dans l’intervalle prédit → 2 sur 3.
    expect(m.intervalCoverage).toBeCloseTo(2 / 3, 5)
    expect(m.mapePct).toBeCloseTo(((0 + 60 / 3600 + 420 / 3900) / 3) * 100, 5)
  })

  it('liste vide → n=0, couverture null', () => {
    const m = computeErrorMetrics([])
    expect(m.n).toBe(0)
    expect(m.intervalCoverage).toBeNull()
  })
})

describe('activitiesBefore — anti-fuite temporelle', () => {
  const acts = [
    { start_date: '2026-05-01T08:00:00Z' },
    { start_date: '2026-05-10T08:00:00Z' },
    { start_date: '2026-05-15T09:00:00Z' }, // le jour de la course, plus tard → exclu
    { start_date: '2026-06-01T08:00:00Z' }, // après → exclu
  ]
  it('ne garde que les activités strictement antérieures au départ', () => {
    const before = activitiesBefore(acts, '2026-05-15T08:00:00Z')
    expect(before.map((a) => a.start_date)).toEqual(['2026-05-01T08:00:00Z', '2026-05-10T08:00:00Z'])
  })
  it('date de course invalide → aucune activité (prudence)', () => {
    expect(activitiesBefore(acts, 'pas-une-date')).toEqual([])
  })
})

describe('buckets', () => {
  it('distance', () => {
    expect(distanceBucket(10)).toBe('<15km')
    expect(distanceBucket(21)).toBe('15–30km')
    expect(distanceBucket(160)).toBe('80km+')
  })
  it('D+/km', () => {
    expect(dplusBucket(undefined)).toBe('inconnu')
    expect(dplusBucket(5)).toBe('plat (<10)')
    expect(dplusBucket(30)).toBe('montagneux (25–40)')
  })
})

describe('runBacktest — pas de fuite + ventilation', () => {
  it('le moteur ne reçoit que les activités antérieures et les métriques sont ventilées', () => {
    const cases: RaceCase[] = [
      {
        raceStartISO: '2026-05-15T08:00:00Z', actualS: 3600, distanceKm: 10, terrain: 'road', dplusPerKm: 5,
        activities: [{ start_date: '2026-05-01T08:00:00Z' }, { start_date: '2026-06-01T08:00:00Z' }],
      },
      {
        raceStartISO: '2026-06-20T06:00:00Z', actualS: 18000, distanceKm: 55, terrain: 'trail', dplusPerKm: 35,
        activities: [{ start_date: '2026-06-01T08:00:00Z' }],
      },
    ]
    let leaked = false
    const report = runBacktest(cases, ({ activitiesBefore, distanceKm }) => {
      // Vérifie qu'aucune activité postérieure au départ n'est fournie.
      for (const a of activitiesBefore) {
        if (Date.parse(a.start_date ?? '') >= Date.parse(cases.find((c) => c.distanceKm === distanceKm)!.raceStartISO)) leaked = true
      }
      // Projection factice : predicted = actual + 1% (déterministe).
      const actual = distanceKm === 10 ? 3600 : 18000
      return { predictedS: Math.round(actual * 1.01), low: actual * 0.98, high: actual * 1.03 }
    })
    expect(leaked).toBe(false)
    expect(report.overall.n).toBe(2)
    expect(report.byTerrain.road.n).toBe(1)
    expect(report.byTerrain.trail.n).toBe(1)
    expect(report.byDistance['<15km'].n).toBe(1)
    expect(report.byDistance['50–80km'].n).toBe(1)
    expect(report.overall.intervalCoverage).toBe(1) // +1% tombe dans [-2%,+3%]
  })
})
