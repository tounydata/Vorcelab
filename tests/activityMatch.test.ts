import { describe, it, expect } from 'vitest'
import { matchCandidates, type MatchableActivity } from '../src/lib/coach/activityMatch'

// Semaine du lundi 2026-06-01 (au dimanche 2026-06-07).
const WEEK = '2026-06-01'

function run(date: string, min: number, sport = 'Run'): MatchableActivity {
  return { start_date: date, sport_type: sport, moving_time: min * 60, distance: min * 200 }
}

describe('matchCandidates', () => {
  it('ne retient que la course à pied dans la semaine lundi→dimanche', () => {
    const acts = [
      run('2026-06-03T10:00:00Z', 60),                 // mercredi, dans la semaine
      run('2026-06-09T10:00:00Z', 60),                 // semaine suivante → exclue
      { start_date: '2026-06-04T10:00:00Z', sport_type: 'Ride', moving_time: 3600 }, // vélo → exclu
    ]
    const c = matchCandidates(WEEK, 3, 60, acts)
    expect(c).toHaveLength(1)
    expect(c[0].dayOfWeek).toBe(3)
  })

  it('classe en tête l\'activité la plus proche du jour prévu', () => {
    const acts = [
      run('2026-06-06T10:00:00Z', 60), // samedi
      run('2026-06-04T10:00:00Z', 60), // jeudi (jour prévu)
    ]
    const c = matchCandidates(WEEK, 4, 60, acts)
    expect(c[0].dayOfWeek).toBe(4) // jeudi en premier
    expect(c[0].score).toBeGreaterThan(c[1].score)
  })

  it('pénalise une durée très éloignée de l\'attendu', () => {
    const acts = [
      run('2026-06-04T10:00:00Z', 60),  // pile la durée attendue
      run('2026-06-04T12:00:00Z', 20),  // bien trop courte
    ]
    const c = matchCandidates(WEEK, 4, 60, acts)
    expect(c[0].activity.moving_time).toBe(3600)
  })

  it('renvoie une liste vide si aucune activité ne tombe dans la semaine', () => {
    expect(matchCandidates(WEEK, 4, 60, [run('2026-05-01T10:00:00Z', 60)])).toEqual([])
  })
})
