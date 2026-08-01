import { describe, it, expect } from 'vitest'
import { computeNutritionIntakes } from '../src/lib/nutritionPlan'
import { resolveNutritionProducts } from '../src/lib/nutritionProducts'
import { buildPrepChecklist } from '../src/lib/racePrepChecklist'

const athlete = resolveNutritionProducts(['4endurance-gel', '4endurance-drink', 'maurten-gel-100-caf'])

describe('checklist « à préparer la veille »', () => {
  it('agrège les prises par produit : la somme des quantités = le nombre de prises', () => {
    const estTimeS = 5 * 3600
    const plan = computeNutritionIntakes(50000, estTimeS, 'standard', athlete)
    const list = buildPrepChecklist(plan, estTimeS)

    const fuelQty = list.items
      .filter((i) => i.group === 'fuel' && !i.spare)
      .reduce((s, i) => s + i.qty, 0)
    expect(fuelQty).toBe(plan.intakes.length)
    // Une ligne par produit distinct, pas une ligne par prise.
    expect(list.items.filter((i) => i.group === 'fuel' && !i.spare).length).toBeLessThan(plan.intakes.length)
  })

  it('les glucides embarqués correspondent aux glucides planifiés', () => {
    const estTimeS = 6 * 3600
    const plan = computeNutritionIntakes(60000, estTimeS, 'trained', athlete)
    const list = buildPrepChecklist(plan, estTimeS)
    expect(list.totalCarbs).toBe(plan.plannedCarbsTotal)
  })

  it('ajoute une marge de secours (≥ 1 unité) dès qu’il y a des prises solides', () => {
    const estTimeS = 4 * 3600
    const plan = computeNutritionIntakes(40000, estTimeS, 'standard', athlete)
    const spare = buildPrepChecklist(plan, estTimeS).items.find((i) => i.spare)
    expect(spare).toBeDefined()
    expect(spare!.qty).toBeGreaterThanOrEqual(1)
  })

  it('dérive hydratation et sodium du plan et de la durée', () => {
    const estTimeS = 4 * 3600
    const plan = computeNutritionIntakes(40000, estTimeS, 'standard', athlete, false, [], 25, 700)
    const list = buildPrepChecklist(plan, estTimeS)
    expect(list.hydrationMl).toBe(2800) // 700 ml/h × 4 h
    expect(list.sodiumMg).toBe(plan.sodiumMgPerH * 4)
    expect(list.items.some((i) => i.group === 'hydration')).toBe(true)
  })

  it('course courte (< 1h30) : pas de gels, uniquement la boisson', () => {
    const estTimeS = 60 * 60
    const plan = computeNutritionIntakes(15000, estTimeS, 'standard', athlete)
    const list = buildPrepChecklist(plan, estTimeS)
    expect(plan.tooShort).toBe(true)
    expect(list.items.some((i) => i.group === 'fuel')).toBe(false)
    expect(list.totalCarbs).toBe(0)
  })

  it('signale la caféine embarquée et le déficit glucidique', () => {
    const estTimeS = 5 * 3600
    const withCaf = computeNutritionIntakes(50000, estTimeS, 'standard', athlete)
    const listCaf = buildPrepChecklist(withCaf, estTimeS)
    expect(listCaf.totalCaffeineMg).toBeGreaterThan(0)
    expect(listCaf.notes.some((n) => n.toLowerCase().includes('caféine'))).toBe(true)

    // Produit pauvre + cible élite → déficit annoncé dans les notes.
    const poor = resolveNutritionProducts(['apurna-gel']) // 20 g / prise
    const short = computeNutritionIntakes(80000, 10 * 3600, 'elite', poor)
    const listShort = buildPrepChecklist(short, 10 * 3600)
    expect(short.shortfall).toBe(true)
    expect(listShort.notes.some((n) => n.toLowerCase().includes('déficit'))).toBe(true)
  })

  it('mentionne les prises qui tombent sur un ravitaillement', () => {
    const estTimeS = 6 * 3600
    const plan = computeNutritionIntakes(60000, estTimeS, 'standard', athlete, false, [{ km: 20, label: 'Col' }, { km: 40, label: 'Refuge' }])
    const list = buildPrepChecklist(plan, estTimeS)
    expect(list.atAidStations).toBeGreaterThan(0)
    expect(list.notes.some((n) => n.includes('ravitaillement'))).toBe(true)
  })

  it('identifiants d’items stables entre deux constructions (cochage persistant)', () => {
    const estTimeS = 5 * 3600
    const plan = computeNutritionIntakes(50000, estTimeS, 'standard', athlete)
    const a = buildPrepChecklist(plan, estTimeS).items.map((i) => i.id)
    const b = buildPrepChecklist(computeNutritionIntakes(50000, estTimeS, 'standard', athlete), estTimeS).items.map((i) => i.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })
})
