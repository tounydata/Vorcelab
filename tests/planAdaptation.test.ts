import { describe, it, expect } from 'vitest'
import { generateTrainingPlan, type PlanInput } from '../src/lib/coach/planGenerator'
import { getWorkout } from '../src/lib/coach/workouts'

function road10k(over: Partial<PlanInput> = {}): PlanInput {
  return {
    raceName: '10 km', raceDateISO: '2026-09-13', raceDistanceKm: 10,
    raceElevationM: 80, raceType: 'Route', todayISO: '2026-05-01',
    daysPerWeek: 5, currentCTL: null, ...over,
  }
}

const allIds = (input: PlanInput) =>
  generateTrainingPlan(input).weeks.flatMap((w) => w.sessions.map((s) => s.workoutId))

describe('plan — affûtage (périodisation)', () => {
  it('aucune séance dure (VO2max/seuil/côtes) en semaine d\'affûtage', () => {
    // Périodisation : la vitesse/VO2max est en base/développement, PAS à J-7.
    const plan = generateTrainingPlan(road10k({ weaknesses: ['vo2max'] }))
    const taper = plan.weeks.filter((w) => w.phase === 'taper')
    expect(taper.length).toBeGreaterThan(0)
    for (const w of taper) {
      for (const s of w.sessions) {
        expect(s.intensity, `${w.weekIndex}:${s.workoutId}`).not.toBe('hard')
      }
    }
  })

  it('VO2max ne fait jamais partie des séances d\'affûtage du catalogue', () => {
    expect(getWorkout('vo2_intervals')!.phases).not.toContain('taper')
  })
})

describe('plan — adaptation au profil', () => {
  it('un point faible VO2max fait apparaître des séances VO2max dans le plan', () => {
    const ids = allIds(road10k({ weaknesses: ['vo2max'] }))
    const hasVo2 = ids.some((id) => getWorkout(id)?.target === 'vo2max')
    expect(hasVo2).toBe(true)
  })

  it('un débutant ne reçoit jamais de séances réservées aux avancés', () => {
    const ids = new Set(allIds(road10k({ level: 'beginner', daysPerWeek: 6 })))
    for (const banned of ['over_under', 'vo2_pyramide', 'reps_r_400', 'sprints_alactic', 'plyometrics', 'canova_special', 'canova_extensive']) {
      expect(ids.has(banned), banned).toBe(false)
    }
  })

  it('le plan intermédiaire ne contient que des séances ouvertes aux intermédiaires', () => {
    const int = new Set(allIds(road10k({ level: 'intermediate' })))
    for (const id of int) {
      if (id === 'race') continue
      expect(getWorkout(id)!.levels, id).toContain('intermediate')
    }
  })

  it('un 10 km route ne contient aucune séance trailOnly', () => {
    const ids = allIds(road10k({ weaknesses: ['vo2max'] }))
    for (const id of ids) {
      if (id === 'race') continue
      expect(getWorkout(id)!.trailOnly ?? false).toBe(false)
    }
  })

  it('reste déterministe avec un profil donné', () => {
    const input = road10k({ level: 'advanced', weaknesses: ['threshold'] })
    expect(JSON.stringify(generateTrainingPlan(input))).toBe(JSON.stringify(generateTrainingPlan(input)))
  })
})
