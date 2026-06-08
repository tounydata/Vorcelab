import { describe, it, expect } from 'vitest'
import { bearing, sectionTurnDegPerKm, hav, type LatLon } from '../src/lib/gpxCore'

describe('bearing', () => {
  it('plein est ≈ 90°, plein nord ≈ 0°', () => {
    expect(bearing({ lat: 45, lon: 5 }, { lat: 45, lon: 5.01 })).toBeCloseTo(90, 0)
    expect(bearing({ lat: 45, lon: 5 }, { lat: 45.01, lon: 5 })).toBeCloseTo(0, 0)
  })
})

// Construit une polyligne + ses distances cumulées (m).
function withCum(pts: LatLon[]) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]))
  return cum
}

describe('sectionTurnDegPerKm', () => {
  it('tracé droit → sinuosité ~0', () => {
    const pts: LatLon[] = []
    for (let i = 0; i <= 100; i++) pts.push({ lat: 45, lon: 5 + i * 0.0002 }) // ligne droite est
    const cum = withCum(pts)
    const endKm = cum[cum.length - 1] / 1000
    expect(sectionTurnDegPerKm(pts, cum, 0, endKm)).toBeLessThan(20)
  })

  it('tracé en lacets (zigzags) → sinuosité élevée', () => {
    const pts: LatLon[] = []
    // zigzag : alterne nord-est / sud-est → virages serrés répétés
    for (let i = 0; i <= 120; i++) {
      const lon = 5 + i * 0.00015
      const lat = 45 + (i % 2 === 0 ? 0 : 0.0006) // dent de scie
      pts.push({ lat, lon })
    }
    const cum = withCum(pts)
    const endKm = cum[cum.length - 1] / 1000
    expect(sectionTurnDegPerKm(pts, cum, 0, endKm)).toBeGreaterThan(250)
  })

  it('renvoie 0 si trop peu de points', () => {
    const pts: LatLon[] = [{ lat: 45, lon: 5 }, { lat: 45, lon: 5.001 }]
    expect(sectionTurnDegPerKm(pts, withCum(pts), 0, 0.1)).toBe(0)
  })
})
