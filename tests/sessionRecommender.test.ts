import { describe, it, expect } from 'vitest'
import { recommendWorkouts } from '../src/lib/sessionRecommender'
import { WORKOUTS, getWorkout } from '../src/lib/coach/workouts'

const ALL = WORKOUTS

describe('recommendWorkouts — choix-first', () => {
  it('retourne TOUJOURS toutes les candidates (n\'en retire jamais)', () => {
    const recs = recommendWorkouts(ALL, { phase: 'base' })
    expect(recs).toHaveLength(ALL.length)
  })

  it('au plus une séance « recommandée »', () => {
    const recs = recommendWorkouts(ALL, { phase: 'build' })
    expect(recs.filter(r => r.badge === 'recommended').length).toBeLessThanOrEqual(1)
  })

  it('sans aucun signal différenciant, pas de fausse recommandation', () => {
    // Deux séances de même intensité/phase → aucun « recommended » arbitraire
    const easy = [getWorkout('endurance_easy')!, getWorkout('recovery_jog')!]
    const recs = recommendWorkouts(easy, {})
    expect(recs.every(r => r.badge !== 'recommended')).toBe(true)
  })

  it('surcharge → le dur est badgé « caution » (jamais retiré)', () => {
    const cand = [getWorkout('endurance_easy')!, getWorkout('vo2_intervals')!]
    const recs = recommendWorkouts(cand, { phase: 'build', overload: true })
    expect(recs.find(r => r.workoutId === 'vo2_intervals')!.badge).toBe('caution')
    expect(recs).toHaveLength(2)
  })

  it('séance dure faite hier → caution sur le dur', () => {
    const cand = [getWorkout('endurance_easy')!, getWorkout('threshold_intervals')!]
    const recs = recommendWorkouts(cand, { phase: 'build', daysSinceHard: 1 })
    expect(recs.find(r => r.workoutId === 'threshold_intervals')!.badge).toBe('caution')
  })

  it('système déjà fait cette semaine → badge repeat', () => {
    const cand = [getWorkout('tempo_run')!, getWorkout('long_run_flat')!]
    const recs = recommendWorkouts(cand, { phase: 'build', recentSystems: ['tempo'] })
    expect(recs.find(r => r.workoutId === 'tempo_run')!.badge).toBe('repeat')
  })

  it('charge élevée → une séance facile est badgée récup', () => {
    const cand = [getWorkout('recovery_jog')!, getWorkout('threshold_intervals')!]
    const recs = recommendWorkouts(cand, { phase: 'build', acwr: 1.5 })
    expect(recs.find(r => r.workoutId === 'recovery_jog')!.badge).toBe('recommended')
  })
})
