import { describe, it, expect } from 'vitest'
import { buildRenfoRows, isRenfo, type StravaActLite } from '../src/lib/renfoBackfill'

const U = 'user-1'

describe('isRenfo', () => {
  it('reconnaît muscu / yoga / pilates / workout par type ou sport_type', () => {
    expect(isRenfo('WeightTraining', 'WeightTraining')).toBe(true)
    expect(isRenfo('Workout', 'Pilates')).toBe(true)
    expect(isRenfo('Workout', 'Yoga')).toBe(true)
    expect(isRenfo('Run', 'TrailRun')).toBe(false)
  })
})

describe('buildRenfoRows — déduplication par (date + focus)', () => {
  it('importe un pilates Strava le même jour qu’un renfo manuel d’un AUTRE type', () => {
    // Cas réel : 3 juin = haut_corps manuel (40 min) + pilates Strava (le soir).
    const acts: StravaActLite[] = [
      { type: 'Workout', sport_type: 'Pilates', start_date_local: '2026-06-03 19:41:45', moving_time: 1562 },
    ]
    const existing = [{ session_date: '2026-06-03', focus: 'haut_corps' }]
    const rows = buildRenfoRows(U, acts, existing)
    expect(rows).toHaveLength(1)
    // Pilates retiré du catalogue → une activité Pilates Strava est classée « mobilité ».
    expect(rows[0]).toMatchObject({ session_date: '2026-06-03', focus: 'mobilite', source: 'strava' })
    expect(rows[0].duration_min).toBe(26)
  })

  it('ne ré-importe pas un doublon exact (même date + même focus)', () => {
    const acts: StravaActLite[] = [
      { type: 'Workout', sport_type: 'Pilates', start_date_local: '2026-06-03 19:41:45', moving_time: 1500 },
    ]
    const existing = [{ session_date: '2026-06-03', focus: 'mobilite' }]
    expect(buildRenfoRows(U, acts, existing)).toHaveLength(0)
  })

  it('idempotent : deux passes ne créent pas de doublon', () => {
    const acts: StravaActLite[] = [
      { type: 'WeightTraining', sport_type: 'WeightTraining', start_date_local: '2026-05-31 13:51:20', moving_time: 1214 },
    ]
    const first = buildRenfoRows(U, acts, [])
    expect(first).toHaveLength(1)
    // la 2e passe voit la ligne déjà insérée → rien à faire
    const second = buildRenfoRows(U, acts, first.map((r) => ({ session_date: r.session_date, focus: r.focus })))
    expect(second).toHaveLength(0)
  })

  it('déduit yoga / pilates depuis le sport_type', () => {
    const acts: StravaActLite[] = [
      { type: 'Yoga', sport_type: 'Yoga', start_date_local: '2026-05-20 08:00:00', moving_time: 1800 },
    ]
    expect(buildRenfoRows(U, acts, [])[0].focus).toBe('yoga_coureur')
  })

  it('ignore les activités non-renfo (course)', () => {
    const acts: StravaActLite[] = [
      { type: 'Run', sport_type: 'TrailRun', start_date_local: '2026-05-20 08:00:00', moving_time: 3600 },
    ]
    expect(buildRenfoRows(U, acts, [])).toHaveLength(0)
  })
})
