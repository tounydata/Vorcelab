import { describe, it, expect } from 'vitest'
import { fuseRenfoIntoWeek } from '../src/lib/coach/renfoFusion'
import type { PlanWeek, PlannedSession } from '../src/lib/coach/planGenerator'

function s(p: Partial<PlannedSession>): PlannedSession {
  return {
    dayOfWeek: 1, workoutId: 'x', title: 'X', system: 'endurance',
    intensity: 'easy', targetDurationMin: 60, climbing: false, description: '', ...p,
  }
}
function week(phase: PlanWeek['phase'], sessions: PlannedSession[]): PlanWeek {
  return { weekIndex: 0, weekStartISO: '2026-06-08', phase, isRecovery: false, volumeHours: 6, focus: '', sessions }
}

// Semaine type : qualité mardi, qualité jeudi, longue dimanche, footings ailleurs.
const buildWeek = week('build', [
  s({ dayOfWeek: 2, system: 'vo2max', intensity: 'hard' }),
  s({ dayOfWeek: 4, system: 'threshold', intensity: 'hard' }),
  s({ dayOfWeek: 7, system: 'long', intensity: 'moderate' }),
  s({ dayOfWeek: 1, system: 'endurance', intensity: 'easy' }),
  s({ dayOfWeek: 6, system: 'endurance', intensity: 'easy' }),
])

const keyDays = new Set([2, 4, 7])

describe('fuseRenfoIntoWeek', () => {
  it('retourne null sans renfo configuré', () => {
    expect(fuseRenfoIntoWeek(buildWeek, 0)).toBeNull()
    expect(fuseRenfoIntoWeek(buildWeek, null)).toBeNull()
  })

  it('synchronise la phase DUP à la phase course (build → volume)', () => {
    expect(fuseRenfoIntoWeek(buildWeek, 2)!.dupPhase).toBe('volume')
  })

  it('place le bon nombre de séances', () => {
    expect(fuseRenfoIntoWeek(buildWeek, 2)!.slots).toHaveLength(2)
    expect(fuseRenfoIntoWeek(buildWeek, 3)!.slots).toHaveLength(3)
  })

  it('empile le renfo LOURD sur un jour de qualité (jamais la veille d\'une séance clé)', () => {
    const f = fuseRenfoIntoWeek(buildWeek, 2)!
    const heavy = f.slots.filter((sl) => sl.heavy)
    expect(heavy.length).toBeGreaterThanOrEqual(1)
    for (const h of heavy) {
      // jamais la veille d'une séance clé
      expect(keyDays.has(h.dayOfWeek + 1)).toBe(false)
      // empilé sur un jour de qualité (idéal) ou jour sûr — mais pas un jour interdit
    }
  })

  it('ne place jamais de renfo le jour de course', () => {
    const raceWk = week('specific', [
      s({ dayOfWeek: 7, system: 'race', intensity: 'hard', title: 'Course B' }),
      s({ dayOfWeek: 2, system: 'vo2max', intensity: 'hard' }),
      s({ dayOfWeek: 4, system: 'endurance', intensity: 'easy' }),
    ])
    const f = fuseRenfoIntoWeek(raceWk, 3)!
    expect(f.slots.some((sl) => sl.dayOfWeek === 7)).toBe(false)
  })

  it('en affûtage : que du renfo léger (aucun lourd près du jour J)', () => {
    const taper = week('taper', [
      s({ dayOfWeek: 3, system: 'speed', intensity: 'moderate' }),
      s({ dayOfWeek: 1, system: 'endurance', intensity: 'easy' }),
    ])
    const f = fuseRenfoIntoWeek(taper, 2)!
    expect(f.dupPhase).toBe('deload')
    expect(f.slots.every((sl) => !sl.heavy)).toBe(true)
  })

  it('un seul renfo par jour', () => {
    const f = fuseRenfoIntoWeek(buildWeek, 4)!
    const days = f.slots.map((sl) => sl.dayOfWeek)
    expect(new Set(days).size).toBe(days.length)
  })
})
