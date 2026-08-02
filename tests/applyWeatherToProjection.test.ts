import { describe, it, expect } from 'vitest'
import { applyWeatherToProjection } from '../src/lib/applyWeatherToProjection'
import { compareToGoal, parseGoalTimeS } from '../src/lib/raceGoalCompare'
import type { ProjectionResult } from '../src/lib/computeRaceProjection'
import type { WeatherImpact } from '../src/lib/raceWeather'

function projection(over: Partial<ProjectionResult> = {}): ProjectionResult {
  return {
    estTimeS: 13326,           // 3h42 — la cible du Trail du Jura Alsacien
    timeMin: 10874,
    timeMax: 15779,
    sectionTimes: [3000, 4000, 6326],
    sections: [], microSegments: [], points: [], samples: [],
    totalDistM: 32000, dplus: 1160, dminus: 1160, altMin: 400, altMax: 900,
    confidence: 'good', basePaceS: 300, isTrail: true,
    personalAdjustments: [], usedFallback: false, fallbackSources: [],
    ...over,
  } as unknown as ProjectionResult
}

const heat = (pct: number): WeatherImpact => ({
  factor: 1 + pct / 100,
  totalPct: pct,
  items: [{ key: 'heat', label: 'Chaleur', pct, source: 'générique' }],
})

describe('la météo entre dans la cible', () => {
  it('allonge la cible ET la fourchette', () => {
    const p = applyWeatherToProjection(projection(), heat(8), null)!
    expect(p.estTimeS).toBeCloseTo(13326 * 1.08, 6)
    expect(p.timeMin).toBeCloseTo(10874 * 1.08, 6)
    expect(p.timeMax).toBeCloseTo(15779 * 1.08, 6)
    expect(p.weatherAppliedPct).toBe(8)
  })

  it('allonge AUSSI les temps de section — sinon les heures de passage mentent', () => {
    const p = applyWeatherToProjection(projection(), heat(10), null)!
    const attendu = [3000, 4000, 6326].map((t) => t * 1.1)
    p.sectionTimes.forEach((t, i) => expect(t).toBeCloseTo(attendu[i], 6))
    // Cohérence : la somme des sections suit la cible.
    const sum = p.sectionTimes.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(p.estTimeS, 6)
  })

  it('ne compte jamais la météo deux fois', () => {
    const once = applyWeatherToProjection(projection(), heat(8), null)!
    const twice = applyWeatherToProjection(once, heat(8), null)!
    expect(twice).toBe(once)
    expect(twice.estTimeS).toBeCloseTo(13326 * 1.08, 6)
  })

  it('renvoie la projection intacte quand il n’y a rien à appliquer', () => {
    const base = projection()
    expect(applyWeatherToProjection(base, null, null)).toBe(base)
    expect(applyWeatherToProjection(base, { factor: 1, totalPct: 0, items: [] }, null)).toBe(base)
    // Une météo favorable ne fait jamais gagner du temps (garde-fou physiologique).
    expect(applyWeatherToProjection(base, { factor: 0.95, totalPct: -5, items: [] }, null)).toBe(base)
    expect(applyWeatherToProjection(null, heat(8), null)).toBeNull()
  })

  it('recalcule le verdict sur l’objectif à partir du temps AFFICHÉ', () => {
    // 3h42 face à un objectif de 3h45 : « Réaliste ». Avec +8 % de chaleur, la
    // cible passe à ~4h00 et l'objectif devient ambitieux — le verdict doit suivre.
    const base = projection({ goalLabel: 'Réaliste', goalCompareStr: 'Objectif aligné avec la projection Vorcelab' })
    const p = applyWeatherToProjection(base, heat(8), '3h45')!
    expect(p.goalLabel).toBe('Ambitieux')
    expect(p.goalCompareStr).toContain('plus rapide que la projection')
  })

  it('efface le verdict quand la course n’a plus d’objectif', () => {
    const base = projection({ goalLabel: 'Réaliste', goalCompareStr: 'Objectif aligné avec la projection Vorcelab' })
    const p = applyWeatherToProjection(base, heat(8), null)!
    expect(p.goalLabel).toBeUndefined()
    expect(p.goalCompareStr).toBeUndefined()
  })

  it('laisse intacts les champs non temporels', () => {
    const p = applyWeatherToProjection(projection(), heat(8), null)!
    expect(p.totalDistM).toBe(32000)
    expect(p.dplus).toBe(1160)
    expect(p.confidence).toBe('good')
  })
})

describe('comparaison à l’objectif (fonction extraite du moteur)', () => {
  it('lit les objectifs saisis', () => {
    expect(parseGoalTimeS('3h30')).toBe(3 * 3600 + 30 * 60)
    expect(parseGoalTimeS('4h')).toBe(4 * 3600)
    expect(parseGoalTimeS('n’importe quoi')).toBeNull()
    expect(parseGoalTimeS(null)).toBeNull()
  })

  it('reproduit les seuils du moteur', () => {
    const goal = '4h00' // 14400 s
    expect(compareToGoal(14400 * 0.90, goal).goalLabel).toBe('Très conservateur')
    expect(compareToGoal(14400 * 0.95, goal).goalLabel).toBe('Conservateur')
    expect(compareToGoal(14400 * 1.00, goal).goalLabel).toBe('Réaliste')
    expect(compareToGoal(14400 * 1.07, goal).goalLabel).toBe('Ambitieux')
    expect(compareToGoal(14400 * 1.20, goal).goalLabel).toBe('Très ambitieux')
  })

  it('reste muette sans objectif exploitable', () => {
    expect(compareToGoal(13000, null)).toEqual({})
    expect(compareToGoal(0, '3h30')).toEqual({})
  })
})
