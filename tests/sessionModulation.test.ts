import { describe, it, expect } from 'vitest'
import { computeAdjustment, scaleWorkout, nextQualityWorkoutId } from '../src/lib/coach/sessionModulation'
import { structureWorkout } from '../src/lib/coach/structureWorkout'
import { getWorkout } from '../src/lib/coach/workouts'
import { tempoRun } from '../src/lib/sessionGenerator'

describe('computeAdjustment', () => {
  it('trop_dur → lighten, trop_facile → progress, sinon none', () => {
    expect(computeAdjustment('trop_dur').direction).toBe('lighten')
    expect(computeAdjustment('trop_facile').direction).toBe('progress')
    expect(computeAdjustment('conforme').direction).toBe('none')
    expect(computeAdjustment('manquee').direction).toBe('none')
    expect(computeAdjustment(null).direction).toBe('none')
  })
})

describe('scaleWorkout — adaptation intra-séance', () => {
  // VO2max : 12 × 30 s @ VMA (séance fractionnée).
  const vo2 = structureWorkout(getWorkout('vo2_intervals')!, 50)
  const mainReps = (w: typeof vo2) => w.blocks.find((b) => b.kind === 'main' && (b.reps ?? 1) > 1)?.reps
  const mainPace = (w: typeof vo2) => w.blocks.find((b) => b.kind === 'main' && b.paceSecPerKm)?.paceSecPerKm

  it('trop dur : −1 répétition ET allure assouplie', () => {
    const before = mainReps(vo2)!
    const beforePace = mainPace(vo2)!
    const { workout, summary } = scaleWorkout(vo2, 'lighten')
    expect(mainReps(workout)).toBe(before - 1)
    expect(mainPace(workout)).toBe(beforePace + 8) // +8 s/km = plus lent
    expect(summary).toContain('reps')
    expect(summary).toContain('allure')
  })

  it('trop facile : +1 répétition ET allure plus rapide', () => {
    const before = mainReps(vo2)!
    const beforePace = mainPace(vo2)!
    const { workout } = scaleWorkout(vo2, 'progress')
    expect(mainReps(workout)).toBe(before + 1)
    expect(mainPace(workout)).toBe(beforePace - 5) // −5 s/km = plus rapide
  })

  it('le label suit le nombre de reps (12 → 11)', () => {
    const { workout } = scaleWorkout(vo2, 'lighten')
    const main = workout.blocks.find((b) => b.kind === 'main' && (b.reps ?? 1) > 1)!
    expect(main.label).toContain('11')
    expect(main.label).not.toMatch(/\b12\b/)
  })

  it('plancher : ne descend jamais sous 3 reps', () => {
    let w = tempoRun(50, 20) // continu — pas de reps : on fabrique un cas fractionné réduit
    // réduit VO2 jusqu'au plancher
    w = structureWorkout(getWorkout('vo2_intervals')!, 50)
    for (let i = 0; i < 20; i++) w = scaleWorkout(w, 'lighten').workout
    const reps = w.blocks.find((b) => b.kind === 'main' && (b.reps ?? 1) >= 1)?.reps ?? 0
    expect(reps).toBeGreaterThanOrEqual(3)
  })

  it('séance continue (tempo) trop dure : allure assouplie + durée réduite', () => {
    const tempo = tempoRun(50, 30)
    const beforeMain = tempo.blocks.find((b) => b.kind === 'main')!
    const { workout, summary } = scaleWorkout(tempo, 'lighten')
    const afterMain = workout.blocks.find((b) => b.kind === 'main')!
    expect(afterMain.paceSecPerKm!).toBe(beforeMain.paceSecPerKm! + 8)
    expect(afterMain.durationSec!).toBeLessThan(beforeMain.durationSec!)
    expect(summary).toContain('durée')
  })
})

describe('nextQualityWorkoutId', () => {
  it('renvoie la 1re séance qualité (hard / système qualité)', () => {
    const sessions = [
      { workoutId: 'endurance_easy', system: 'endurance', intensity: 'easy' },
      { workoutId: 'vo2_intervals', system: 'vo2max', intensity: 'hard' },
    ]
    expect(nextQualityWorkoutId(sessions)).toBe('vo2_intervals')
  })
  it('null si aucune séance qualité', () => {
    expect(nextQualityWorkoutId([{ workoutId: 'endurance_easy', system: 'endurance', intensity: 'easy' }])).toBeNull()
  })
})
