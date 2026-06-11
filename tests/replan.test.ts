import { describe, it, expect } from 'vitest'
import { applyReplan } from '../src/lib/coach/replan'
import type { PlanWeek, PlannedSession } from '../src/lib/coach/planGenerator'

function s(p: Partial<PlannedSession>): PlannedSession {
  return {
    dayOfWeek: 1, workoutId: 'x', title: 'X', system: 'endurance',
    intensity: 'easy', targetDurationMin: 60, climbing: false, description: '', ...p,
  }
}

function week(p: Partial<PlanWeek>): PlanWeek {
  return {
    weekIndex: 0, weekStartISO: '2026-06-08', phase: 'build', isRecovery: false,
    volumeHours: 6, focus: 'build', sessions: [], ...p,
  }
}

const buildWeek = week({
  phase: 'build',
  sessions: [
    s({ dayOfWeek: 2, system: 'vo2max', intensity: 'hard', title: 'VO2max', targetDurationMin: 60 }),
    s({ dayOfWeek: 4, system: 'threshold', intensity: 'hard', title: 'Seuil', targetDurationMin: 55 }),
    s({ dayOfWeek: 7, system: 'long', intensity: 'moderate', title: 'Longue', targetDurationMin: 120 }),
    s({ dayOfWeek: 1, system: 'endurance', intensity: 'easy', targetDurationMin: 50 }),
  ],
})

describe('applyReplan — surcharge (ACWR rouge)', () => {
  it('transforme la semaine en allègement quand ACWR > 1.5', () => {
    const r = applyReplan([buildWeek], { acwrRatio: 1.7, tsb: -20 })
    expect(r.trigger).toBe('surcharge')
    expect(r.weeks[0].isRecovery).toBe(true)
    // les séances dures sont retirées (vo2max + seuil), restent endurance + longue
    expect(r.weeks[0].sessions.some((x) => x.intensity === 'hard')).toBe(false)
    expect(r.weeks[0].sessions.some((x) => x.system === 'long')).toBe(true)
    // volume franchement réduit
    expect(r.weeks[0].volumeHours).toBeLessThan(buildWeek.volumeHours)
    expect(r.reason).toContain('ACWR')
  })

  it('ne déclenche pas pour un ACWR en zone optimale', () => {
    const r = applyReplan([buildWeek], { acwrRatio: 1.1, tsb: -5 })
    expect(r.trigger).toBeNull()
    expect(r.weeks[0]).toBe(buildWeek) // plan inchangé
  })
})

describe('applyReplan — reprise (désentraînement)', () => {
  it('retire la séance la plus dure et tempère le volume si TSB très élevé', () => {
    const r = applyReplan([buildWeek], { acwrRatio: 0.6, tsb: 30 })
    expect(r.trigger).toBe('reprise')
    // une séance dure de moins (il en restait 2)
    const hardBefore = buildWeek.sessions.filter((x) => x.intensity === 'hard').length
    const hardAfter = r.weeks[0].sessions.filter((x) => x.intensity === 'hard').length
    expect(hardAfter).toBe(hardBefore - 1)
    expect(r.weeks[0].volumeHours).toBeLessThan(buildWeek.volumeHours)
  })
})

describe('applyReplan — garde-fous', () => {
  it('ne touche JAMAIS un affûtage', () => {
    const taper = week({ phase: 'taper', sessions: buildWeek.sessions })
    expect(applyReplan([taper], { acwrRatio: 1.9, tsb: 40 }).trigger).toBeNull()
  })
  it('ne touche JAMAIS une semaine de course', () => {
    const race = week({ phase: 'race', sessions: buildWeek.sessions })
    expect(applyReplan([race], { acwrRatio: 1.9, tsb: 40 }).trigger).toBeNull()
  })
  it('avertit sans sur-décharger si déjà en semaine de décharge planifiée', () => {
    const rec = week({ isRecovery: true, sessions: buildWeek.sessions })
    const r = applyReplan([rec], { acwrRatio: 1.7, tsb: -10 })
    expect(r.trigger).toBe('surcharge')
    expect(r.weeks[0]).toBe(rec) // pas de double allègement
  })
  it('retourne le plan inchangé sans signal exploitable (calibrage)', () => {
    expect(applyReplan([buildWeek], { acwrRatio: null, tsb: null }).trigger).toBeNull()
  })
})
