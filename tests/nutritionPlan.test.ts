import { describe, it, expect } from 'vitest'
import { computeNutritionPlan, computeNutritionIntakes } from '../src/lib/nutritionPlan'
import { resolveNutritionProducts, NUTRITION_PRODUCTS } from '../src/lib/nutritionProducts'

// Produits témoins réutilisés dans plusieurs cas.
const athlete = resolveNutritionProducts(['4endurance-gel', '4endurance-drink', 'maurten-gel-100-caf'])
const richGel = resolveNutritionProducts(['pfh-pf90']) // 90 g / prise

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
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', athlete)
    const text = rows.map((r) => `${r.action} ${r.glucides}`).join(' | ')
    expect(text).toContain('4Energy Gel')      // gel sans caféine de l'athlète
    expect(text).toContain('4Energy Drink')    // boisson de l'athlète
    expect(text).toMatch(/Maurten Gel 100 CAF/) // gel caféiné de l'athlète (fenêtre milieu de course)
  })

  it('retombe sur le générique sans produits sélectionnés', () => {
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', [])
    const text = rows.map((r) => r.action).join(' | ')
    expect(text).toContain('Gel sans caféine')
  })
})

describe('computeNutritionPlan — préférence sans caféine', () => {
  it('aucune prise caféinée quand avoidCaffeine = true (produits athlète)', () => {
    const plan = computeNutritionIntakes(42195, 4 * 3600, 'standard', athlete, true)
    expect(plan.intakes.every((i) => i.caffeineMg === 0)).toBe(true)
    expect(plan.intakes.some((i) => /caf/i.test(i.label))).toBe(false)
  })

  it('générique : pas de cola ni de gel caféiné quand avoidCaffeine = true', () => {
    const rows = computeNutritionPlan(42195, 4 * 3600, 'standard', [], true)
    const text = rows.map((r) => r.action).join(' | ')
    expect(text).not.toMatch(/cola/i)
    expect(text).not.toMatch(/caféiné/i)
  })

  it('par défaut (avoidCaffeine = false) la caféine reste proposée', () => {
    const plan = computeNutritionIntakes(42195, 4 * 3600, 'standard', athlete, false)
    expect(plan.intakes.some((i) => i.caffeineMg > 0)).toBe(true)
  })

  it('la caféine ne tombe qu\'au cœur de la course (40–75 % du temps)', () => {
    const plan = computeNutritionIntakes(42195, 5 * 3600, 'elite', athlete, false)
    for (const it of plan.intakes) {
      if (it.caffeineMg > 0) {
        const f = it.atS / (5 * 3600)
        expect(f).toBeGreaterThanOrEqual(0.4)
        expect(f).toBeLessThanOrEqual(0.75)
      }
    }
  })
})

