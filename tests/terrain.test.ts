import { describe, it, expect } from 'vitest'
import { terrainTimePenalty, slipRisk, surfaceInfo, TERRAIN_TIME_FACTORS } from '../src/lib/terrain'

describe('terrainTimePenalty', () => {
  it('surface dure = neutre (1.0), sentier > 1, sable > sentier', () => {
    expect(terrainTimePenalty('asphalt', null)).toBe(1)
    expect(terrainTimePenalty('path', null)).toBeGreaterThan(1)
    expect(terrainTimePenalty('sand', null)).toBeGreaterThan(terrainTimePenalty('path', null))
  })

  it('pluie ajoute un malus sur surface non dure, pas sur le bitume', () => {
    const dry = terrainTimePenalty('gravel', { precip: 0 })
    const wet = terrainTimePenalty('gravel', { precip: 5 })
    expect(wet).toBeGreaterThan(dry)
    expect(terrainTimePenalty('asphalt', { precip: 5 })).toBe(1)
  })

  it('descente raide sur terrain instable → malus supplémentaire', () => {
    const flat = terrainTimePenalty('scree', null, 0)
    const steepDown = terrainTimePenalty('scree', null, -18)
    expect(steepDown).toBeGreaterThan(flat)
  })

  it('plafonné à 1.35', () => {
    expect(terrainTimePenalty('mud', { precip: 10 }, -25)).toBeLessThanOrEqual(1.35)
  })

  it('facteur perso (terrainCalibration) appliqué si présent', () => {
    const base = terrainTimePenalty('gravel', null)
    const perso = terrainTimePenalty('gravel', null, 0, null, { terrainCalibration: { gravel: 1.2 } })
    expect(perso).toBeGreaterThan(base)
  })
})

describe('slipRisk', () => {
  it('boue = toujours glissant, bitume = jamais', () => {
    expect(slipRisk('mud', null)).toBeTruthy()
    expect(slipRisk('asphalt', { precip: 10 })).toBeNull()
  })
  it('herbe glissante seulement si humide', () => {
    expect(slipRisk('grass', { precip: 0 })).toBeNull()
    expect(slipRisk('grass', { precip: 5 })).toBeTruthy()
  })
  it('graviers instables en descente raide même sec', () => {
    expect(slipRisk('gravel', { precip: 0 }, -15)).toBeTruthy()
  })
})

describe('surfaceInfo / facteurs', () => {
  it('connaît les surfaces principales avec un libellé FR', () => {
    expect(surfaceInfo('gravel').fr).toBe('Gravier')
    expect(surfaceInfo('inconnu').fr).toBe('inconnu')
  })
  it('bitume = facteur 1.0 (référence)', () => {
    expect(TERRAIN_TIME_FACTORS.asphalt).toBe(1.0)
  })
})

import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
describe('computeRaceProjection — terrain', () => {
  // descente droite simple
  const pts: GpxPoint[] = []
  const lat = 45; let lon = 5, ele = 600
  for (let i = 0; i < 150; i++) { lon += 0.0002; ele -= 1.2; pts.push({ lat, lon, ele }) }

  it('surfaces meubles → temps plus long + surface posée sur les sections', () => {
    const base = computeRaceProjection(pts, [], {}, { type: 'Trail' })
    const surfaces = base.sections.map(() => 'sand' as string | null)
    const withTerrain = computeRaceProjection(pts, [], {}, { type: 'Trail' }, { surfaces })
    expect(withTerrain.estTimeS).toBeGreaterThan(base.estTimeS)
    expect(withTerrain.sections[0].surface).toBe('sand')
    expect((withTerrain.sections[0].surfaceFactor ?? 1)).toBeGreaterThan(1)
  })

  it('bitume → pas de malus', () => {
    const base = computeRaceProjection(pts, [], {}, { type: 'Trail' })
    const surfaces = base.sections.map(() => 'asphalt' as string | null)
    const paved = computeRaceProjection(pts, [], {}, { type: 'Trail' }, { surfaces })
    expect(paved.estTimeS).toBeCloseTo(base.estTimeS, 0)
  })
})
