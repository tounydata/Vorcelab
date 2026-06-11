import { describe, it, expect } from 'vitest'
import { deriveAutoPrs, deriveRunnerPaces } from '../src/lib/runnerPaces'

// Semi route en 1h45 (course Strava workout_type=1) → VDOT ~43.
const semi = {
  sport_type: 'Run', distance: 21097, moving_time: 6300, total_elevation_gain: 40,
  raw_data: { workout_type: 1 },
}

describe('deriveAutoPrs', () => {
  it('dérive un PR depuis une course route étiquetée', () => {
    const prs = deriveAutoPrs([semi])
    expect(prs?.semi).toBeTruthy()
    expect(prs!.semi.dist).toBe(21097)
  })

  it('ignore les sorties NON étiquetées course', () => {
    expect(deriveAutoPrs([{ ...semi, raw_data: { workout_type: 0 } }])).toBeNull()
  })

  it('ignore le trail (D+/km trop élevé fausserait le VDOT plat)', () => {
    expect(deriveAutoPrs([{ ...semi, total_elevation_gain: 900 }])).toBeNull()
  })

  it('ignore le vélo', () => {
    expect(deriveAutoPrs([{ ...semi, sport_type: 'Ride' }])).toBeNull()
  })

  it('honore l\'étiquette Vorcelab is_race', () => {
    const prs = deriveAutoPrs([{ ...semi, raw_data: null, is_race: true }])
    expect(prs?.semi).toBeTruthy()
  })

  it('garde le meilleur temps par distance', () => {
    const slow = { ...semi, moving_time: 7200 }
    const fast = { ...semi, moving_time: 6000 }
    const prs = deriveAutoPrs([slow, fast])
    expect(prs!.semi.timeS).toBe(6000)
  })

  it('produit un VDOT crédible (~43 pour 1h45 au semi)', () => {
    const prs = deriveAutoPrs([semi])!
    const rp = deriveRunnerPaces(prs, null)
    expect(rp?.source).toBe('race_pr')
    expect(rp!.vdot).toBeGreaterThan(40)
    expect(rp!.vdot).toBeLessThan(46)
  })
})
