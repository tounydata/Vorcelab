import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { computeRaceProjection as mobileProjection } from '../mobile/src/lib/computeRaceProjection'

// ── Lissage altimétrique en PRODUCTION (option smoothElevation) ────────────────
// Un GPX importé au relief bruité ne doit plus faire passer un parcours plat pour
// un trail à fort D+. Sans l'option → comportement inchangé.

// Bruit barométrique borné ±amp, déterministe (reproductible).
function noise(i: number, amp: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 2 * amp
}

// ~21 km plats avec dérive barométrique ±3 m — le brut gonfle le D+.
function noisyFlatRoad(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 47, lon0 = 7, degPerM = 0.00127 / 100
  const step = 10
  for (let i = 0; i <= 2100; i++) {
    const d = i * step
    pts.push({ lat: lat0, lon: lon0 + d * degPerM, ele: 100 + 3 * Math.sin(d / 2500) + noise(i, 3) })
  }
  return pts
}

const profile = { fc_max: 185 }

describe('smoothElevation en production', () => {
  it('réduit fortement le D+ gonflé par le bruit', () => {
    const pts = noisyFlatRoad()
    const raw = computeRaceProjection(pts, [], profile, { type: null }, null)
    const smoothed = computeRaceProjection(pts, [], profile, { type: null }, null, { smoothElevation: true })
    expect(raw.dplus).toBeGreaterThan(200)          // brut : D+ artificiellement élevé
    expect(smoothed.dplus).toBeLessThan(raw.dplus / 2) // lissé : bien plus bas
    expect(smoothed.dplus / (smoothed.totalDistM / 1000)).toBeLessThan(10) // reste « route »
  })

  it('sans l’option : comportement strictement inchangé', () => {
    const pts = noisyFlatRoad()
    const a = computeRaceProjection(pts, [], profile, { type: null }, null)
    const b = computeRaceProjection(pts, [], profile, { type: null }, null, {})
    expect(a.dplus).toBe(b.dplus)
    expect(a.estTimeS).toBe(b.estTimeS)
  })

  it('ne modifie pas la distance', () => {
    const pts = noisyFlatRoad()
    const raw = computeRaceProjection(pts, [], profile, { type: null }, null)
    const smoothed = computeRaceProjection(pts, [], profile, { type: null }, null, { smoothElevation: true })
    expect(Math.abs(smoothed.totalDistM - raw.totalDistM)).toBeLessThan(1)
  })

  it('web et mobile identiques avec l’option activée', () => {
    const pts = noisyFlatRoad()
    const web = computeRaceProjection(pts, [], profile, { type: null }, null, { smoothElevation: true })
    const mob = mobileProjection(pts as never, [], profile as never, { type: null }, null, { smoothElevation: true })
    expect(web.dplus).toBe(mob.dplus)
    expect(web.estTimeS).toBe(mob.estTimeS)
  })
})
