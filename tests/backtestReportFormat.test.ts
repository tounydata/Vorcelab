import { describe, it, expect } from 'vitest'
import { runRealBacktest, type BacktestActivity, type RaceCaseInput } from '../src/lib/realBacktest'
import { toResultsCsv, toReportMarkdown, toSummaryJson, fmtHms } from '../src/lib/backtestReportFormat'

const USER = 'user-uuid-secret-9999'
const NAME = 'Trail des collines nominatif'

function streams() {
  const latlng: [number, number][] = []
  const altitude: number[] = []
  for (let i = 0; i < 80; i++) { latlng.push([46.5, 6.6 + i * 0.001]); altitude.push(100 + Math.sin(i / 5) * 30) }
  return { latlng: { data: latlng }, altitude: { data: altitude }, heartrate: { data: latlng.map(() => 160) } }
}

const race: BacktestActivity = {
  id: 'raceX', user_id: USER, strava_activity_id: 'raceX', name: NAME,
  type: 'Run', sport_type: 'TrailRun', start_date: '2026-07-04T18:00:00Z',
  distance: 6000, moving_time: 2400, elapsed_time: 2410, total_elevation_gain: 200,
  average_speed: 2.5, average_heartrate: 165, max_heartrate: 190, is_race: true, workout_type: null,
}
const priors: BacktestActivity[] = [1, 2, 3].map((i) => ({
  id: `p${i}`, user_id: USER, strava_activity_id: `p${i}`, name: 'Sortie',
  type: 'Run', sport_type: 'TrailRun', start_date: `2026-06-0${i}T08:00:00Z`,
  distance: 12000, moving_time: 4000, elapsed_time: 4000, total_elevation_gain: 300,
  average_speed: 3.0, average_heartrate: 155, max_heartrate: 188, is_race: false, workout_type: 0,
}))

const c: RaceCaseInput = {
  race, raceStreams: streams(), allActivities: [race, ...priors], priorStreams: {}, fcMax: 190, hasWeather: true,
}

describe('backtestReportFormat', () => {
  const report = runRealBacktest([c], { now: new Date('2026-07-16T00:00:00Z') })

  it('fmtHms formate correctement', () => {
    expect(fmtHms(90)).toBe('1:30')
    expect(fmtHms(3661)).toBe('1h01:01')
    expect(fmtHms(-125)).toBe('-2:05')
  })

  it('CSV : en-tête + une ligne par course testée, sans PII', () => {
    const csv = toResultsCsv(report)
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('race_id,athlete_id')
    expect(lines).toHaveLength(1 + report.rows.length)
    expect(csv).not.toContain(USER)
    expect(csv).not.toContain(NAME)
    expect(csv).not.toContain('46.5')
  })

  it('Markdown : métriques elapsed + moving + analyse par groupes (pas hors échantillon), sans PII', () => {
    const md = toReportMarkdown(report)
    expect(md).toContain('temps écoulé')
    expect(md).toContain('temps en mouvement')
    // Le faux « leave-one-out » est renommé « analyse d'erreur par groupes ».
    expect(md).toContain('Analyse d’erreur par groupes')
    expect(md).toContain('is_true_out_of_sample')
    expect(md).toContain('Contrôle du dénivelé')
    expect(md).toContain('MAPE')
    // Fenêtres + volume six mois exposés.
    expect(md).toContain('engine_history_days')
    expect(md).toContain('runner_profile_window_days')
    expect(md).not.toContain(USER)
    expect(md).not.toContain(NAME)
    expect(md).not.toContain('46.5')
  })

  it('summary.json : JSON valide et pseudonymisé', () => {
    const parsed = JSON.parse(toSummaryJson(report))
    expect(parsed.counts.tested).toBe(report.counts.tested)
    expect(toSummaryJson(report)).not.toContain(USER)
  })
})
