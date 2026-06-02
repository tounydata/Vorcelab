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

describe('structureWorkout — chaque séance a SA structure (P2 audit)', () => {
  const main = (id: string) => structureWorkout(getWorkout(id)!, 50).blocks.find((b) => b.kind === 'main')!

  it('les VO2max ne sont plus tous identiques', () => {
    expect(main('vo2_1000').reps).toBe(5)
    expect(main('vo2_1000').durationSec).toBe(180)
    expect(main('vo2_800').reps).toBe(6)
    expect(main('vo2_long_reps').durationSec).toBe(240)
    expect(main('billat_15_15').durationSec).toBe(15)
    expect(main('billat_15_15').reps).toBe(20)
    expect(main('vo2_intervals').durationSec).toBe(30)
    expect(main('vo2_1000').durationSec).not.toBe(main('vo2_intervals').durationSec)
  })

  it('les seuils sont différenciés', () => {
    expect(main('threshold_cruise_short').reps).toBe(5)
    expect(main('threshold_cruise_short').durationSec).toBe(300)
    expect(main('threshold_intervals').reps).toBe(4)
    expect(main('over_under').label).toContain('sous-seuil')
    expect(main('tempo_long').durationSec).toBe(40 * 60)
  })

  it('allure course = vraie allure spécifique', () => {
    expect(structureWorkout(getWorkout('marathon_pace')!, 50).type).toBe('race_pace')
    expect(main('marathon_pace').zone).toBe('M')
    expect(main('race_half').zone).toBe('T')
  })
})
