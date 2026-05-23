import { describe, it, expect } from 'vitest'
import { hav, minettiGradePenalty, buildDetailedSections } from '../src/utils/gpxCore'
import type { KmSeg } from '../src/utils/gpxCore'

// ── hav (haversine) ───────────────────────────────────────────────────────────

describe('hav', () => {
  it('retourne 0 pour deux points identiques', () => {
    expect(hav({ lat: 45.8, lon: 6.8 }, { lat: 45.8, lon: 6.8 })).toBe(0)
  })

  it('distance Paris → Lyon ≈ 390 km (±10 km)', () => {
    const d = hav({ lat: 48.8566, lon: 2.3522 }, { lat: 45.7640, lon: 4.8357 })
    expect(d).toBeGreaterThan(380_000)
    expect(d).toBeLessThan(400_000)
  })

  it('symétrie : d(A,B) = d(B,A)', () => {
    const a = { lat: 45.8, lon: 6.8 }
    const b = { lat: 45.9, lon: 6.9 }
    expect(hav(a, b)).toBeCloseTo(hav(b, a), 1)
  })

  it('10m vers le nord depuis 45° ≈ 1 111 m (1/100° de lat)', () => {
    const d = hav({ lat: 45.0, lon: 6.0 }, { lat: 45.01, lon: 6.0 })
    expect(d).toBeGreaterThan(1_000)
    expect(d).toBeLessThan(1_200)
  })
})

// ── minettiGradePenalty ───────────────────────────────────────────────────────

describe('minettiGradePenalty', () => {
  it('retourne 0 à pente nulle', () => {
    expect(minettiGradePenalty(0)).toBeCloseTo(0, 2)
  })

  it('penalité positive en montée', () => {
    expect(minettiGradePenalty(0.10)).toBeGreaterThan(0)
    expect(minettiGradePenalty(0.30)).toBeGreaterThan(0)
  })

  it('penalité monotone croissante avec la pente positive', () => {
    const p10 = minettiGradePenalty(0.10)
    const p20 = minettiGradePenalty(0.20)
    const p40 = minettiGradePenalty(0.40)
    expect(p20).toBeGreaterThan(p10)
    expect(p40).toBeGreaterThan(p20)
  })

  it('faible pente descendante (-5%) → léger gain (négatif)', () => {
    expect(minettiGradePenalty(-0.05)).toBeLessThan(0)
  })

  it('forte pente descendante (-30%) → coût positif (freinage)', () => {
    expect(minettiGradePenalty(-0.30)).toBeGreaterThan(0)
  })

  it('respecte les bornes de saturation (grade ≥ 0.5 cap)', () => {
    const p50 = minettiGradePenalty(0.50)
    const p99 = minettiGradePenalty(0.99)
    expect(p50).toBeCloseTo(p99, 0)  // saturés au même plafond
  })
})

// ── buildDetailedSections ─────────────────────────────────────────────────────

function makeSegs(profile: { d: number; dplus: number; dminus: number }[]): KmSeg[] {
  let km = 0
  return profile.map(p => {
    const seg: KmSeg = { startKm: km, endKm: km + p.d / 1000, dist: p.d, dplus: p.dplus, dminus: p.dminus, grade: (p.dplus - p.dminus) / p.d * 100, altEnd: null }
    km += p.d / 1000
    return seg
  })
}

describe('buildDetailedSections', () => {
  it('retourne [] sur entrée vide', () => {
    expect(buildDetailedSections([])).toEqual([])
  })

  it('trace plat → une section type flat', () => {
    const segs = makeSegs(Array(10).fill({ d: 100, dplus: 0, dminus: 0 }))
    const sections = buildDetailedSections(segs)
    expect(sections.length).toBeGreaterThanOrEqual(1)
    expect(sections.every(s => s.type === 'flat')).toBe(true)
  })

  it('montée pure → section(s) type up', () => {
    const segs = makeSegs(Array(15).fill({ d: 150, dplus: 15, dminus: 0 }))
    const sections = buildDetailedSections(segs)
    const up = sections.filter(s => s.type === 'up')
    expect(up.length).toBeGreaterThanOrEqual(1)
  })

  it('profil montée-descente → au moins une section up et une down', () => {
    const upSegs = makeSegs(Array(10).fill({ d: 200, dplus: 20, dminus: 0 }))
    const downSegs = makeSegs(Array(10).fill({ d: 200, dplus: 0, dminus: 20 }))
    // reset km des downSegs
    const combined: KmSeg[] = []
    let km = 0
    for (const s of [...upSegs, ...downSegs]) {
      combined.push({ ...s, startKm: km, endKm: km + s.dist / 1000 })
      km += s.dist / 1000
    }
    const sections = buildDetailedSections(combined)
    expect(sections.some(s => s.type === 'up')).toBe(true)
    expect(sections.some(s => s.type === 'down')).toBe(true)
  })

  it('distance totale des sections ≈ distance totale des segs', () => {
    const segs = makeSegs([
      { d: 500, dplus: 50, dminus: 0 },
      { d: 500, dplus: 0, dminus: 50 },
      { d: 300, dplus: 0, dminus: 0 },
    ])
    const sections = buildDetailedSections(segs)
    const totalSec = sections.reduce((a, s) => a + s.dist, 0)
    const totalSeg = segs.reduce((a, s) => a + s.dist, 0)
    expect(totalSec).toBeCloseTo(totalSeg, -1)
  })

  it('fusionne les sections flat adjacentes', () => {
    // Deux zones plates séparées d'un tout petit changement → doivent fusionner
    const segs = makeSegs([
      ...Array(5).fill({ d: 100, dplus: 0, dminus: 0 }),
      { d: 100, dplus: 5, dminus: 0 },   // trop petit pour séparer (< MIN_CHANGE=12)
      ...Array(5).fill({ d: 100, dplus: 0, dminus: 0 }),
    ])
    const sections = buildDetailedSections(segs)
    const flats = sections.filter(s => s.type === 'flat')
    // Pas de deux flat consécutifs dans le résultat
    for (let i = 0; i < sections.length - 1; i++) {
      expect(!(sections[i].type === 'flat' && sections[i + 1].type === 'flat')).toBe(true)
    }
    expect(flats.length).toBeGreaterThanOrEqual(1)
  })
})