// ── P0.1 : le plan est construit autour du TEMPS, et la somme couvre la cible ──
describe('computeNutritionIntakes — cohérence temps / cible (P0.1)', () => {
  it('la somme des glucides planifiés approche la cible (± ~15 %) — 4h', () => {
    const plan = computeNutritionIntakes(42195, 4 * 3600, 'standard', athlete)
    expect(plan.totalCarbsTarget).toBe(240) // 60 g/h × 4h
    expect(plan.plannedCarbsTotal).toBeGreaterThanOrEqual(plan.totalCarbsTarget * 0.85)
    expect(plan.plannedCarbsTotal).toBeLessThanOrEqual(plan.totalCarbsTarget * 1.2)
    expect(plan.shortfall).toBe(false)
  })

  it.each([
    [2 * 3600, 'standard'],
    [4 * 3600, 'trained'],
    [8 * 3600, 'gut_trained'],
    [12 * 3600, 'elite'],
  ])('somme ≈ cible pour durée=%is niveau=%s', (t, level) => {
    const plan = computeNutritionIntakes(70000, t, level, athlete)
    // Les produits de l'athlète (21–25 g) permettent d'atteindre la cible sans
    // dépasser 4 prises/h : la somme doit couvrir ≥ 85 % de la cible.
    expect(plan.plannedCarbsTotal).toBeGreaterThanOrEqual(plan.totalCarbsTarget * 0.85)
  })

  it('le placement dépend du TEMPS, pas de la distance : même distance, durées ≠ → horaires ≠', () => {
    const fast = computeNutritionIntakes(42195, 3 * 3600, 'standard', athlete)
    const slow = computeNutritionIntakes(42195, 5 * 3600, 'standard', athlete)
    // Cibles différentes (180 vs 300 g) → nombre de prises différent.
    expect(fast.totalCarbsTarget).not.toBe(slow.totalCarbsTarget)
    expect(fast.intakes.length).not.toBe(slow.intakes.length)
    // Et les horaires absolus (atS) diffèrent — l'ancien moteur en % de distance
    // aurait produit les mêmes positions.
    expect(fast.intakes.at(-1)!.atS).not.toBe(slow.intakes.at(-1)!.atS)
  })

  it('les prises sont réparties dans le temps, croissantes, et s\'arrêtent avant l\'arrivée', () => {
    const plan = computeNutritionIntakes(70000, 6 * 3600, 'trained', athlete)
    for (let i = 1; i < plan.intakes.length; i++) {
      expect(plan.intakes[i].atS).toBeGreaterThan(plan.intakes[i - 1].atS)
    }
    expect(plan.intakes[0].atS).toBeGreaterThan(0)
    expect(plan.intakes.at(-1)!.atS).toBeLessThanOrEqual(6 * 3600 - 300)
  })

  it('course courte (< 1h30) : aucune prise, tooShort = true', () => {
    const plan = computeNutritionIntakes(15000, 70 * 60, 'standard', athlete)
    expect(plan.tooShort).toBe(true)
    expect(plan.intakes).toHaveLength(0)
    expect(plan.totalCarbsTarget).toBe(0)
  })

  it('produits trop pauvres pour une très longue course → shortfall = true', () => {
    // 12h à 90 g/h = 1080 g. Un seul gel 21 g, 4 prises/h max = 48 prises × 21
    // = 1008 g < 90 % de 1080 ? 1008 ≥ 972 → non. On force le déficit avec un
    // produit unique très faible et une cible élite maximale sur durée extrême.
    const weak = resolveNutritionProducts(['apurna-gel']) // 20 g
    const plan = computeNutritionIntakes(160000, 20 * 3600, 'elite', weak)
    // 20h × 90 = 1800 g cible ; 4/h × 20h = 80 prises × 20 = 1600 g < 1620 (90 %).
    expect(plan.shortfall).toBe(true)
  })

  it('produits riches (PF90) : peu de prises, pas de sur-alimentation', () => {
    const plan = computeNutritionIntakes(42195, 4 * 3600, 'standard', richGel)
    // cible 240 g ; à 90 g/prise ≈ 3 prises. On ne fractionne pas → pas 10 prises.
    expect(plan.intakes.length).toBeLessThanOrEqual(4)
    expect(plan.plannedCarbsTotal).toBeLessThanOrEqual(plan.totalCarbsTarget * 1.5)
  })
})

describe('computeNutritionIntakes — fusion des ravitaillements', () => {
  it('« aimante » une prise sur un ravito proche, sans créer de doublon', () => {
    const noRavito = computeNutritionIntakes(70000, 6 * 3600, 'trained', athlete)
    const ravitos = [{ km: 35, label: 'Base vie' }]
    const withRavito = computeNutritionIntakes(70000, 6 * 3600, 'trained', athlete, false, ravitos)
    // Même nombre de prises (fusion, pas ajout).
    expect(withRavito.intakes.length).toBe(noRavito.intakes.length)
    // Une prise est marquée sur le ravito, à ~35 km.
    const atAid = withRavito.intakes.filter((i) => i.atAidStation)
    expect(atAid).toHaveLength(1)
    expect(atAid[0].km).toBe(35)
    expect(atAid[0].aidLabel).toBe('Base vie')
  })

  it('ignore les ravitos hors course (km <= 0 ou >= distance)', () => {
    const plan = computeNutritionIntakes(70000, 6 * 3600, 'trained', athlete, false, [
      { km: 0 }, { km: 999 },
    ])
    expect(plan.intakes.every((i) => !i.atAidStation)).toBe(true)
  })
})

describe('computeNutritionPlan — rendu tableau', () => {
  it('expose objectif, hydratation et une ligne de récup', () => {
    const rows = computeNutritionPlan(70000, 6 * 3600, 'trained', athlete)
    const moments = rows.map((r) => r.moment)
    expect(moments).toContain('Objectif')
    expect(moments).toContain('Hydratation')
    expect(moments).toContain('Récup')
  })

  it('affiche une alerte quand les produits ne couvrent pas la cible', () => {
    const weak = resolveNutritionProducts(['apurna-gel'])
    const rows = computeNutritionPlan(160000, 20 * 3600, 'elite', weak)
    expect(rows.some((r) => r.moment.includes('Alerte'))).toBe(true)
  })
})
