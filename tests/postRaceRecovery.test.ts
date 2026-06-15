import { describe, it, expect } from 'vitest'
import { recoveryDaysForRace, computePostRaceRecovery } from '../src/lib/coach/postRaceRecovery'

describe('recoveryDaysForRace — durée ∝ distance + D+', () => {
  it('augmente avec la distance', () => {
    expect(recoveryDaysForRace(10)).toBe(4)     // 10K
    expect(recoveryDaysForRace(21)).toBe(8)     // semi
    expect(recoveryDaysForRace(42)).toBe(14)    // marathon ≈ 2 semaines
    expect(recoveryDaysForRace(80)).toBe(21)    // ultra ≈ 3 semaines
    expect(recoveryDaysForRace(160)).toBe(28)   // 100 mi ≈ 4 semaines
  })
  it('le dénivelé (excentrique) allonge la récup', () => {
    expect(recoveryDaysForRace(42, 0)).toBe(14)
    expect(recoveryDaysForRace(42, 600)).toBe(16)
    expect(recoveryDaysForRace(42, 1500)).toBe(18)
    expect(recoveryDaysForRace(42, 3000)).toBe(21)
  })
})

describe('computePostRaceRecovery', () => {
  it('marathon couru il y a 3 j → ~2 semaines, encore 11 j → 2 semaines de plan', () => {
    const r = computePostRaceRecovery({ dateISO: '2026-06-01', distanceKm: 42, elevationM: 0 }, '2026-06-04')!
    expect(r.totalDays).toBe(14)
    expect(r.daysElapsed).toBe(3)
    expect(r.daysRemaining).toBe(11)
    expect(r.recoveryWeeks).toBe(2)
    expect(r.inWindow).toBe(true)
  })
  it('10K couru il y a 1 j → 1 semaine', () => {
    const r = computePostRaceRecovery({ dateISO: '2026-06-01', distanceKm: 10, elevationM: 0 }, '2026-06-02')!
    expect(r.recoveryWeeks).toBe(1)
    expect(r.inWindow).toBe(true)
  })
  it('hors fenêtre si la récup est passée', () => {
    const r = computePostRaceRecovery({ dateISO: '2026-05-01', distanceKm: 42, elevationM: 0 }, '2026-06-01')!
    expect(r.inWindow).toBe(false)
    expect(r.recoveryWeeks).toBe(0)
  })
  it('null si course future ou distance inconnue', () => {
    expect(computePostRaceRecovery({ dateISO: '2026-07-01', distanceKm: 42, elevationM: 0 }, '2026-06-01')).toBeNull()
    expect(computePostRaceRecovery({ dateISO: '2026-06-01', distanceKm: 0, elevationM: 0 }, '2026-06-04')).toBeNull()
  })
  it('borne à 3 semaines (ultra long)', () => {
    const r = computePostRaceRecovery({ dateISO: '2026-06-01', distanceKm: 160, elevationM: 6000 }, '2026-06-02')!
    expect(r.recoveryWeeks).toBe(3)
  })
})
