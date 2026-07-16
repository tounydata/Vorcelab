import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  runRealBacktest, projectRaceCase, foldsByKey, oosKeyFn,
  type BacktestActivity, type RaceCaseInput,
} from '../src/lib/realBacktest'

const DAY = 86_400_000
const U1 = 'athlete-uuid-1111'

// Tracé plat route ~5 km, bruité (pour exercer le lissage altimétrique).
function noisyRoadStreams() {
  const latlng: [number, number][] = []
  const altitude: number[] = []
  for (let i = 0; i < 500; i++) {
    latlng.push([47.0, 7.0 + i * 0.00006]) // ~5 m/point
    altitude.push(100 + Math.sin(i * 12.9898) * 1.5) // ±1.5 m de bruit
  }
  return { latlng: { data: latlng }, altitude: { data: altitude }, heartrate: { data: latlng.map(() => 150) } }
}

function prior(user: string, id: string, daysBefore: number, maxHr: number | null): BacktestActivity {
  return {
    id, user_id: user, strava_activity_id: id, name: 'Sortie',
    type: 'Run', sport_type: 'Run', start_date: new Date(Date.parse('2026-07-04T08:00:00Z') - daysBefore * DAY).toISOString(),
    distance: 10000, moving_time: 3000, elapsed_time: 3000, total_elevation_gain: 20,
    average_speed: 3.33, average_heartrate: 150, max_heartrate: maxHr, is_race: false, workout_type: 0,
  }
}

function race(user: string, id: string, dateISO: string, storedDplus = 60): BacktestActivity {
  return {
    id, user_id: user, strava_activity_id: id, name: 'Course',
    type: 'Run', sport_type: 'Run', start_date: dateISO,
    distance: 5000, moving_time: 1500, elapsed_time: 1700, total_elevation_gain: storedDplus,
    average_speed: 3.33, average_heartrate: 165, max_heartrate: 190, is_race: false, workout_type: 1,
  }
}

function caseFor(r: BacktestActivity, priors: BacktestActivity[], over: Partial<RaceCaseInput> = {}): RaceCaseInput {
  return {
    race: r, raceStreams: noisyRoadStreams(), allActivities: [r, ...priors],
    priorStreams: {}, fcMax: null, hasWeather: false, ...over,
  }
}

afterEach(() => vi.useRealTimers())

describe('FC max — cascade de sources (banc en lecture seule)', () => {
  const priorsHr = [prior(U1, 'p1', 10, 185), prior(U1, 'p2', 20, 184)]
  const priorsNoHr = [prior(U1, 'q1', 10, null), prior(U1, 'q2', 20, null)]

  it('5-6. FC max utilisateur prioritaire → source `user`', () => {
    const out = projectRaceCase(caseFor(race(U1, 'r1', '2026-07-04T08:00:00Z'), priorsHr, { fcMax: 188 }))
    expect(out.row?.fcmax_source).toBe('user')
  })

  it('6. FC max Strava d’époque en second → source `strava`', () => {
    const out = projectRaceCase(caseFor(race(U1, 'r2', '2026-07-04T08:00:00Z'), priorsHr, { fcMax: null }))
    expect(out.row?.fcmax_source).toBe('strava')
  })

  it('7. 220 − âge en troisième → source `age_formula`', () => {
    const out = projectRaceCase(caseFor(race(U1, 'r3', '2026-07-04T08:00:00Z'), priorsNoHr, { fcMax: null, athleteAge: 30 }))
    expect(out.row?.fcmax_source).toBe('age_formula')
  })

  it('8. repère fixe en dernier recours → source `fixed_fallback`', () => {
    const out = projectRaceCase(caseFor(race(U1, 'r4', '2026-07-04T08:00:00Z'), priorsNoHr, { fcMax: null, athleteAge: null }))
    expect(out.row?.fcmax_source).toBe('fixed_fallback')
  })
})

describe('Anti-fuite + lecture seule', () => {
  it('3. aucune activité future n’est utilisée (postérieures exclues)', () => {
    const r = race(U1, 'r', '2026-07-04T08:00:00Z')
    const future = prior(U1, 'fut', -10, 185) // 10 j APRÈS la course
    const out = projectRaceCase(caseFor(r, [prior(U1, 'p', 10, 185), future]))
    // 1 seule activité antérieure comptée (la future est écartée).
    expect(out.row?.activities_before_count).toBe(1)
  })

  it('9/15. projectRaceCase ne mute NI les activités NI le profil (lecture seule)', () => {
    const r = race(U1, 'r', '2026-07-04T08:00:00Z')
    const priors = [prior(U1, 'p', 10, 185)]
    const snapshot = JSON.stringify([r, ...priors])
    projectRaceCase(caseFor(r, priors))
    expect(JSON.stringify([r, ...priors])).toBe(snapshot) // entrées inchangées
  })
})

