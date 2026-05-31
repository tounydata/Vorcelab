import { describe, it, expect } from 'vitest'
import { structureWorkout } from '../src/lib/coach/structureWorkout'
import { WORKOUTS, getWorkout } from '../src/lib/coach/workouts'

describe('structureWorkout', () => {
  it('produit une séance chiffrée (blocs + durée) pour chaque template du catalogue', () => {
    for (const t of WORKOUTS) {
      const w = structureWorkout(t, 50)
      expect(w.blocks.length).toBeGreaterThan(0)
      expect(w.totalMin).toBeGreaterThan(0)
    }
  })

  it('le seuil (intervalles) porte des blocs à la zone T', () => {
    const w = structureWorkout(getWorkout('threshold_intervals')!, 50)
    expect(w.blocks.some(b => b.zone === 'T')).toBe(true)
  })

  it('la VO2max porte un bloc à la zone I', () => {
    const w = structureWorkout(getWorkout('vo2_intervals')!, 50)
    expect(w.blocks.some(b => b.zone === 'I')).toBe(true)
  })

  it('la durée de l\'endurance suit le baseDurationMin du template', () => {
    const t = getWorkout('endurance_easy')!
    const w = structureWorkout(t, 50)
    expect(w.totalMin).toBe(t.baseDurationMin)
  })
})
