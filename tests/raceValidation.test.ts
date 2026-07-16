import { describe, it, expect } from 'vitest'
import { validateRaceCandidate, MIN_RACE_DISTANCE_M, type RaceCandidateInput } from '../src/lib/raceValidation'

const base: RaceCandidateInput = {
  name: 'Trail des collines',
  sportType: 'TrailRun',
  type: 'Run',
  startDate: '2026-07-04T18:00:00Z',
  distanceM: 22663,
  movingTimeS: 7196,
  elapsedTimeS: 7209,
  totalElevationGainM: 537,
  isRace: true,
  workoutType: null,
  deletedAt: null,
}

describe('validateRaceCandidate — règles prudentes', () => {
  it('une vraie course > 3 km cohérente et étiquetée → confirmed', () => {
    const v = validateRaceCandidate(base)
    expect(v.status).toBe('confirmed')
    expect(v.reasons).toEqual([])
  })

  it('« Échauffement » n’est jamais confirmé automatiquement (rejected)', () => {
    const v = validateRaceCandidate({ ...base, name: 'Échauffement ', workoutType: '1', isRace: false })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('name_not_a_race')
  })

  it('« Décrassage » n’est jamais confirmé automatiquement (rejected)', () => {
    const v = validateRaceCandidate({ ...base, name: 'Décrassage ', workoutType: '1', isRace: false })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('name_not_a_race')
  })

  it('distance < 3 km → rejected', () => {
    const v = validateRaceCandidate({ ...base, distanceM: MIN_RACE_DISTANCE_M - 1 })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('distance_too_short')
  })

  it('temps réel absent → rejected', () => {
    const v = validateRaceCandidate({ ...base, movingTimeS: 0 })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('no_real_time')
  })

  it('date invalide → rejected', () => {
    const v = validateRaceCandidate({ ...base, startDate: 'pas-une-date' })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('invalid_date')
  })

  it('activité supprimée → rejected', () => {
    const v = validateRaceCandidate({ ...base, deletedAt: '2026-07-05T00:00:00Z' })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('deleted')
  })

  it('sport non course (Ride) → rejected', () => {
    const v = validateRaceCandidate({ ...base, sportType: 'Ride', type: 'Ride' })
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('sport_not_run')
  })

  it('vitesse impossible (> 7.5 m/s) → rejected', () => {
    const v = validateRaceCandidate({ ...base, distanceM: 10000, movingTimeS: 1000 }) // 10 m/s
    expect(v.status).toBe('rejected')
    expect(v.reasons).toContain('incoherent_speed')
  })

  it('nom « temps à confirmer » → pending (jamais confirmé)', () => {
    const v = validateRaceCandidate({ ...base, name: 'BUX run temps a confirmée ' })
    expect(v.status).toBe('pending')
    expect(v.reasons).toContain('time_to_confirm')
  })

  it('non étiquetée course → pending', () => {
    const v = validateRaceCandidate({ ...base, isRace: false, workoutType: 0 })
    expect(v.status).toBe('pending')
    expect(v.reasons).toContain('not_labeled_race')
  })

  it('écart moving/elapsed important → pending (large_stops)', () => {
    const v = validateRaceCandidate({ ...base, movingTimeS: 3562, elapsedTimeS: 4359 })
    expect(v.status).toBe('pending')
    expect(v.reasons).toContain('large_stops')
  })
})
