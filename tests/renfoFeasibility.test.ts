import { describe, it, expect } from 'vitest'
import { buildSession, getBestVariant, isVariantFeasible } from '../src/lib/renfoProgram'
// @ts-ignore — données JS sans types
import { RENFO_EXERCISES } from '../src/lib/renfoData'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EX = RENFO_EXERCISES as Record<string, any>

const HOME_BARE = { has_gym_access: false, equipment: {}, sessions_per_week: 3 }
const GYM = { has_gym_access: true, equipment: { barbell: true, bench: true, leg_press: true, pullup_bar: true }, sessions_per_week: 3 }

describe('getBestVariant — ne propose plus une variante impossible', () => {
  it('face pull : null à la maison (poulie/élastique requis), une variante en salle', () => {
    expect(getBestVariant(EX['face_pull'], HOME_BARE)).toBeNull()
    expect(getBestVariant(EX['face_pull'], GYM)).not.toBeNull()
  })

  it('un exercice poids de corps reste réalisable à la maison', () => {
    // squat_lourd a une variante poids de corps en dernier recours
    expect(getBestVariant(EX['squat_lourd'], HOME_BARE)).not.toBeNull()
  })

  it('isVariantFeasible respecte le matériel requis', () => {
    const cable = EX['face_pull'].variants.find((v: { id: string }) => v.id === 'face_pull_cable')
    expect(isVariantFeasible(cable, HOME_BARE)).toBe(false)
    expect(isVariantFeasible(cable, GYM)).toBe(true)
  })
})

describe('buildSession — aucune séance ne contient un exercice infaisable', () => {
  for (const focus of ['force_lourde', 'haut_corps', 'tronc', 'pliometrie', 'excentrique']) {
    it(`maison nu : tous les exercices de "${focus}" sont réalisables`, () => {
      const s = buildSession(focus, HOME_BARE)
      for (const exo of s.exercises) {
        expect(getBestVariant(EX[exo.exercise_id], HOME_BARE)).not.toBeNull()
      }
      // face pull ne doit jamais apparaître à la maison nue
      expect(s.exercises.map((e) => e.exercise_id)).not.toContain('face_pull')
    })
  }
})
