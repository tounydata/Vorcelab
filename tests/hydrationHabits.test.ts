import { describe, it, expect } from 'vitest'
import { computeHydrationHabits, nutritionLevelFromCarbsPerH, type LoggedFueling } from '../src/lib/hydrationHabits'

const H = 3600

describe('computeHydrationHabits', () => {
  it('aucun log → confiance none, débits null, note générique', () => {
    const h = computeHydrationHabits([])
    expect(h.confidence).toBe('none')
    expect(h.fluidMlPerH).toBeNull()
    expect(h.carbsGPerH).toBeNull()
    expect(h.suggestedNutritionLevel).toBeNull()
    expect(h.notes[0]).toMatch(/aucune sortie/i)
  })

  it('ignore les sorties trop courtes (< 45 min)', () => {
    const logs: LoggedFueling[] = [{ durationS: 20 * 60, fluidMl: 500, carbsG: 40 }]
    const h = computeHydrationHabits(logs)
    expect(h.sampleCount).toBe(0)
    expect(h.fluidMlPerH).toBeNull()
  })

  it('débit d\'hydratation pondéré par la durée', () => {
    // 4 h → 3000 mL (750/h) ; 1 h → 500 mL (500/h). Pondéré : 3500 mL / 5 h = 700/h.
    const logs: LoggedFueling[] = [
      { durationS: 4 * H, fluidMl: 3000, electrolytes: true },
      { durationS: 1 * H, fluidMl: 500, electrolytes: false },
    ]
    const h = computeHydrationHabits(logs)
    expect(h.fluidMlPerH).toBe(700)
    expect(h.fluidHours).toBe(5)
    expect(h.electrolyteShare).toBe(0.5)
  })

  it('le gros buveur (750 mL/h) est bien distingué du standard (500 mL/h)', () => {
    const gros = computeHydrationHabits([{ durationS: 4 * H, fluidMl: 3000 }])
    const standard = computeHydrationHabits([{ durationS: 4 * H, fluidMl: 2000 }])
    expect(gros.fluidMlPerH).toBe(750)
    expect(standard.fluidMlPerH).toBe(500)
    expect(gros.fluidMlPerH!).toBeGreaterThan(standard.fluidMlPerH!)
  })

  it('glucides g/h → profil nutrition suggéré', () => {
    const h = computeHydrationHabits([{ durationS: 3 * H, carbsG: 240 }]) // 80 g/h
    expect(h.carbsGPerH).toBe(80)
    expect(h.suggestedNutritionLevel).toBe('elite')
  })

  it('champs partiels : liquide seul ou glucides seuls comptent séparément', () => {
    const logs: LoggedFueling[] = [
      { durationS: 2 * H, fluidMl: 1200 },              // liquide seul → 600/h
      { durationS: 2 * H, carbsG: 100 },                // glucides seuls → 50/h
    ]
    const h = computeHydrationHabits(logs)
    expect(h.fluidMlPerH).toBe(600)
    expect(h.carbsGPerH).toBe(50)
    expect(h.sampleCount).toBe(2)
  })

  it('confiance croissante avec le nombre de sorties et les heures', () => {
    const one = computeHydrationHabits([{ durationS: 4 * H, fluidMl: 3000 }])
    expect(one.confidence).toBe('low')
    const many: LoggedFueling[] = Array.from({ length: 6 }, () => ({ durationS: 3 * H, fluidMl: 2100 }))
    expect(computeHydrationHabits(many).confidence).toBe('high')
  })

  it('alerte hyponatrémie au-delà de 900 mL/h', () => {
    const h = computeHydrationHabits([{ durationS: 4 * H, fluidMl: 4000 }]) // 1000/h
    expect(h.notes.some((n) => /hyponatrémie/i.test(n))).toBe(true)
  })

  it('déterministe', () => {
    const logs: LoggedFueling[] = [{ durationS: 3 * H, fluidMl: 2000, carbsG: 180, electrolytes: true }]
    expect(computeHydrationHabits(logs)).toEqual(computeHydrationHabits(logs))
  })
})

describe('nutritionLevelFromCarbsPerH', () => {
  it('mappe les débits aux profils', () => {
    expect(nutritionLevelFromCarbsPerH(20)).toBe('prudent')
    expect(nutritionLevelFromCarbsPerH(45)).toBe('standard')
    expect(nutritionLevelFromCarbsPerH(60)).toBe('trained')
    expect(nutritionLevelFromCarbsPerH(70)).toBe('gut_trained')
    expect(nutritionLevelFromCarbsPerH(95)).toBe('elite')
  })
})
