import { describe, it, expect } from 'vitest'
import { carbTargetGperH, gutTrainingProgression } from '../src/lib/carbTargets'

describe('carbTargetGperH — cibles par durée', () => {
  it('< 1 h : 0 g/h (réserves)', () => {
    expect(carbTargetGperH(0.75).gPerH).toBe(0)
  })
  it('1-2 h : 60 g/h, ratio 1:1', () => {
    const t = carbTargetGperH(1.5)
    expect(t.gPerH).toBe(60)
    expect(t.ratio).toBe('1:1')
  })
  it('2-3 h : 75 (standard) / 90 (intestin entraîné), ratio 1:0.8', () => {
    expect(carbTargetGperH(2.5).gPerH).toBe(75)
    expect(carbTargetGperH(2.5, true).gPerH).toBe(90)
    expect(carbTargetGperH(2.5).ratio).toBe('1:0.8')
  })
  it('> 3 h : 90 (standard) / 110 (intestin entraîné)', () => {
    expect(carbTargetGperH(4).gPerH).toBe(90)
    expect(carbTargetGperH(4, true).gPerH).toBe(110)
  })
})

describe('gutTrainingProgression', () => {
  it('monte de 10 g/h par semaine jusqu\'à la cible', () => {
    const p = gutTrainingProgression(4, 90) // 60,70,80,90
    expect(p).toEqual([60, 70, 80, 90])
  })
  it('plafonne à la cible et l\'atteint en dernière semaine', () => {
    const p = gutTrainingProgression(6, 90)
    expect(Math.max(...p)).toBe(90)
    expect(p[p.length - 1]).toBe(90)
  })
  it('peu de semaines : atteint quand même la cible à la fin', () => {
    const p = gutTrainingProgression(2, 110) // 60,110(forcé)
    expect(p[p.length - 1]).toBe(110)
  })
})
