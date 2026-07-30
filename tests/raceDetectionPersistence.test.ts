import { describe, it, expect } from 'vitest'
import {
  buildRaceDetectionRows,
  changedRows,
  summarizeRaceDetection,
  RACE_DETECTION_VERSION,
  type DetectionActivity,
} from '../src/lib/raceDetectionPersistence'
import { isEligiblePersonalCalibrationRace } from '../src/lib/engineHistory'
import { buildHrPercentileLookup } from '../src/lib/raceDetection'

// Le verdict PERSISTÉ doit être exactement celui que le moteur calcule en mémoire —
// sinon la base raconterait une autre histoire que les projections servies aux athlètes.
// Les cas ci-dessous reproduisent la situation réelle de la base : un historique où
// personne n'a coché « course » sur Strava.

/** Historique de footings : donne une distribution de FC (≥ 10 valeurs requises). */
function footings(count: number): DetectionActivity[] {
  return Array.from({ length: count }, (_, i) => ({
    strava_activity_id: 1000 + i,
    name: 'Course à pied le matin',
    sport_type: 'Run',
    type: 'Run',
    start_date: `2026-0${(i % 6) + 1}-10T07:00:00Z`,
    distance: 10_000,
    moving_time: 3300,
    elapsed_time: 3360,
    average_heartrate: 130 + i, // 130…, la course sera au-dessus
  }))
}

const marathon: DetectionActivity = {
  strava_activity_id: 42,
  name: 'Marathon de Nantes',
  sport_type: 'Run',
  type: 'Run',
  start_date: '2026-04-26T08:00:00Z',
  distance: 42_195,
  moving_time: 12_600, // 2 h 59 min 3:00/km
  elapsed_time: 12_640, // 0,3 % d'arrêt
  average_heartrate: 178, // au sommet de sa distribution
  is_race: null,
}

describe('persistance du verdict de détection de course', () => {
  it('qualifie une compétition JAMAIS étiquetée par l’athlète', () => {
    const history = [...footings(20), marathon]
    const rows = buildRaceDetectionRows([marathon], history)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('confirmed')
    expect(rows[0].labeled).toBe(false) // le gain réel : aucune étiquette Strava
    expect(rows[0].version).toBe(RACE_DETECTION_VERSION)
  })

  it('ne confirme pas un footing, même avec un historique fourni', () => {
    const history = footings(20)
    const rows = buildRaceDetectionRows(history, history)
    expect(rows.every((r) => r.status !== 'confirmed')).toBe(true)
  })

  it('donne EXACTEMENT le verdict que le moteur calcule en mémoire', () => {
    const history = [...footings(20), marathon]
    const hrPercentileOf = buildHrPercentileLookup(
      history.map((a) => ({ averageHeartrate: a.average_heartrate })),
    )
    const rows = buildRaceDetectionRows(history, history)
    for (const [i, a] of history.entries()) {
      const moteur = isEligiblePersonalCalibrationRace(
        {
          name: a.name, type: a.type, sport_type: a.sport_type, start_date: a.start_date,
          distance: a.distance, moving_time: a.moving_time, elapsed_time: a.elapsed_time,
          is_race: a.is_race, raw_data: a.raw_data, deleted_at: a.deleted_at,
        },
        hrPercentileOf(a.average_heartrate),
      )
      expect(rows[i].status === 'confirmed', `activité ${a.strava_activity_id}`).toBe(moteur)
    }
  })

  it('s’abstient sans cardio exploitable (jamais de course inventée)', () => {
    const sansFc = [{ ...marathon, average_heartrate: null }]
    const rows = buildRaceDetectionRows(sansFc, sansFc)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].reasons).toContain('not_labeled_race')
  })

  it('n’écrit rien quand le verdict et la règle sont inchangés (job réexécutable)', () => {
    const history = [...footings(20), marathon]
    const rows = buildRaceDetectionRows(history, history)
    const dejaEnBase = history.map((a, i) => ({
      ...a,
      race_detection_status: rows[i].status,
      race_detection_version: RACE_DETECTION_VERSION,
    }))
    expect(changedRows(dejaEnBase, rows)).toEqual([])
  })

  it('réécrit tout quand la RÈGLE change (re-qualification d’une version antérieure)', () => {
    const history = [...footings(20), marathon]
    const rows = buildRaceDetectionRows(history, history)
    const ancienneRegle = history.map((a, i) => ({
      ...a,
      race_detection_status: rows[i].status,
      race_detection_version: '2026.07-10+ancienne',
    }))
    expect(changedRows(ancienneRegle, rows)).toHaveLength(rows.length)
  })

  it('résume le lot sans exposer la moindre donnée personnelle', () => {
    const history = [...footings(20), marathon]
    const summary = summarizeRaceDetection(buildRaceDetectionRows(history, history))
    expect(summary.analysed).toBe(21)
    expect(summary.confirmed).toBe(1)
    expect(summary.confirmedUnlabeled).toBe(1)
    expect(summary.labeled).toBe(0)
    expect(Object.values(summary).every((v) => typeof v === 'number')).toBe(true)
  })
})
