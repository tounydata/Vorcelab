import { describe, it, expect } from 'vitest'
import {
  computeHrZones, sanitizeBounds, pctToBpm, defaultZoneConfig,
  missingInputFor, DEFAULT_BOUNDS,
} from '../src/lib/hrZones'

describe('sanitizeBounds', () => {
  it('garde 4 bornes croissantes valides', () => {
    expect(sanitizeBounds([0.6, 0.7, 0.8, 0.9], 'fcmax')).toEqual([0.6, 0.7, 0.8, 0.9])
  })
  it('retombe sur le défaut si non croissant ou mauvaise taille', () => {
    expect(sanitizeBounds([0.6, 0.6, 0.8, 0.9], 'fcmax')).toEqual(DEFAULT_BOUNDS.fcmax)
    expect(sanitizeBounds([0.6, 0.7], 'fcmax')).toEqual(DEFAULT_BOUNDS.fcmax)
    expect(sanitizeBounds([NaN, 0.7, 0.8, 0.9], 'fcmax')).toEqual(DEFAULT_BOUNDS.fcmax)
  })
})

describe('pctToBpm — les 3 modèles', () => {
  it('%FCmax : pct × FCmax', () => {
    expect(pctToBpm(0.8, defaultZoneConfig('fcmax'), { fcMax: 190 })).toBe(152)
  })
  it('Karvonen : FCrepos + pct × (FCmax − FCrepos)', () => {
    // 50 + 0.8 × (190 − 50) = 162
    expect(pctToBpm(0.8, { model: 'hrr', bounds: DEFAULT_BOUNDS.hrr, restingHr: 50 }, { fcMax: 190 })).toBe(162)
  })
  it('LTHR : pct × LTHR', () => {
    expect(pctToBpm(0.95, { model: 'lthr', bounds: DEFAULT_BOUNDS.lthr, lthr: 170 }, {})).toBe(162)
  })
  it('null si donnée manquante', () => {
    expect(pctToBpm(0.8, defaultZoneConfig('fcmax'), { fcMax: null })).toBeNull()
    expect(pctToBpm(0.8, { model: 'hrr', bounds: DEFAULT_BOUNDS.hrr }, { fcMax: 190 })).toBeNull()
  })
})

describe('computeHrZones', () => {
  it('produit 5 zones avec bords ouverts (Z1 bas, Z5 haut)', () => {
    const zones = computeHrZones(defaultZoneConfig('fcmax'), { fcMax: 200 })
    expect(zones).toHaveLength(5)
    expect(zones[0].fromBpm).toBeNull()             // Z1 ouvert en bas
    expect(zones[0].toBpm).toBe(120)                // 0.60 × 200
    expect(zones[4].toBpm).toBeNull()               // Z5 ouvert en haut
    expect(zones[4].fromBpm).toBe(180)              // 0.90 × 200
  })
  it('respecte des bornes personnalisées', () => {
    const zones = computeHrZones({ model: 'fcmax', bounds: [0.65, 0.75, 0.85, 0.92] }, { fcMax: 200 })
    expect(zones[1].fromBpm).toBe(130) // 0.65 × 200
    expect(zones[3].toBpm).toBe(184)   // 0.92 × 200
  })
})

describe('missingInputFor', () => {
  it('signale la donnée requise par modèle', () => {
    expect(missingInputFor(defaultZoneConfig('fcmax'), {})).toBe('fcMax')
    expect(missingInputFor(defaultZoneConfig('fcmax'), { fcMax: 190 })).toBeNull()
    expect(missingInputFor({ model: 'hrr', bounds: DEFAULT_BOUNDS.hrr }, { fcMax: 190 })).toBe('restingHr')
    expect(missingInputFor({ model: 'lthr', bounds: DEFAULT_BOUNDS.lthr }, {})).toBe('lthr')
  })
})
