import { describe, it, expect } from 'vitest'
import { workoutChartBars } from '../src/lib/workoutChart'
import { easyRun, tempoRun, cruiseIntervals, hillSession } from '../src/lib/sessionGenerator'

describe('workoutChartBars', () => {
  it('footing = 1 barre pleine largeur en intensité faible', () => {
    const bars = workoutChartBars(easyRun(50, 45))
    expect(bars).toHaveLength(1)
    expect(bars[0].widthPct).toBeCloseTo(100, 0)
    expect(bars[0].heightPct).toBe(25) // zone E
  })

  it('les largeurs somment ~100 %', () => {
    const bars = workoutChartBars(tempoRun(50, 20))
    const sum = bars.reduce((s, b) => s + b.widthPct, 0)
    expect(sum).toBeGreaterThan(99)
    expect(sum).toBeLessThan(101)
  })

  it('le bloc seuil est plus haut que l\'échauffement/retour au calme', () => {
    const bars = workoutChartBars(tempoRun(50, 20))
    const warm = bars.find(b => b.kind === 'warmup')!
    const main = bars.find(b => b.kind === 'main')!
    expect(main.heightPct).toBeGreaterThan(warm.heightPct)
    expect(main.zone).toBe('T')
  })

  it('la récupération est la barre la plus basse', () => {
    const bars = workoutChartBars(cruiseIntervals(50, 5, 6))
    const rec = bars.find(b => b.kind === 'recovery')!
    expect(rec.heightPct).toBe(15)
  })

  it('une côte (sans allure) tire sa hauteur du RPE', () => {
    const bars = workoutChartBars(hillSession('force', 6)) // rpe 9
    const main = bars.find(b => b.kind === 'main')!
    expect(main.zone).toBeUndefined()
    expect(main.heightPct).toBe(90)
  })

  it('séance vide → aucune barre', () => {
    expect(workoutChartBars({ type: 'easy', intent: '', blocks: [], totalMin: 0 })).toEqual([])
  })
})
