import { describe, it, expect } from 'vitest'
import {
  buildPlan,
  taperWeeks,
  getCurrentPhase,
  strengthFocusForPhase,
  intensityShareTarget,
  taperVolumeFactor,
} from '../src/lib/periodization'

const GOAL = new Date('2026-09-06') // un dimanche

// ─── C1 — construction du plan ────────────────────────────────────────────────────

describe('buildPlan', () => {
  it('produit exactement weeksAvailable semaines', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    expect(plan.weeks).toHaveLength(16)
    expect(plan.weeks[0].index).toBe(0)
  })

  it('se termine par le taper (marathon = 3 semaines)', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    expect(taperWeeks(42195)).toBe(3)
    const lastThree = plan.weeks.slice(-3)
    expect(lastThree.every(w => w.phase === 'taper')).toBe(true)
  })

  it('commence par de la base', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    expect(plan.weeks[0].phase).toBe('base')
  })

  it('place une décharge ~toutes les 4 semaines hors taper', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    const deloads = plan.weeks.filter(w => w.deload)
    expect(deloads.length).toBeGreaterThanOrEqual(2)
    expect(deloads.every(w => w.phase !== 'taper')).toBe(true)
  })

  it('la dernière semaine tombe sur la date d\'objectif', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    expect(plan.weeks.at(-1)!.startDate).toBe('2026-09-06')
    expect(plan.goalDate).toBe('2026-09-06')
  })

  it('taper plus court pour un 10 km', () => {
    expect(taperWeeks(10000)).toBe(1)
    const plan = buildPlan(GOAL, 12, 10000)
    expect(plan.weeks.filter(w => w.phase === 'taper')).toHaveLength(1)
  })
})

// ─── C1 — phase courante ──────────────────────────────────────────────────────────

describe('getCurrentPhase', () => {
  it('retrouve la semaine contenant une date', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    const wk = getCurrentPhase(plan, new Date(plan.weeks[0].startDate))
    expect(wk?.index).toBe(0)
  })

  it('retourne null hors plan', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    expect(getCurrentPhase(plan, new Date('2020-01-01'))).toBeNull()
  })
})

// ─── Pont renfo + 80/20 + taper ─────────────────────────────────────────────────

describe('ponts', () => {
  it('strengthFocusForPhase mappe phase → focus renfo', () => {
    const plan = buildPlan(GOAL, 16, 42195)
    expect(strengthFocusForPhase({ ...plan.weeks[0], phase: 'base', deload: false })).toBe('force')
    expect(strengthFocusForPhase({ ...plan.weeks[0], phase: 'build', deload: false })).toBe('volume')
    expect(strengthFocusForPhase({ ...plan.weeks[0], phase: 'specific', deload: false })).toBe('puissance')
    expect(strengthFocusForPhase({ ...plan.weeks[0], phase: 'base', deload: true })).toBe('deload')
    expect(strengthFocusForPhase({ ...plan.weeks[0], phase: 'taper', deload: false })).toBe('deload')
  })

  it('intensityShareTarget : base plus polarisée que build', () => {
    expect(intensityShareTarget('base')).toBeLessThan(intensityShareTarget('build'))
  })

  it('taperVolumeFactor décroît à l\'approche de la course', () => {
    expect(taperVolumeFactor(3)).toBeGreaterThan(taperVolumeFactor(2))
    expect(taperVolumeFactor(2)).toBeGreaterThan(taperVolumeFactor(1))
  })
})
