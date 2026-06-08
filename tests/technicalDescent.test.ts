import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// Construit une descente : 300 m à plat puis ~1.4 km de descente.
// `zigzag` → on fait osciller la latitude pour créer des virages serrés (lacets).
function descentGpx(zigzag: boolean): GpxPoint[] {
  const pts: GpxPoint[] = []
  let lat = 45.0, lon = 5.0, ele = 900
  // plat d'approche
  for (let i = 0; i < 30; i++) { lon += 0.00012; pts.push({ lat, lon, ele }) }
  // descente
  for (let i = 0; i < 160; i++) {
    lon += 0.00010
    lat += zigzag ? (i % 2 === 0 ? 0.00045 : -0.00045) : 0.000005
    ele -= 3 // ~ -3 m / pas → descente franche
    pts.push({ lat, lon, ele })
  }
  return pts
}

const NO_ACT: Record<string, unknown>[] = []

describe('computeRaceProjection — descentes techniques', () => {
  it('marque technical=true sur une descente en lacets, false sur une descente droite', () => {
    const twisty = computeRaceProjection(descentGpx(true), NO_ACT, {}, { type: 'Trail' })
    const straight = computeRaceProjection(descentGpx(false), NO_ACT, {}, { type: 'Trail' })
    expect(twisty.sections.some((s) => s.type === 'down' && s.technical)).toBe(true)
    expect(straight.sections.some((s) => s.technical)).toBe(false)
  })

  it('la descente en lacets est plus lente que la droite (pénalité appliquée)', () => {
    const twisty = computeRaceProjection(descentGpx(true), NO_ACT, {}, { type: 'Trail' })
    const straight = computeRaceProjection(descentGpx(false), NO_ACT, {}, { type: 'Trail' })
    expect(twisty.estTimeS).toBeGreaterThan(straight.estTimeS)
  })

  it('priorité au facteur PERSO : un profil avec technicalDescent global pénalise plus', () => {
    const persoProfile = {
      runner_profile: { technicalDescent: { byBucket: {}, global: { factor: 1.4, confidence: 'high', sampleCount: 6 } } },
    }
    const generic = computeRaceProjection(descentGpx(true), NO_ACT, {}, { type: 'Trail' })
    const perso = computeRaceProjection(descentGpx(true), NO_ACT, persoProfile, { type: 'Trail' })
    // facteur perso 1.4 > la pénalité générique (~+22% max) → temps plus long
    expect(perso.estTimeS).toBeGreaterThan(generic.estTimeS)
  })
})
