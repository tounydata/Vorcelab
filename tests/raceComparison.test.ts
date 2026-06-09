import { describe, it, expect } from 'vitest'
import { findRaceActivity, compareProjectionToActual } from '../src/lib/raceComparison'
import type { ProjectionResult } from '../src/lib/computeRaceProjection'
import type { StreamData } from '../src/lib/streams'

function act(over: Record<string, unknown>): Record<string, unknown> {
  return { id: 'a', name: 'x', sport_type: 'Run', start_date: '2026-06-07T08:00:00Z', distance: 42000, moving_time: 12600, ...over }
}

describe('findRaceActivity', () => {
  const raceISO = '2026-06-07T00:00:00Z'

  it('retient la course à pied datée à ±2 j et de distance proche', () => {
    const a = findRaceActivity([act({ id: 'good' })], raceISO, 42000)
    expect(a?.id).toBe('good')
  })

  it('exclut le vélo', () => {
    const a = findRaceActivity([act({ id: 'bike', sport_type: 'Ride' })], raceISO, 42000)
    expect(a).toBeNull()
  })

  it('exclut une activité trop loin dans le temps', () => {
    const a = findRaceActivity([act({ id: 'far', start_date: '2026-06-20T08:00:00Z' })], raceISO, 42000)
    expect(a).toBeNull()
  })

  it('exclut une distance trop éloignée (10 km pour un marathon)', () => {
    const a = findRaceActivity([act({ id: 'short', distance: 10000 })], raceISO, 42000)
    expect(a).toBeNull()
  })

  it('choisit la plus proche en date quand plusieurs candidates', () => {
    const a = findRaceActivity([
      act({ id: 'd2', start_date: '2026-06-08T08:00:00Z' }),
      act({ id: 'd0', start_date: '2026-06-07T09:00:00Z' }),
    ], raceISO, 42000)
    expect(a?.id).toBe('d0')
  })
})

describe('compareProjectionToActual', () => {
  // Projection : 2 sections de 5 km, 1800 s chacune (total 10 km, 3600 s).
  const proj = {
    sections: [
      { type: 'flat', startKm: 0, endKm: 5 },
      { type: 'up', startKm: 5, endKm: 10 },
    ],
    sectionTimes: [1800, 1800],
    totalDistM: 10000,
    estTimeS: 3600,
  } as unknown as ProjectionResult

  it('calcule le delta total et par tronçon (réel plus lent)', () => {
    // Réel : 0→5 km en 1800 s (pile), 5→10 km en 2200 s (plus lent). Total 4000 s.
    const stream: StreamData = {
      distance: { data: [0, 5000, 10000] },
      time: { data: [0, 1800, 4000] },
    }
    const c = compareProjectionToActual(proj, stream)!
    expect(c).not.toBeNull()
    expect(c.actualTotalS).toBe(4000)
    expect(c.deltaS).toBe(400)
    expect(Math.round(c.deltaPct)).toBe(11)
    expect(c.sections[0].actualS).toBe(1800)
    expect(c.sections[0].deltaS).toBe(0)
    expect(c.sections[1].actualS).toBe(2200)
    expect(c.sections[1].deltaS).toBe(400)
    expect(c.worstSection?.startKm).toBe(5)
    expect(c.bestSection?.startKm).toBe(0)
  })

  it('interpole le temps réel à mi-tronçon', () => {
    const stream: StreamData = {
      distance: { data: [0, 2500, 5000, 10000] },
      time: { data: [0, 900, 1800, 3600] },
    }
    const c = compareProjectionToActual(proj, stream)!
    expect(c.sections[0].actualS).toBe(1800)
    expect(c.sections[1].actualS).toBe(1800)
    expect(c.deltaS).toBe(0)
  })

  it('renvoie null si streams incomplets', () => {
    expect(compareProjectionToActual(proj, {})).toBeNull()
    expect(compareProjectionToActual(proj, { distance: { data: [0] }, time: { data: [0] } })).toBeNull()
  })
})
