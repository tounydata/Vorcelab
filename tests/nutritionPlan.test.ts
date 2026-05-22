import { describe, it, expect } from 'vitest'
import { genNutritionRows } from '../src/utils/nutritionPlan'

describe('genNutritionRows', () => {

  describe('< 1h30 (effort court)', () => {
    it('retourne 1 seule ligne "eau selon la soif"', () => {
      const rows = genNutritionRows(10_000, 3600)  // 10km, 1h
      expect(rows).toHaveLength(1)
      expect(rows[0].action).toMatch(/eau/i)
    })

    it('pas de gel ni glucides solides', () => {
      const rows = genNutritionRows(8_000, 4800)  // 80min
      expect(rows.every(r => r.carbs === '0g' || Number(r.carbs.replace('g','')) === 0)).toBe(true)
    })
  })

  describe('1h30 – 2h30 (effort moyen)', () => {
    it('génère au moins 3 lignes', () => {
      const rows = genNutritionRows(20_000, 7200)  // 20km, 2h
      expect(rows.length).toBeGreaterThanOrEqual(3)
    })

    it('contient une ligne "Objectif" avec le total glucides', () => {
      const rows = genNutritionRows(20_000, 7200)
      const obj = rows.find(r => r.timing === 'Objectif')
      expect(obj).toBeDefined()
      expect(obj!.highlight).toBe('info')
    })

    it('glucides > 0 dans au moins une ligne', () => {
      const rows = genNutritionRows(20_000, 7200)
      const nonZero = rows.filter(r => r.carbs !== '0g' && r.carbs !== '')
      expect(nonZero.length).toBeGreaterThan(0)
    })
  })

  describe('> 2h30 (effort long)', () => {
    it('génère plus de lignes que l\'effort moyen', () => {
      const short = genNutritionRows(20_000, 7200)   // 2h
      const long  = genNutritionRows(50_000, 18000)  // 5h
      expect(long.length).toBeGreaterThan(short.length)
    })

    it('contient une ligne caféine pour les longues distances', () => {
      const rows = genNutritionRows(60_000, 21600)  // 6h
      const caffeine = rows.find(r => r.action.toLowerCase().includes('caféine') || r.note.toLowerCase().includes('caféine'))
      expect(caffeine).toBeDefined()
    })
  })

  describe('profils nutrition', () => {
    it('profil elite → plus de glucides/h que prudent', () => {
      const prudent = genNutritionRows(30_000, 10800, 'prudent')
      const elite   = genNutritionRows(30_000, 10800, 'elite')
      const objPrudent = prudent.find(r => r.timing === 'Objectif')
      const objElite   = elite.find(r => r.timing === 'Objectif')
      if (objPrudent && objElite) {
        const g = (s: string) => Number(s.match(/(\d+)g/)?.[1] ?? 0)
        expect(g(objElite.carbs)).toBeGreaterThan(g(objPrudent.carbs))
      }
    })

    it('profil inconnu → same que standard (fallback)', () => {
      const std     = genNutritionRows(20_000, 7200, 'standard')
      const unknown = genNutritionRows(20_000, 7200, 'alien_mode')
      expect(std.length).toBe(unknown.length)
    })
  })

  describe('format de sortie', () => {
    it('chaque ligne a les champs requis', () => {
      const rows = genNutritionRows(25_000, 9000)
      for (const r of rows) {
        expect(typeof r.timing).toBe('string')
        expect(typeof r.action).toBe('string')
        expect(typeof r.carbs).toBe('string')
        expect(typeof r.note).toBe('string')
      }
    })
  })
})
