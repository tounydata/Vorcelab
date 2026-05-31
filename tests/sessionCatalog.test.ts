import { describe, it, expect } from 'vitest'
import { buildCatalog, CATEGORY_LABEL } from '../src/lib/sessionCatalog'

describe('buildCatalog', () => {
  it('génère une séance par catégorie disponible avec des blocs chiffrés', () => {
    const cat = buildCatalog(50)
    expect(cat.length).toBeGreaterThanOrEqual(6)
    for (const e of cat) {
      expect(e.label).toBe(CATEGORY_LABEL[e.category])
      expect(e.difficulty).toBeGreaterThanOrEqual(1)
      expect(e.difficulty).toBeLessThanOrEqual(5)
      expect(e.workout.blocks.length).toBeGreaterThan(0)
      expect(e.workout.totalMin).toBeGreaterThan(0)
    }
  })

  it('les libellés sont descriptifs (pas de noms créatifs)', () => {
    expect(CATEGORY_LABEL.vo2).toBe('VO2max 30/30')
    expect(CATEGORY_LABEL.long).toBe('Sortie longue')
  })

  it('la sortie longue dure plus que le footing facile', () => {
    const cat = buildCatalog(50)
    const long = cat.find(e => e.category === 'long')!
    const easy = cat.find(e => e.category === 'easy')!
    expect(long.workout.totalMin).toBeGreaterThan(easy.workout.totalMin)
  })
})
