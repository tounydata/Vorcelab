import { describe, it, expect } from 'vitest'
import {
  buildRunnerProfileAtDate,
  activitiesInWindowBefore,
  type ProfileActivityAtDate,
  type RawStreamSet,
} from '../src/lib/runnerProfileAtDate'

// ── Générateur de stream synthétique déterministe (montée puis plat) ───────────
function synthClimbFlatStream(): RawStreamSet {
  const time: number[] = [], altitude: number[] = [], velocity: number[] = [], heartrate: number[] = [], distance: number[] = []
  const speed = 3 // m/s
  let dist = 0, alt = 100
  // 300 s de montée ~10 % (mod_up), 300 s de plat
  for (let t = 0; t <= 600; t++) {
    time.push(t)
    velocity.push(speed)
    distance.push(dist)
    altitude.push(alt)
    heartrate.push(t < 300 ? 160 : 140)
    dist += speed
    alt += t < 300 ? speed * 0.10 : 0 // 10 % de pente en montée
  }
  return {
    time: { data: time }, altitude: { data: altitude }, velocity_smooth: { data: velocity },
    heartrate: { data: heartrate }, distance: { data: distance },
  }
}

const RACE_START = '2026-05-01T08:00:00Z'

function actAt(id: string, startDate: string): ProfileActivityAtDate {
  return { id, strava_activity_id: id, start_date: startDate, moving_time: 600, sport_type: 'TrailRun', type: 'Run' }
}

describe('activitiesInWindowBefore — anti-fuite temporelle', () => {
  const acts: ProfileActivityAtDate[] = [
    actAt('a1', '2026-04-20T08:00:00Z'), // dans la fenêtre, avant
    actAt('a2', '2026-05-01T07:59:59Z'), // même jour, AVANT le départ → gardé
    actAt('a3', '2026-05-01T08:00:00Z'), // = départ (la course elle-même) → exclu
    actAt('a4', '2026-05-01T09:00:00Z'), // même jour, APRÈS le départ → exclu
    actAt('a5', '2026-06-01T08:00:00Z'), // après → exclu
    actAt('a6', '2026-01-01T08:00:00Z'), // hors fenêtre 56 j → exclu
  ]

  it('ne garde que les activités strictement antérieures et dans la fenêtre', () => {
    const kept = activitiesInWindowBefore(acts, RACE_START, 56).map((a) => a.id)
    expect(kept).toEqual(['a1', 'a2'])
  })

  it('une activité au même instant que le départ (la course) est exclue', () => {
    const kept = activitiesInWindowBefore(acts, RACE_START, 56).map((a) => a.id)
    expect(kept).not.toContain('a3')
  })

  it('une activité le jour de la course mais après le départ est exclue', () => {
    const kept = activitiesInWindowBefore(acts, RACE_START, 56).map((a) => a.id)
    expect(kept).not.toContain('a4')
  })
})

describe('buildRunnerProfileAtDate — profil sans fuite', () => {
  it('construit des buckets depuis un stream antérieur', () => {
    const profile = buildRunnerProfileAtDate({
      activities: [actAt('prev', '2026-04-20T08:00:00Z')],
      activityStreams: { prev: synthClimbFlatStream() },
      fcMax: 190,
      asOfDate: RACE_START,
      windowDays: 56,
    })
    expect(profile.analyzedRuns).toBe(1)
    // Le stream contient de la montée et du plat → au moins un bucket appris.
    expect(Object.keys(profile.buckets).length).toBeGreaterThan(0)
    expect(profile.buckets.flat?.avgSpeedKmH).toBeGreaterThan(0)
  })

  it('une activité postérieure à la course n’est JAMAIS utilisée', () => {
    const withFuture = buildRunnerProfileAtDate({
      activities: [actAt('prev', '2026-04-20T08:00:00Z'), actAt('future', '2026-05-10T08:00:00Z')],
      activityStreams: { prev: synthClimbFlatStream(), future: synthClimbFlatStream() },
      fcMax: 190, asOfDate: RACE_START, windowDays: 56,
    })
    const onlyPast = buildRunnerProfileAtDate({
      activities: [actAt('prev', '2026-04-20T08:00:00Z')],
      activityStreams: { prev: synthClimbFlatStream() },
      fcMax: 190, asOfDate: RACE_START, windowDays: 56,
    })
    expect(withFuture.analyzedRuns).toBe(1)
    // Résultat identique avec ou sans l'activité future → aucune fuite.
    expect(withFuture).toEqual(onlyPast)
  })

  it('la course elle-même (même start_date) est exclue du profil', () => {
    const profile = buildRunnerProfileAtDate({
      activities: [actAt('theRace', RACE_START)],
      activityStreams: { theRace: synthClimbFlatStream() },
      fcMax: 190, asOfDate: RACE_START, windowDays: 56,
    })
    expect(profile.analyzedRuns).toBe(0)
    expect(Object.keys(profile.buckets).length).toBe(0)
  })

  it('déterministe : mêmes entrées → même profil', () => {
    const input = {
      activities: [actAt('prev', '2026-04-20T08:00:00Z')],
      activityStreams: { prev: synthClimbFlatStream() },
      fcMax: 190, asOfDate: RACE_START, windowDays: 56,
    }
    expect(buildRunnerProfileAtDate(input)).toEqual(buildRunnerProfileAtDate(input))
  })
})
