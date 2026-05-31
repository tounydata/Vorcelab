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

  it('alignement knowledge-base : les types spécifiques sont au catalogue', () => {
    for (const id of ['block_choc_d1', 'block_choc_d2', 'billat_30_30', 'roche_1_1', 'hill_30_30', 'marathon_pace']) {
      const t = getWorkout(id)
      expect(t, `template ${id} manquant`).toBeDefined()
      expect(structureWorkout(t!, 50).blocks.length).toBeGreaterThan(0)
    }
  })
})