describe('Dénivelé lissé + colonnes temps', () => {
  const r = race(U1, 'r', '2026-07-04T08:00:00Z', 60)
  const out = projectRaceCase(caseFor(r, [prior(U1, 'p', 10, 185)]))

  it('10. le traitement altimétrique écrase le bruit (brut ≫ lissé)', () => {
    expect(out.row!.raw_gpx_dplus_m).toBeGreaterThan(out.row!.smoothed_gpx_dplus_m)
    expect(out.row!.stored_dplus_m).toBe(60)
  })

  it('13. elapsed_time ET moving_time tous deux présents', () => {
    expect(out.row!.actual_moving_s).toBe(1500)
    expect(out.row!.actual_elapsed_s).toBe(1700)
    expect(out.row!.error_vs_moving_s).toBeTypeOf('number')
    expect(out.row!.error_vs_elapsed_s).toBeTypeOf('number')
    expect(out.row!.stop_gap_s).toBe(200)
  })

  it('10. traitement altimétrique déterministe', () => {
    const a = projectRaceCase(caseFor(race(U1, 'x', '2026-07-04T08:00:00Z', 60), [prior(U1, 'p', 10, 185)]))
    const b = projectRaceCase(caseFor(race(U1, 'x', '2026-07-04T08:00:00Z', 60), [prior(U1, 'p', 10, 185)]))
    expect(a.row!.smoothed_gpx_dplus_m).toBe(b.row!.smoothed_gpx_dplus_m)
    expect(a.row!.dplus_calibration_ratio).toBe(b.row!.dplus_calibration_ratio)
  })
})

describe('Leave-one-date-out — groupes jamais scindés', () => {
  it('14. trois courses de la même date restent dans le même fold', () => {
    const cases = [
      caseFor(race(U1, 'a', '2026-07-04T09:00:00Z'), [prior(U1, 'pa', 10, 185)]),
      caseFor(race(U1, 'b', '2026-07-04T14:00:00Z'), [prior(U1, 'pb', 12, 185)]),
      caseFor(race(U1, 'c', '2026-07-04T18:00:00Z'), [prior(U1, 'pc', 15, 185)]),
    ]
    const report = runRealBacktest(cases, { now: new Date('2026-07-16T00:00:00Z') })
    const folds = foldsByKey(report.rows, oosKeyFn('leave_one_date_out'))
    expect(folds.size).toBe(1) // une seule date → un seul fold
    expect(folds.get('2026-07-04')!.length).toBe(3)
    expect(report.leaveOneDateOut.folds).toBe(1)
  })
})

describe('Déterminisme du banc (horloge système ≠ résultat)', () => {
  it('6/15. deux exécutions à des dates système différentes → mêmes projections', () => {
    const mk = () => caseFor(race(U1, 'r', '2026-07-04T08:00:00Z'), [prior(U1, 'p1', 10, 185), prior(U1, 'p2', 20, 184)])
    vi.useFakeTimers().setSystemTime(new Date('2026-07-10T00:00:00Z'))
    const a = runRealBacktest([mk()], { now: new Date('2026-07-16T00:00:00Z') })
    vi.setSystemTime(new Date('2027-02-01T00:00:00Z'))
    const b = runRealBacktest([mk()], { now: new Date('2026-07-16T00:00:00Z') })
    expect(a.rows).toEqual(b.rows)
    // as_of_at = départ de la course (historique) ; computed_at = exécution du banc.
    expect(a.rows[0].as_of_at).toBe('2026-07-04T08:00:00.000Z')
    expect(a.rows[0].computed_at).toBe('2026-07-16T00:00:00.000Z')
  })
})

describe('Rapport — elapsed principal + hors échantillon + qualité', () => {
  const report = runRealBacktest([
    caseFor(race(U1, 'a', '2026-07-04T09:00:00Z'), [prior(U1, 'pa', 10, 185)]),
    caseFor(race('athlete-2', 'b', '2026-05-10T09:00:00Z'), [prior('athlete-2', 'pb', 12, 185)]),
  ], { now: new Date('2026-07-16T00:00:00Z') })

  it('expose métriques elapsed, moving, OOS et qualité de données', () => {
    expect(report.overallElapsed.n).toBe(2)
    expect(report.overallMoving.n).toBe(2)
    expect(report.leaveOneAthleteOut.folds).toBe(2)
    expect(report.leaveOneDateOut.folds).toBe(2)
    expect(report.coverageVsElapsed).not.toBeUndefined()
    expect(report.sample.distinctEvents).toBe(2)
    expect(['poor', 'partial', 'good']).toContain(report.rows[0].historical_data_quality)
    expect(report.byFcMaxSource).toBeDefined()
  })
})
