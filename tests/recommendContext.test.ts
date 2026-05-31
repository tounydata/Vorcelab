import { describe, it, expect } from 'vitest'
import { buildRecommendContext } from '../src/lib/coach/recommendContext'
import type { ActivityForLoad } from '../src/lib/trainingLoad'

function daysAgoISO(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}

describe('buildRecommendContext', () => {
  it('transmet la phase', () => {
    expect(buildRecommendContext('build', [], 190).phase).toBe('build')
    expect(buildRecommendContext(undefined, [], 190).phase).toBeNull()
  })

  it('détecte la fraîcheur (jours depuis la dernière sortie dure)', () => {
    const acts: ActivityForLoad[] = [
      { start_date: daysAgoISO(1), average_heartrate: 175, moving_time: 3000, distance: 10000, type: 'Run', sport_type: 'Run', total_elevation_gain: 50 },
      { start_date: daysAgoISO(5), average_heartrate: 130, moving_time: 2000, distance: 6000, type: 'Run', sport_type: 'Run', total_elevation_gain: 20 },
    ]
    // 175/190 = 0.92 ≥ 0.85 → dur il y a 1 jour
    expect(buildRecommendContext('build', acts, 190).daysSinceHard).toBe(1)
  })

  it('ignore les sorties faciles pour la fraîcheur', () => {
    const acts: ActivityForLoad[] = [
      { start_date: daysAgoISO(2), average_heartrate: 120, moving_time: 2000, distance: 6000, type: 'Run', sport_type: 'Run', total_elevation_gain: 10 },
    ]
    expect(buildRecommendContext('build', acts, 190).daysSinceHard).toBeNull()
  })

  it('calcule un ACWR (ou null si pas de données)', () => {
    expect(buildRecommendContext('build', [], 190).acwr).toBeNull()
  })
})
