import { describe, it, expect } from 'vitest'
import { smoothElevationProfile } from '../src/lib/elevationProfile'
import type { GpxPoint } from '../src/lib/computeRaceProjection'

// ── Helpers ──────────────────────────────────────────────────────────────────
// ~5 m entre points (lat 45 : 0.00127° lon ≈ 100 m). Streams Strava ≈ pas fin.
const LAT0 = 45.0, LON0 = 6.0
const DEG_PER_M = 0.00127 / 100

/** Construit un tracé : altitude = f(distance en m), points espacés de `stepM`. */
function track(lengthM: number, stepM: number, ele: (distM: number) => number | null): GpxPoint[] {
  const pts: GpxPoint[] = []
  const nb = Math.floor(lengthM / stepM)
  for (let i = 0; i <= nb; i++) {
    const d = i * stepM
    pts.push({ lat: LAT0, lon: LON0 + d * DEG_PER_M, ele: ele(d) })
  }
  return pts
}

/** Bruit déterministe borné (±amp) — reproductible, sans Math.random. */
function noise(seed: number, amp: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 2 * amp
}

describe('smoothElevationProfile', () => {
  it('1. plat + bruit ±1 m : D+ final proche de zéro (le brut, lui, explose)', () => {
    const pts = track(1000, 5, (d) => 100 + noise(d, 1))
    const r = smoothElevationProfile({ points: pts })
    expect(r.rawGainM).toBeGreaterThan(30) // le bruit brut accumule
    expect(r.finalGainM).toBeLessThan(10)  // lissé : quasi nul
  })

  it('2. plat + oscillations répétées : pas d’accumulation artificielle', () => {
    // Oscillation ±1.5 m à courte période — le pire cas pour un cumul naïf.
    const pts = track(2000, 5, (d) => 100 + 1.5 * Math.sin(d / 7))
    const r = smoothElevationProfile({ points: pts })
    expect(r.rawGainM).toBeGreaterThan(100)
    expect(r.finalGainM).toBeLessThan(15)
  })

  it('3. montée réelle continue : D+ proche de la montée réelle', () => {
    // 4 % sur 500 m → +20 m réels.
    const pts = track(500, 5, (d) => 100 + 0.04 * d)
    const r = smoothElevationProfile({ points: pts })
    expect(r.finalGainM).toBeGreaterThan(17)
    expect(r.finalGainM).toBeLessThan(23)
  })

  it('4. vallonné : les montées principales sont conservées', () => {
    // 3 bosses de ~30 m (amplitude 15 sin) sur 1500 m.
    const pts = track(1500, 5, (d) => 100 + 15 * Math.sin((d / 1500) * 3 * 2 * Math.PI))
    const r = smoothElevationProfile({ points: pts })
    // 3 montées de ~30 m ≈ 90 m de D+ réel — conservé à ±25 %.
    expect(r.finalGainM).toBeGreaterThan(65)
    expect(r.finalGainM).toBeLessThan(115)
  })

  it('5. altitudes manquantes (début, milieu, fin) : interpolées, pas de crash', () => {
    const pts = track(1000, 5, (d) => {
      if (d < 50) return null           // préfixe manquant
      if (d > 480 && d < 520) return null // trou au milieu
      if (d > 950) return null          // suffixe manquant
      return 100 + 0.03 * d
    })
    const r = smoothElevationProfile({ points: pts })
    expect(Number.isFinite(r.finalGainM)).toBe(true)
    expect(r.altCoverage).toBeLessThan(1)
    expect(r.finalGainM).toBeGreaterThan(20) // la montée réelle reste visible
  })

  it('6. altitude aberrante ponctuelle : écrasée par le filtre médian', () => {
    const pts = track(1000, 5, (d) => (Math.abs(d - 500) < 3 ? 100 + 60 : 100))
    const r = smoothElevationProfile({ points: pts })
    // Un pic isolé de +60 m ne doit pas créer 120 m de D+.
    expect(r.finalGainM).toBeLessThan(15)
  })

  it('7. recalage vers un D+ Strava plausible', () => {
    // Profil bruité, on vise 50 m Strava.
    const pts = track(1000, 5, (d) => 100 + 0.03 * d + noise(d, 2))
    const r = smoothElevationProfile({ points: pts, targetElevationGainM: 50 })
    expect(r.wasCalibrated).toBe(true)
    expect(r.calibrationRatio).not.toBe(1)
    expect(Math.abs(r.finalGainM - 50)).toBeLessThan(8)
  })

  it('8a. aucun recalage lorsque le D+ Strava est absent', () => {
    const pts = track(1000, 5, (d) => 100 + 0.03 * d + noise(d, 2))
    const r = smoothElevationProfile({ points: pts })
    expect(r.wasCalibrated).toBe(false)
    expect(r.calibrationRatio).toBe(1)
  })

  it('8b. aucun recalage lorsque le facteur serait absurde (incohérent)', () => {
    // D+ lissé ~30 m, Strava annonce 5000 m → ratio > MAX, on refuse.
    const pts = track(1000, 5, (d) => 100 + 0.03 * d)
    const r = smoothElevationProfile({ points: pts, targetElevationGainM: 5000 })
    expect(r.wasCalibrated).toBe(false)
  })

  it('9. distance GPS inchangée après traitement', () => {
    const pts = track(1000, 5, (d) => 100 + 5 * Math.sin(d / 50) + noise(d, 1))
    const r = smoothElevationProfile({ points: pts, targetElevationGainM: 40 })
    // Reconstruit la distance depuis les points de sortie (lat/lon inchangés).
    let dist = 0
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i]
      const R = 6371000, rad = Math.PI / 180
      const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
      dist += R * 2 * Math.asin(Math.sqrt(h))
    }
    expect(Math.abs(dist - r.distanceM)).toBeLessThan(0.001)
  })

  it('10. semi-marathon plat bruité : pas classé « fort D+/km »', () => {
    // 21.1 km plats, bruit ±1.5 m. Le brut donnerait un D+/km > 20 (faux trail).
    const pts = track(21097, 10, (d) => 100 + noise(d, 1.5))
    const r = smoothElevationProfile({ points: pts })
    const rawDpKm = r.rawGainM / (r.distanceM / 1000)
    const smoothedDpKm = r.finalGainM / (r.distanceM / 1000)
    expect(rawDpKm).toBeGreaterThan(20)   // le bruit brut simule un trail
    expect(smoothedDpKm).toBeLessThan(10) // lissé : bien route
  })

  it('déterministe : deux exécutions donnent le même résultat', () => {
    const build = () => track(1000, 5, (d) => 100 + 0.03 * d + noise(d, 2))
    const a = smoothElevationProfile({ points: build(), targetElevationGainM: 50 })
    const b = smoothElevationProfile({ points: build(), targetElevationGainM: 50 })
    expect(a.finalGainM).toBe(b.finalGainM)
    expect(a.calibrationRatio).toBe(b.calibrationRatio)
  })
})
