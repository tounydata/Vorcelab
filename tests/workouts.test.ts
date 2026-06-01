import { describe, it, expect } from 'vitest'
import { WORKOUTS, getWorkout, type WorkoutTarget } from '../src/lib/coach/workouts'

const TARGETS: WorkoutTarget[] = [
  'aerobic_base', 'threshold', 'vo2max', 'economy', 'speed',
  'climbing', 'descending', 'durability', 'race_specificity', 'recovery',
]

describe('bibliothèque WORKOUTS — invariants', () => {
  it('ids uniques', () => {
    const ids = WORKOUTS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('chaque séance porte des métadonnées d\'adaptation complètes', () => {
    for (const w of WORKOUTS) {
      expect(w.levels.length, `${w.id}: levels`).toBeGreaterThan(0)
      expect(w.distances.length, `${w.id}: distances`).toBeGreaterThan(0)
      expect(TARGETS, `${w.id}: target`).toContain(w.target)
      expect(w.phases.length, `${w.id}: phases`).toBeGreaterThan(0)
      expect(w.baseDurationMin, `${w.id}: durée`).toBeGreaterThan(0)
    }
  })

  it('couvre les distances et les points faibles clés', () => {
    for (const d of ['5k', '10k', 'half', 'marathon', 'ultra'] as const) {
      expect(WORKOUTS.some((w) => w.distances.includes(d)), `distance ${d}`).toBe(true)
    }
    for (const t of TARGETS) {
      expect(WORKOUTS.some((w) => w.target === t), `target ${t}`).toBe(true)
    }
  })

  it('les séances trailOnly portent un terrain montée/descente ou climbing', () => {
    for (const w of WORKOUTS.filter((w) => w.trailOnly)) {
      const ok = w.climbing || w.terrain === 'uphill' || w.terrain === 'downhill' || w.terrain === 'any'
      expect(ok, `${w.id}`).toBe(true)
    }
  })

  it('les ids référencés par le générateur de plan existent toujours', () => {
    const referenced = [
      'endurance_easy', 'recovery_jog', 'long_run_flat', 'long_run_dplus',
      'tempo_run', 'progressive_run', 'fartlek', 'threshold_intervals',
      'hill_repeats_short', 'hill_repeats_long', 'vo2_intervals',
      'downhill_technique', 'race_pace_dplus', 'sharpener', 'shakeout',
    ]
    for (const id of referenced) expect(getWorkout(id), id).toBeDefined()
  })
})
