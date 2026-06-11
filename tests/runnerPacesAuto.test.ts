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

  // ── Récence : un vieux record ne doit pas dicter les allures à pleine valeur ──
  const NOW = Date.parse('2026-06-11T00:00:00Z')
  const ago = (months: number) => new Date(NOW - months * 30.44 * 864e5).toISOString()

  it('ignore une course de plus de 18 mois (couperet récence)', () => {
    expect(deriveAutoPrs([{ ...semi, start_date: ago(20) }], NOW)).toBeNull()
  })

  it('garde une course récente à pleine valeur (< 6 mois, pas de décote)', () => {
    const prs = deriveAutoPrs([{ ...semi, start_date: ago(2) }], NOW)!
    expect(prs.semi.timeS).toBe(6300) // temps inchangé
  })

  it('décote (ralentit le temps effectif) une course ancienne mais < 18 mois', () => {
    const fresh = deriveAutoPrs([{ ...semi, start_date: ago(2) }], NOW)!
    const old = deriveAutoPrs([{ ...semi, start_date: ago(18) }], NOW)!
    expect(old.semi.timeS).toBeGreaterThan(fresh.semi.timeS) // décoté = plus lent
    // VDOT décoté < VDOT frais (prudence, jamais d'optimisme).
    expect(deriveRunnerPaces(old, null)!.vdot).toBeLessThan(deriveRunnerPaces(fresh, null)!.vdot)
  })

  it('préfère une course fraîche un peu plus lente à un vieux record décoté', () => {
    const oldFast = { ...semi, moving_time: 6000, start_date: ago(17) } // rapide mais vieux
    const freshSlower = { ...semi, moving_time: 6200, start_date: ago(1) } // frais
    const prs = deriveAutoPrs([oldFast, freshSlower], NOW)!
    expect(prs.semi.timeS).toBe(6200) // la fraîche prime (allure effective)
  })
})
