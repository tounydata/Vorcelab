import { describe, it, expect } from 'vitest'
import { reconstructGpx } from '../src/lib/gpxReconstruct'

describe('reconstructGpx — reconstruction du tracé', () => {
  it('reconstruit avec latlng + altitude (forme { data })', () => {
    const r = reconstructGpx({
      latlng: { data: [[47.7, 7.3], [47.701, 7.301], [47.702, 7.302]] },
      altitude: { data: [200, 210, 205] },
    })
    expect(r.usable).toBe(true)
    expect(r.keptCount).toBe(3)
    expect(r.points[1]).toEqual({ lat: 47.701, lon: 7.301, ele: 210 })
    expect(r.altCoverage).toBe(1)
    expect(r.issues).toEqual([])
  })

  it('accepte les streams sous forme de tableau direct', () => {
    const r = reconstructGpx({
      latlng: [[47.7, 7.3], [47.701, 7.301]],
      altitude: [200, 210],
    })
    expect(r.usable).toBe(true)
    expect(r.keptCount).toBe(2)
  })

  it('gère des tableaux de tailles différentes (intersection)', () => {
    const r = reconstructGpx({
      latlng: { data: [[47.7, 7.3], [47.701, 7.301], [47.702, 7.302]] },
      altitude: { data: [200, 210] }, // plus court
    })
    expect(r.keptCount).toBe(3)
    expect(r.issues).toContain('length_mismatch')
    // Le 3e point n'a pas d'altitude propre → comblé par report avant (210).
    expect(r.points[2].ele).toBe(210)
  })

  it('altitude absente → ele null, pas de crash', () => {
    const r = reconstructGpx({ latlng: { data: [[47.7, 7.3], [47.701, 7.301]] } })
    expect(r.usable).toBe(true)
    expect(r.points.every((p) => p.ele === null)).toBe(true)
    expect(r.issues).toContain('no_altitude')
    expect(r.altCoverage).toBe(0)
  })

  it('écarte les points GPS invalides (NaN, hors plage, (0,0))', () => {
    const r = reconstructGpx({
      latlng: { data: [[47.7, 7.3], [null, 7.3], [0, 0], [999, 7.3], [47.702, 7.302]] },
      altitude: { data: [200, 201, 202, 203, 204] },
    })
    expect(r.keptCount).toBe(2)
    expect(r.rawLatlngCount).toBe(5)
    expect(r.gpsCoverage).toBeCloseTo(2 / 5, 5)
    expect(r.issues).toContain('partial_gps')
  })

  it('streams vides → inexploitable', () => {
    const r = reconstructGpx({ latlng: { data: [] } })
    expect(r.usable).toBe(false)
    expect(r.issues).toContain('no_latlng')
  })

  it('null / undefined → inexploitable sans crash', () => {
    expect(reconstructGpx(null).usable).toBe(false)
    expect(reconstructGpx(undefined).usable).toBe(false)
  })

  it('altitude aberrante (baro spike) → écartée (null)', () => {
    const r = reconstructGpx({
      latlng: { data: [[47.7, 7.3], [47.701, 7.301]] },
      altitude: { data: [200, 50000] },
    })
    expect(r.points[0].ele).toBe(200)
    // 50000 rejeté → comblé par report avant (200).
    expect(r.points[1].ele).toBe(200)
  })
})
