import { describe, it, expect } from 'vitest'
import { pickRacePrompt, type RaceCalendarRow } from '../src/lib/racePrompt'

const NOW = new Date('2026-06-15T20:00:00Z').getTime()
const D = 86_400_000
const ymd = (offsetDays: number) => new Date(NOW + offsetDays * D).toISOString().slice(0, 10)

function race(over: Partial<RaceCalendarRow>): RaceCalendarRow {
  return { id: 'r1', name: 'Trail X', date: ymd(-2), distance: 30, ...over }
}

function activity(dayOffset: number, distM: number): Record<string, unknown> {
  return {
    id: 'a1', strava_activity_id: '111', type: 'TrailRun', sport_type: 'TrailRun',
    distance: distM, moving_time: 10800,
    start_date: new Date(NOW + dayOffset * D).toISOString(),
  }
}

describe('pickRacePrompt', () => {
  it('propose une course récente non liée', () => {
    const r = pickRacePrompt([race({})], [], [], NOW)
    expect(r?.race.id).toBe('r1')
  })

  it('ignore une course déjà liée à une activité', () => {
    const r = pickRacePrompt([race({ result_activity_id: 'a1' })], [], [], NOW)
    expect(r).toBeNull()
  })

  it('ignore une course écartée par le coureur', () => {
    const r = pickRacePrompt([race({})], [], ['r1'], NOW)
    expect(r).toBeNull()
  })

  it('ignore une course future', () => {
    const r = pickRacePrompt([race({ date: ymd(3) })], [], [], NOW)
    expect(r).toBeNull()
  })

  it('ignore une course trop ancienne (au-delà de la fenêtre)', () => {
    const r = pickRacePrompt([race({ date: ymd(-20) })], [], [], NOW)
    expect(r).toBeNull()
  })

  it('choisit la plus récente et suggère l\'activité correspondante', () => {
    const races = [race({ id: 'old', date: ymd(-8) }), race({ id: 'recent', date: ymd(-1) })]
    const acts = [activity(-1, 30000)] // même jour & distance que « recent »
    const r = pickRacePrompt(races, acts, [], NOW)
    expect(r?.race.id).toBe('recent')
    expect(r?.suggestion?.stravaActivityId).toBe('111')
  })
})
