import { describe, it, expect } from 'vitest'
import {
  generateTrainingPlan,
  allocatePhases,
  weeksUntil,
  isTrailRace,
  longRunClimbBandM,
  WORKOUT_IDS,
  type PlanInput,
} from '../src/lib/coach/planGenerator'
import { getWorkout, type Phase } from '../src/lib/coach/workouts'

function makeInput(over: Partial<PlanInput> = {}): PlanInput {
  return {
    raceName: 'Test Race',
    raceDateISO: '2026-09-13', // dimanche
    raceDistanceKm: 45,
    raceElevationM: 2500,
    raceType: 'Trail',
    todayISO: '2026-06-21',
    daysPerWeek: 5,
    currentCTL: null,
    ...over,
  }
}

// ─── Récupération post-course ─────────────────────────────────────────────────

describe('generateTrainingPlan — récupération post-course', () => {
  it('démarre par des semaines de récup après une course récente (marathon)', () => {
    const plan = generateTrainingPlan(makeInput({
      todayISO: '2026-06-21',
      raceDateISO: '2026-09-13', // ~12 semaines plus tard
      recentRace: { dateISO: '2026-06-18', distanceKm: 42, elevationM: 0 }, // marathon il y a 3 j
    }))
    expect(plan.weeks[0].isPostRaceRecovery).toBe(true)
    expect(plan.weeks[1].isPostRaceRecovery).toBe(true)        // ~2 semaines
    expect(plan.weeks[2].isPostRaceRecovery).toBeFalsy()
    // que de l'easy, aucune séance dure
    const hard = plan.weeks[0].sessions.filter((s) => s.intensity === 'hard')
    expect(hard.length).toBe(0)
    expect(plan.rationale.some((r) => /Récupération post-course/i.test(r))).toBe(true)
  })

  it('reverse taper : la 1re semaine est plus légère que la 2e', () => {
    const plan = generateTrainingPlan(makeInput({
      recentRace: { dateISO: '2026-06-18', distanceKm: 42, elevationM: 0 },
    }))
    expect(plan.weeks[0].volumeHours).toBeLessThanOrEqual(plan.weeks[1].volumeHours)
  })

  it('pas de récup si aucune course récente', () => {
    const plan = generateTrainingPlan(makeInput())
    expect(plan.weeks[0].isPostRaceRecovery).toBeFalsy()
  })

  it('n\'écrase jamais un affûtage imminent (course très proche)', () => {
    // Course dans 2 semaines → phases [taper, race] : pas de place pour la récup.
    const plan = generateTrainingPlan(makeInput({
      todayISO: '2026-06-21',
      raceDateISO: '2026-07-05',
      recentRace: { dateISO: '2026-06-18', distanceKm: 42, elevationM: 0 },
    }))
    expect(plan.weeks.every((w) => !w.isPostRaceRecovery)).toBe(true)
  })
})

// ─── isTrailRace ────────────────────────────────────────────────────────────

describe('isTrailRace', () => {
  it('true si type Trail', () => {
    expect(isTrailRace('Trail', 0)).toBe(true)
  })
  it('true si D+ élevé même sans type', () => {
    expect(isTrailRace(null, 1200)).toBe(true)
  })
  it('false pour une route plate', () => {
    expect(isTrailRace('Route', 150)).toBe(false)
    expect(isTrailRace(null, 100)).toBe(false)
  })
})

// ─── weeksUntil ─────────────────────────────────────────────────────────────

describe('weeksUntil', () => {
  it('arrondit au nombre de semaines supérieur', () => {
    expect(weeksUntil('2026-06-01', '2026-06-29')).toBe(4) // 28 j
    expect(weeksUntil('2026-06-01', '2026-06-30')).toBe(5) // 29 j → 5
  })
  it('renvoie au moins 1 même si la course est passée ou aujourd\'hui', () => {
    expect(weeksUntil('2026-06-01', '2026-06-01')).toBe(1)
    expect(weeksUntil('2026-06-10', '2026-06-01')).toBe(1)
  })
})

// ─── allocatePhases ─────────────────────────────────────────────────────────

