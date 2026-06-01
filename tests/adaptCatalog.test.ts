import { describe, it, expect } from 'vitest'
import {
  adaptCatalog, topAdaptedIds, isEligible, distanceFocusFromKm, type AdaptProfile,
} from '../src/lib/coach/adaptCatalog'
import { getWorkout } from '../src/lib/coach/workouts'

const base: AdaptProfile = {
  level: 'intermediate', distance: '10k', trail: false, phase: 'build',
}

describe('adaptCatalog — gating (sécurité)', () => {
  it('un débutant ne reçoit jamais les séances avancées exclues', () => {
    const ids = adaptCatalog({ ...base, level: 'beginner', phase: 'specific' }).map((s) => s.template.id)
    for (const banned of ['over_under', 'vo2_pyramide', 'sprints_alactic', 'reps_r_400', 'plyometrics', 'canova_special', 'block_choc_d1', 'descent_long', 'vert_specific']) {
      expect(ids, banned).not.toContain(banned)
    }
  })

  it('exclut les séances trailOnly pour une course route (sans exception)', () => {
    const road = adaptCatalog({ ...base, trail: false, phase: 'specific' })
    expect(road.every((s) => !s.template.trailOnly)).toBe(true)
  })

  it('admet une séance trailOnly sur route si terrain dispo + point faible montée', () => {
    const t = getWorkout('hill_repeats_long')!
    expect(isEligible(t, { ...base, phase: 'specific', trail: false })).toBe(false)
    expect(isEligible(t, {
      ...base, phase: 'specific', trail: false,
      terrainAvailable: ['uphill'], weaknesses: ['climbing'], distance: 'ultra',
    })).toBe(true)
  })

  it('respecte le filtre de phase', () => {
    const taper = adaptCatalog({ ...base, phase: 'taper' })
    expect(taper.every((s) => s.template.phases.includes('taper'))).toBe(true)
  })
})

describe('adaptCatalog — scoring (priorisation)', () => {
  it('le point faible est le levier le plus fort', () => {
    const withWeak = adaptCatalog({ ...base, distance: '10k', weaknesses: ['vo2max'] })
    const top = withWeak[0]
    expect(top.template.target).toBe('vo2max')
    expect(top.reasons.join(' ')).toContain('point faible')
  })

  it('un 5k priorise vo2max/vitesse, pas la longue', () => {
    const ids = topAdaptedIds({ ...base, distance: '5k', phase: 'build' }, 5)
    expect(ids.some((id) => ['vo2_1000', 'vo2_800', 'vo2_intervals', 'reps_r_200', 'fartlek'].includes(id))).toBe(true)
    expect(ids).not.toContain('long_run_flat')
  })

  it('un trail booste les séances de montée/descente', () => {
    const trail = adaptCatalog({ ...base, distance: 'ultra', trail: true, phase: 'specific', weaknesses: ['climbing'] })
    expect(['climbing', 'race_specificity', 'durability']).toContain(trail[0].template.target)
  })

  it('la densité qualité pénalise les séances dures (anti-surcharge)', () => {
    const noLoad = adaptCatalog({ ...base, weaknesses: ['vo2max'] })
    const loaded = adaptCatalog({ ...base, weaknesses: ['vo2max'], qualityDensity: 3 })
    const hardId = noLoad[0].template.id
    const a = noLoad.find((s) => s.template.id === hardId)!.score
    const b = loaded.find((s) => s.template.id === hardId)!.score
    expect(b).toBeLessThan(a)
  })

  it('tri déterministe (stable)', () => {
    const a = topAdaptedIds(base, 8)
    const b = topAdaptedIds(base, 8)
    expect(a).toEqual(b)
  })
})

describe('distanceFocusFromKm', () => {
  it('mappe les distances usuelles', () => {
    expect(distanceFocusFromKm(5)).toBe('5k')
    expect(distanceFocusFromKm(10)).toBe('10k')
    expect(distanceFocusFromKm(21)).toBe('half')
    expect(distanceFocusFromKm(42)).toBe('marathon')
    expect(distanceFocusFromKm(80)).toBe('ultra')
  })
})
