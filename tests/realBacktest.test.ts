import { describe, it, expect } from 'vitest'
import {
  runRealBacktest,
  projectRaceCase,
  selectPriorActivities,
  shortHash,
  type BacktestActivity,
  type RaceCaseInput,
} from '../src/lib/realBacktest'

const RACE_USER = 'user-uuid-1111-2222-3333-444455556666'
const RACE_NAME = 'Semi de Mulhouse !! Avec le CHEF'

// Tracé synthétique : ligne ~5 km, plat, route.
function roadRaceStreams() {
  const latlng: [number, number][] = []
  const altitude: number[] = []
  for (let i = 0; i < 70; i++) { latlng.push([47.0, 7.0 + i * 0.001]); altitude.push(100) }
  return { latlng: { data: latlng }, altitude: { data: altitude }, heartrate: { data: latlng.map(() => 150) } }
}

function priorRun(id: string, date: string): BacktestActivity {
  return {
    id, user_id: RACE_USER, strava_activity_id: id, name: 'Footing',
    type: 'Run', sport_type: 'Run', start_date: date,
    distance: 10000, moving_time: 3000, elapsed_time: 3000, total_elevation_gain: 20,
    average_speed: 3.33, average_heartrate: 150, max_heartrate: 185, is_race: false, workout_type: 0,
  }
}

const race: BacktestActivity = {
  id: 'race-1', user_id: RACE_USER, strava_activity_id: 'race-1', name: RACE_NAME,
  type: 'Run', sport_type: 'Run', start_date: '2026-03-29T08:00:00Z',
  distance: 5000, moving_time: 1500, elapsed_time: 1505, total_elevation_gain: 10,
  average_speed: 3.33, average_heartrate: 165, max_heartrate: 188, is_race: false, workout_type: 1,
}

const priors = [
  priorRun('p1', '2026-03-01T08:00:00Z'),
  priorRun('p2', '2026-03-08T08:00:00Z'),
  priorRun('p3', '2026-03-15T08:00:00Z'),
]

function baseCase(): RaceCaseInput {
  return {
    race,
    raceStreams: roadRaceStreams(),
    allActivities: [race, ...priors],
    priorStreams: {},
    fcMax: 190,
    hasWeather: false,
  }
}

describe('selectPriorActivities — anti-fuite + même athlète', () => {
  it('exclut la course elle-même, les activités postérieures et les autres athlètes', () => {
    const other: BacktestActivity = { ...priorRun('x', '2026-03-10T08:00:00Z'), user_id: 'autre' }
    const after: BacktestActivity = priorRun('late', '2026-04-01T08:00:00Z')
    const sel = selectPriorActivities([race, ...priors, other, after], race)
    expect(sel.map((a) => a.id).sort()).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('runRealBacktest — orchestration', () => {
  it('produit une projection réelle et des métriques cohérentes', () => {
    const report = runRealBacktest([baseCase()], { now: new Date('2026-07-16T00:00:00Z') })
    expect(report.counts.tested).toBe(1)
    expect(report.rows).toHaveLength(1)
    const r = report.rows[0]
    expect(r.predicted_s).toBeGreaterThan(0)
    expect(r.actual_s).toBe(1500)
    // Les métriques agrégées correspondent aux erreurs des lignes.
    expect(report.overall.maeS).toBeCloseTo(r.absolute_error_s, 5)
    expect(report.overall.n).toBe(1)
    const coverage = report.rows.filter((x) => x.inside_interval).length / report.rows.length
    expect(report.overall.intervalCoverage).toBeCloseTo(coverage, 5)
  })

  it('est déterministe à données identiques', () => {
    const a = runRealBacktest([baseCase()], { now: new Date('2026-07-16T00:00:00Z') })
    const b = runRealBacktest([baseCase()], { now: new Date('2026-07-16T00:00:00Z') })
    expect(a.rows).toEqual(b.rows)
    expect(a.overall).toEqual(b.overall)
  })

  it('n’écrit AUCUN nom, UUID brut ni coordonnée dans les artefacts', () => {
    const report = runRealBacktest([baseCase()], { now: new Date('2026-07-16T00:00:00Z') })
    const json = JSON.stringify(report)
    expect(json).not.toContain(RACE_USER)
    expect(json).not.toContain(RACE_NAME)
    expect(json).not.toContain('race-1')
    expect(json).not.toContain('47.0') // aucune latitude
    // Les ids sont bien pseudonymisés.
    expect(report.rows[0].athlete_id).toMatch(/^A\d+$/)
    expect(report.rows[0].race_id).toMatch(/^R\d+$/)
  })

  it('une course sans GPS est exclue proprement avec une raison', () => {
    const noGps: RaceCaseInput = { ...baseCase(), raceStreams: { latlng: { data: [] } } }
    const report = runRealBacktest([noGps], { now: new Date('2026-07-16T00:00:00Z') })
    expect(report.counts.tested).toBe(0)
    expect(report.excluded).toHaveLength(1)
    expect(report.excluded[0].exclusion_reason).toBe('no_latlng')
    expect(report.excluded[0].athlete_id).toMatch(/^A\d+$/)
  })

  it('projectRaceCase expose used_fallback quand aucun bucket profil', () => {
    const out = projectRaceCase(baseCase())
    expect(out.row?.used_fallback).toBe(true) // priorStreams vide → pas de bucket
    expect(out.row?.profile_quality).toBe('none')
  })

  it('shortHash est stable et non nominatif', () => {
    expect(shortHash(RACE_USER)).toBe(shortHash(RACE_USER))
    expect(shortHash(RACE_USER)).not.toContain('user')
  })
})
