import { describe, it, expect } from 'vitest'
import { computeNutritionPlan } from '../src/lib/nutritionPlan'
import { resolveNutritionProducts, NUTRITION_PRODUCTS } from '../src/lib/nutritionProducts'

describe('catalogue nutrition', () => {
  it('résout les ids en produits et ignore les inconnus', () => {
    const r = resolveNutritionProducts(['maurten-gel-100', 'inconnu-xyz', '4endurance-gel'])
    expect(r.map((p) => p.id)).toEqual(['maurten-gel-100', '4endurance-gel'])
  })
  it('4Endurance est bien dans le catalogue (gel + boisson)', () => {
    const ids = NUTRITION_PRODUCTS.map((p) => p.id)
    expect(ids).toContain('4endurance-gel')
    expect(ids).toContain('4endurance-drink')
  })
})

describe('computeNutritionPlan — produits de l\'athlète', () => {
  it('utilise les vrais produits choisis dans le plan de ravitaillement', () => {
    const products = resolveNutritionProducts(['4endurance-gel', '4endurance-drink', 'maurten-gel-100-caf'])
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', products)
    const text = rows.map((r) => `${r.action} ${r.glucides}`).join(' | ')
    expect(text).toContain('4Energy Gel')      // gel sans caféine de l'athlète
    expect(text).toContain('4Energy Drink')    // boisson de l'athlète
    expect(text).toMatch(/Maurten Gel 100 CAF/) // gel caféiné de l'athlète
  })

  it('retombe sur le générique sans produits sélectionnés', () => {
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', [])
    const text = rows.map((r) => r.action).join(' | ')
    expect(text).toContain('Gel sans caféine')
  })
})

describe('computeNutritionPlan — préférence sans caféine', () => {
  it('ne propose aucun gel caféiné quand avoidCaffeine = true (produits athlète)', () => {
    const products = resolveNutritionProducts(['4endurance-gel', '4endurance-drink', 'maurten-gel-100-caf'])
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', products, true)
    const actions = rows.map((r) => r.action).join(' | ')
    expect(actions).not.toMatch(/CAF/)             // pas le gel caféiné de l'athlète
    expect(actions).not.toMatch(/\(caféine\)/)     // pas d'action « (caféine) »
    expect(rows.map((r) => r.note).join(' | ')).toContain('sans caféine')
  })

  it('générique : pas de cola ni de gel caféiné quand avoidCaffeine = true', () => {
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', [], true)
    const text = rows.map((r) => r.action).join(' | ')
    expect(text).not.toMatch(/cola/i)
    expect(text).not.toMatch(/caféiné/i)
  })

  it('par défaut (avoidCaffeine = false) la caféine reste proposée', () => {
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', [])
    const text = rows.map((r) => r.action).join(' | ')
    expect(text).toMatch(/caféiné/i)
  })
})