describe('allocatePhases', () => {
  it('horizons courts gérés explicitement', () => {
    expect(allocatePhases(1)).toEqual(['race'])
    expect(allocatePhases(2)).toEqual(['taper', 'race'])
    expect(allocatePhases(3)).toEqual(['build', 'taper', 'race'])
    expect(allocatePhases(4)).toEqual(['base', 'build', 'taper', 'race'])
    expect(allocatePhases(5)).toEqual(['base', 'build', 'specific', 'taper', 'race'])
  })

  it('produit toujours exactement n phases', () => {
    for (let n = 1; n <= 30; n++) {
      expect(allocatePhases(n)).toHaveLength(n)
    }
  })

  it('se termine toujours par taper puis race (n ≥ 2)', () => {
    for (let n = 2; n <= 30; n++) {
      const p = allocatePhases(n)
      expect(p[n - 1]).toBe('race')
      expect(p[n - 2]).toBe('taper')
    }
  })

  it('contient toujours au moins une semaine de build (n ≥ 3)', () => {
    for (let n = 3; n <= 30; n++) {
      expect(allocatePhases(n)).toContain('build')
    }
  })

  it('ordre des phases respecté (base avant build avant specific)', () => {
    const p = allocatePhases(16)
    const order: Phase[] = ['base', 'build', 'specific', 'taper', 'race']
    let last = -1
    for (const phase of p) {
      const idx = order.indexOf(phase)
      expect(idx).toBeGreaterThanOrEqual(last)
      last = idx
    }
  })
})

// ─── generateTrainingPlan ───────────────────────────────────────────────────

describe('generateTrainingPlan', () => {
  it('génère une semaine par semaine jusqu\'à la course', () => {
    const plan = generateTrainingPlan(makeInput())
    expect(plan.weeks).toHaveLength(plan.weeksToRace)
    expect(plan.weeks[plan.weeks.length - 1].phase).toBe('race')
  })

  it('chaque session référence un workout valide (sauf le marqueur course)', () => {
    const plan = generateTrainingPlan(makeInput())
    for (const week of plan.weeks) {
      for (const s of week.sessions) {
        if (s.workoutId === 'race') continue
        expect(WORKOUT_IDS).toContain(s.workoutId)
        expect(getWorkout(s.workoutId)).toBeDefined()
      }
    }
  })

  it('toute semaine d\'entraînement contient une sortie longue', () => {
    const plan = generateTrainingPlan(makeInput())
    for (const week of plan.weeks) {
      if (week.phase === 'race') continue
      expect(week.sessions.some((s) => s.system === 'long')).toBe(true)
    }
  })

  it('respecte le nombre de jours par semaine sur les semaines d\'entraînement', () => {
    for (const days of [3, 4, 5, 6]) {
      const plan = generateTrainingPlan(makeInput({ daysPerWeek: days }))
      for (const week of plan.weeks) {
        if (week.phase === 'race') continue
        expect(week.sessions.length).toBe(days)
      }
    }
  })

  it('borne daysPerWeek entre 3 et 6', () => {
    expect(generateTrainingPlan(makeInput({ daysPerWeek: 1 })).daysPerWeek).toBe(3)
    expect(generateTrainingPlan(makeInput({ daysPerWeek: 9 })).daysPerWeek).toBe(6)
  })

  it('course trail → sortie longue D+ + séances spécifiques montée/descente', () => {
    const plan = generateTrainingPlan(makeInput({ raceType: 'Trail', raceElevationM: 2500 }))
    const allIds = plan.weeks.flatMap((w) => w.sessions.map((s) => s.workoutId))
    expect(allIds).toContain('long_run_dplus')
    expect(allIds.some((id) => id === 'hill_repeats_long' || id === 'downhill_technique' || id === 'race_pace_dplus')).toBe(true)
  })

  it('course route → pas de séances trailOnly, sortie longue plate', () => {
    const plan = generateTrainingPlan(makeInput({ raceName: 'Marathon', raceType: 'Route', raceElevationM: 120, raceDistanceKm: 42 }))
    const allIds = plan.weeks.flatMap((w) => w.sessions.map((s) => s.workoutId))
    expect(allIds).toContain('long_run_flat')
    for (const id of allIds) {
      if (id === 'race') continue
      expect(getWorkout(id)!.trailOnly ?? false).toBe(false)
    }
  })

  it('place une semaine de décharge toutes les 4 semaines (hors taper/course)', () => {
    const plan = generateTrainingPlan(makeInput({ todayISO: '2026-05-01' })) // horizon long
    const recoveryWeeks = plan.weeks.filter((w) => w.isRecovery)
    expect(recoveryWeeks.length).toBeGreaterThan(0)
    for (const w of recoveryWeeks) {
      expect(w.phase === 'taper' || w.phase === 'race').toBe(false)
      expect((w.weekIndex + 1) % 4).toBe(0)
    }
  })

  it('le volume baisse à l\'affûtage par rapport au pic', () => {
    const plan = generateTrainingPlan(makeInput({ todayISO: '2026-05-01' }))
    const peak = Math.max(...plan.weeks.map((w) => w.volumeHours))
    const taper = plan.weeks.find((w) => w.phase === 'taper')!
    expect(taper.volumeHours).toBeLessThan(peak)
  })

  it('la semaine de course contient le marqueur course le bon jour', () => {
    const plan = generateTrainingPlan(makeInput()) // course le dimanche 2026-09-13
    const raceWeek = plan.weeks[plan.weeks.length - 1]
    const raceSession = raceWeek.sessions.find((s) => s.system === 'race')
    expect(raceSession).toBeDefined()
    expect(raceSession!.dayOfWeek).toBe(7) // dimanche
    expect(raceSession!.title).toContain('Test Race')
  })

  it('horizon très court ne plante pas et reste cohérent', () => {
    const plan = generateTrainingPlan(makeInput({ todayISO: '2026-09-07' })) // ~1 semaine
    expect(plan.weeks.length).toBeGreaterThanOrEqual(1)
    expect(plan.weeks[plan.weeks.length - 1].phase).toBe('race')
  })

  it('est déterministe (mêmes entrées → même plan)', () => {
    const a = generateTrainingPlan(makeInput())
    const b = generateTrainingPlan(makeInput())
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produit des explications (rationale)', () => {
    const plan = generateTrainingPlan(makeInput())
    expect(plan.rationale.length).toBeGreaterThanOrEqual(3)
    expect(plan.rationale[0]).toContain('Test Race')
  })
})

