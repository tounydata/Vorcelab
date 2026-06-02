import { describe, it, expect } from 'vitest'
import { generateTrainingPlan, type PlanInput } from '../src/lib/coach/planGenerator'
import { getWorkout } from '../src/lib/coach/workouts'
import { structureWorkout } from '../src/lib/coach/structureWorkout'

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

  it('semi : 2 semaines d\'affûtage → pic de charge ~3 semaines avant la course', () => {
    // weeksUntil('2026-05-01','2026-09-13') ≈ 19 semaines, distance 21 km.
    const plan = generateTrainingPlan(road10k({ raceDistanceKm: 21 }))
    const taper = plan.weeks.filter((w) => w.phase === 'taper')
    expect(taper).toHaveLength(2)
    // La dernière semaine d'entraînement « spécifique » (le pic) est à 3 semaines de la course.
    const specific = plan.weeks.filter((w) => w.phase === 'specific')
    const lastSpecific = specific[specific.length - 1]
    const raceWeek = plan.weeks[plan.weeks.length - 1]
    expect(raceWeek.weekIndex - lastSpecific.weekIndex).toBe(3)
    // Volume décroissant : avant-dernier taper > dernier taper.
    expect(taper[0].volumeHours).toBeGreaterThan(taper[1].volumeHours)
  })

  it('marathon : 3 semaines d\'affûtage', () => {
    const plan = generateTrainingPlan(road10k({ raceDistanceKm: 42 }))
    expect(plan.weeks.filter((w) => w.phase === 'taper')).toHaveLength(3)
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

describe('plan — calibration par CTL réel', () => {
  it('un CTL bas réduit le volume de pic (prudence graduée)', () => {
    const base = generateTrainingPlan(road10k({ raceDistanceKm: 21 }))
    const low = generateTrainingPlan(road10k({ raceDistanceKm: 21, currentCTL: 15 }))
    const peakBase = Math.max(...base.weeks.map((w) => w.volumeHours))
    const peakLow = Math.max(...low.weeks.map((w) => w.volumeHours))
    expect(peakLow).toBeLessThan(peakBase)
  })
  it('un CTL élevé ne pénalise pas le volume', () => {
    const base = generateTrainingPlan(road10k({ raceDistanceKm: 21 }))
    const high = generateTrainingPlan(road10k({ raceDistanceKm: 21, currentCTL: 50 }))
    const peakBase = Math.max(...base.weeks.map((w) => w.volumeHours))
    const peakHigh = Math.max(...high.weeks.map((w) => w.volumeHours))
    expect(peakHigh).toBe(peakBase)
  })
})

// Régression : le coach proposait « X × 30 s à VMA » (VO2max à plat) en affûtage
// d'une course TRAIL — incohérent (Bosquet 2007 ; Koop ; Uphill Athlete). La séance
// d'affûtage doit être un rappel NEUROMUSCULAIRE, en côte pour le trail.
describe('plan — affûtage : séances STRUCTURÉES cohérentes (pas de VO2max)', () => {
  const trailTaper = (over: Partial<PlanInput> = {}) =>
    generateTrainingPlan({
      raceName: 'Trail', raceDateISO: '2026-06-12', raceDistanceKm: 30, raceElevationM: 1500,
      raceType: 'Trail', todayISO: '2026-06-02', daysPerWeek: 5, currentCTL: 40, ...over,
    })
  const roadTaper = (over: Partial<PlanInput> = {}) =>
    generateTrainingPlan({
      raceName: 'Semi', raceDateISO: '2026-06-14', raceDistanceKm: 21, raceElevationM: 100,
      raceType: 'Route', todayISO: '2026-06-02', daysPerWeek: 5, currentCTL: 40, ...over,
    })
  const taperMains = (plan: ReturnType<typeof generateTrainingPlan>) =>
    plan.weeks
      .filter((w) => w.phase === 'taper')
      .flatMap((w) => w.sessions)
      .map((s) => structureWorkout(getWorkout(s.workoutId)!, 50))

  it('aucune séance d\'affûtage ne se structure en VO2max (« @ VMA » / 30 s I-zone)', () => {
    for (const plan of [trailTaper(), roadTaper(), trailTaper({ weaknesses: ['vo2max'] })]) {
      for (const w of taperMains(plan)) {
        expect(w.type, JSON.stringify(w.blocks.map((b) => b.label))).not.toBe('vo2_30_30')
        expect(w.type).not.toBe('vo2_reps')
        for (const b of w.blocks) {
          expect(b.label ?? '', `bloc affûtage`).not.toMatch(/VMA/i)
        }
      }
    }
  })

  it('le rappel d\'affûtage TRAIL est en côte (spécificité montée), pas à plat', () => {
    const ids = trailTaper().weeks.filter((w) => w.phase === 'taper').flatMap((w) => w.sessions.map((s) => s.workoutId))
    expect(ids).toContain('sharpener_hill')
    expect(structureWorkout(getWorkout('sharpener_hill')!, 50).type).toBe('hill')
  })

  it('le rappel d\'affûtage ROUTE est de simples lignes droites (strides)', () => {
    const ids = roadTaper().weeks.filter((w) => w.phase === 'taper').flatMap((w) => w.sessions.map((s) => s.workoutId))
    expect(ids).toContain('sharpener')
    expect(structureWorkout(getWorkout('sharpener')!, 50).type).toBe('strides')
  })

  it('aucun système interdit (vo2max/seuil/descente/renfo) en semaine d\'affûtage', () => {
    for (const plan of [trailTaper(), roadTaper()]) {
      for (const w of plan.weeks.filter((w) => w.phase === 'taper')) {
        for (const s of w.sessions) {
          expect(['vo2max', 'threshold', 'descent', 'strength'], `${s.workoutId}`).not.toContain(s.system)
        }
      }
    }
  })
})
