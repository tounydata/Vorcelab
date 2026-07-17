import { describe, it, expect } from 'vitest'
import {
  projectRaceCase,
  selectPriorActivities,
  type BacktestActivity,
  type RaceCaseInput,
} from '../src/lib/realBacktest'
import { selectEngineHistoryAtDate, type EngineActivity } from '../src/lib/engineHistory'

const USER = 'user-parity-1'
const DAY = 86_400_000
const RACE_START = '2026-06-01T08:00:00Z'
const raceStartMs = Date.parse(RACE_START)

function run(id: string, daysAgo: number, extra: Partial<BacktestActivity> = {}): BacktestActivity {
  return {
    id, user_id: USER, strava_activity_id: id, name: 'Footing',
    type: 'Run', sport_type: 'Run',
    start_date: new Date(raceStartMs - daysAgo * DAY).toISOString(),
    distance: 10000, moving_time: 3000, elapsed_time: 3010, total_elevation_gain: 120,
    average_speed: 3.33, average_heartrate: 150, max_heartrate: 185, is_race: false, workout_type: 0,
    ...extra,
  }
}

// Trace trail bruitée : vraies bosses + bruit altimétrique → D+ brut ≠ D+ Strava.
function hillyTrailStreams() {
  const latlng: [number, number][] = []
  const altitude: number[] = []
  for (let i = 0; i < 200; i++) {
    latlng.push([45.0, 6.0 + i * 0.0009])
    const hill = 300 * Math.sin(i / 20)
    const noise = (i % 2 === 0 ? 1 : -1) * 3 // bruit ±3 m
    altitude.push(1000 + hill + noise)
  }
  return { latlng: { data: latlng }, altitude: { data: altitude }, heartrate: { data: latlng.map(() => 155) } }
}

const race: BacktestActivity = run('race', 0, {
  strava_activity_id: 'race', name: 'Trail parité', type: 'TrailRun', sport_type: 'TrailRun',
  // D+ Strava post-course DÉLIBÉRÉMENT éloigné du D+ GPX brut → force un recalage visible
  // en mode diagnostic, et démontre que la métrique principale (gpx_only) ne s'y aligne pas.
  distance: 20000, moving_time: 9000, elapsed_time: 9200, total_elevation_gain: 1600,
})

const priors = [run('p1', 5), run('p2', 40), run('p3', 100), run('old', 300)]

describe('parité production / benchmark — sélection identique (section 7)', () => {
  it('9. selectPriorActivities == fenêtre production (selectEngineHistoryAtDate) moins la course', () => {
    const all = [race, ...priors]
    const bench = selectPriorActivities(all, race).map((a) => a.id).sort()
    const prod = selectEngineHistoryAtDate({
      activities: all as unknown as EngineActivity[],
      userId: USER,
      asOfMs: raceStartMs,
    })
      .filter((a) => String(a.strava_activity_id) !== String(race.strava_activity_id))
      .map((a) => a.id)
      .sort()
    expect(bench).toEqual(prod)
    // La très ancienne (300 j) est hors des six mois.
    expect(bench).not.toContain('old')
    expect(bench).toEqual(['p1', 'p2', 'p3'])
  })
})

function baseCase(overrides: Partial<RaceCaseInput> = {}): RaceCaseInput {
  return {
    race,
    raceStreams: hillyTrailStreams(),
    allActivities: [race, ...priors],
    priorStreams: {},
    fcMax: 185,
    hasWeather: false,
    ...overrides,
  }
}

describe('modes de référence altimétrique (section 22)', () => {
  it('1. mode par défaut = gpx_only (parité production)', () => {
    const out = projectRaceCase(baseCase(), '2026-07-16T00:00:00Z')
    expect(out.row?.elevation_reference_mode).toBe('gpx_only')
    // Le D+ alimentant le moteur EST le D+ gpx_only (lissage seul, aucun recalage).
    expect(out.row?.smoothed_gpx_dplus_m).toBe(out.row?.gpx_only_dplus_m)
  })

  it('2/4. sans D+ officiel, aucun recalage post-course sur la métrique principale', () => {
    const out = projectRaceCase(baseCase({ officialDplusM: null }), '2026-07-16T00:00:00Z')
    // Le D+ Strava post-course est capturé pour DIAGNOSTIC…
    expect(out.row?.post_race_strava_dplus_m).toBe(1600)
    // …mais n'alimente PAS le moteur : le D+ utilisé reste gpx_only.
    expect(out.row?.smoothed_gpx_dplus_m).toBe(out.row?.gpx_only_dplus_m)
    expect(out.row?.dplus_was_calibrated).toBe(false)
  })

  it('3. un D+ officiel connu avant la course peut être utilisé', () => {
    const out = projectRaceCase(baseCase({ elevationReferenceMode: 'official_course_dplus', officialDplusM: 850 }), '2026-07-16T00:00:00Z')
    expect(out.row?.elevation_reference_mode).toBe('official_course_dplus')
    expect(out.row?.official_dplus_m).toBe(850)
  })

  it('le mode post_race_strava recale (diagnostic) → D+ différent de gpx_only', () => {
    const gpxOnly = projectRaceCase(baseCase(), '2026-07-16T00:00:00Z')
    const postRace = projectRaceCase(baseCase({ elevationReferenceMode: 'post_race_strava_dplus' }), '2026-07-16T00:00:00Z')
    // gpx_only ne recale jamais ; le diagnostic post-course, lui, recale vers le D+ Strava.
    expect(gpxOnly.row?.dplus_was_calibrated).toBe(false)
    expect(postRace.row?.dplus_was_calibrated).toBe(true)
    expect(postRace.row?.smoothed_gpx_dplus_m).not.toBe(gpxOnly.row?.smoothed_gpx_dplus_m)
    // Le post-course se rapproche du D+ Strava (1600), gpx_only reste sur le GPX.
    expect(Math.abs((postRace.row?.smoothed_gpx_dplus_m ?? 0) - 1600))
      .toBeLessThan(Math.abs((gpxOnly.row?.smoothed_gpx_dplus_m ?? 0) - 1600))
  })

  it('5. la distance ne change jamais selon le mode', () => {
    const gpxOnly = projectRaceCase(baseCase(), '2026-07-16T00:00:00Z')
    const official = projectRaceCase(baseCase({ elevationReferenceMode: 'official_course_dplus', officialDplusM: 850 }), '2026-07-16T00:00:00Z')
    expect(official.row?.distance_km).toBe(gpxOnly.row?.distance_km)
  })

  it('10. déterministe pour un même asOf (même mode → même D+)', () => {
    const a = projectRaceCase(baseCase(), '2026-07-16T00:00:00Z')
    const b = projectRaceCase(baseCase(), '2026-07-16T00:00:00Z')
    expect(a.row?.smoothed_gpx_dplus_m).toBe(b.row?.smoothed_gpx_dplus_m)
    expect(a.row?.predicted_s).toBe(b.row?.predicted_s)
  })
})