describe('longRunClimbBandM — rampe de D+ trail', () => {
  it('null hors trail (D+ course nul)', () => {
    expect(longRunClimbBandM('specific', 0)).toBeNull()
    expect(longRunClimbBandM('race', 1500)).toBeNull()
  })

  it('monte vers le pic en spécifique (base < build < spécifique)', () => {
    const base = longRunClimbBandM('base', 1000)!
    const build = longRunClimbBandM('build', 1000)!
    const spe = longRunClimbBandM('specific', 1000)!
    expect(base.max).toBeLessThan(build.max)
    expect(build.max).toBeLessThan(spe.max)
  })

  it('reste une fraction du D+ course (pic < D+ total)', () => {
    const spe = longRunClimbBandM('specific', 1000)!
    expect(spe.max).toBeLessThan(1000)
    expect(spe.min).toBeGreaterThan(0)
  })

  it('réduit en semaine de décharge', () => {
    const normal = longRunClimbBandM('build', 1000, false)!
    const recov = longRunClimbBandM('build', 1000, true)!
    expect(recov.max).toBeLessThan(normal.max)
  })

  it('le plan trail attache un objectif de D+ à la sortie longue', () => {
    const plan = generateTrainingPlan(makeInput({ raceDistanceKm: 45, raceElevationM: 2500, raceType: 'Trail' }))
    const longWithClimb = plan.weeks
      .flatMap((w) => w.sessions)
      .find((s) => s.system === 'long' && s.climbTargetM)
    expect(longWithClimb).toBeDefined()
    expect(longWithClimb!.climbTargetM!.max).toBeGreaterThan(0)
  })

  it('le plan route n\'attache pas de D+', () => {
    const plan = generateTrainingPlan(makeInput({ raceDistanceKm: 42, raceElevationM: 0, raceType: 'Road' }))
    const anyClimb = plan.weeks.flatMap((w) => w.sessions).some((s) => s.climbTargetM)
    expect(anyClimb).toBe(false)
  })
})
