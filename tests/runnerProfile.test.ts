import { describe, it, expect } from 'vitest'
import {
  computeRunnerProfile,
  getGradeBucket,
  fmtPaceProfile,
  type ActivityAggregate,
} from '../src/lib/runnerProfile'

function makeActivity(overrides: Partial<ActivityAggregate> = {}): ActivityAggregate {
  return {
    id: 'test',
    distM: 20000,
    dplus: 800,
    movingTimeSec: 7200,
    avgHrBpm: 155,
    avgSpeedMs: 2.78,
    type: 'run',
    sportType: 'Trail',
    startDate: new Date().toISOString(),
    ...overrides,
  }
}

describe('getGradeBucket', () => {
  it('classifies flat terrain', () => {
    expect(getGradeBucket(0)).toBe('flat')
    expect(getGradeBucket(-2)).toBe('flat')
    expect(getGradeBucket(2)).toBe('flat')
  })
  it('classifies uphill buckets', () => {
    expect(getGradeBucket(4)).toBe('climb_easy')
    expect(getGradeBucket(8)).toBe('climb_moderate')
    expect(getGradeBucket(12)).toBe('climb_steep')
    expect(getGradeBucket(20)).toBe('climb_wall')
  })
  it('classifies downhill buckets', () => {
    expect(getGradeBucket(-5)).toBe('descent_easy')
    expect(getGradeBucket(-10)).toBe('descent_moderate')
    expect(getGradeBucket(-20)).toBe('descent_steep')
  })
})

describe('computeRunnerProfile', () => {
  it('returns zero profile when no activities', () => {
    const p = computeRunnerProfile([], 190)
    expect(p.trailActivities).toBe(0)
    expect(p.totalDistKm).toBe(0)
    expect(p.estimatedVamMH).toBeNull()
  })

  it('ignores non-trail activity types', () => {
    const acts = [makeActivity({ type: 'ride', sportType: 'Ride' })]
    const p = computeRunnerProfile(acts, 190)
    expect(p.trailActivities).toBe(0)
  })

  it('counts trail activities correctly', () => {
    const acts = [
      makeActivity(),
      makeActivity({ id: 'b', type: 'Trail' }),
      makeActivity({ id: 'c', sportType: 'Trail', type: 'run' }),
    ]
    const p = computeRunnerProfile(acts, 190)
    expect(p.trailActivities).toBe(3)
  })

  it('excludes activities older than periodMonths', () => {
    const old = new Date()
    old.setMonth(old.getMonth() - 14)
    const acts = [
      makeActivity(),
      makeActivity({ id: 'old', startDate: old.toISOString() }),
    ]
    const p = computeRunnerProfile(acts, 190, 12)
    expect(p.trailActivities).toBe(1)
  })

  it('computes correct total distance and D+', () => {
    const acts = [makeActivity(), makeActivity({ id: 'b', distM: 10000, dplus: 200 })]
    const p = computeRunnerProfile(acts, 190)
    expect(p.totalDistKm).toBe(30)
    expect(p.totalDplus).toBe(1000)
  })

  it('estimatedVamMH is null when total D+ < 500m', () => {
    const acts = [makeActivity({ dplus: 100 })]
    const p = computeRunnerProfile(acts, 190)
    expect(p.estimatedVamMH).toBeNull()
  })

  it('estimatedVamMH is computed when sufficient D+', () => {
    // 800m D+ / 2h = 400 m/h
    const acts = [makeActivity({ dplus: 800, movingTimeSec: 7200 })]
    const p = computeRunnerProfile(acts, 190)
    expect(p.estimatedVamMH).toBe(400)
  })

  it('gradeBucketMultipliers is null (streams not available)', () => {
    const p = computeRunnerProfile([makeActivity()], 190)
    expect(p.gradeBucketMultipliers).toBeNull()
    expect(p.streamsAvailable).toBe(false)
  })

  it('avgHrPctFcMax is computed relative to fcMax', () => {
    const acts = [makeActivity({ avgHrBpm: 152 })]
    const p = computeRunnerProfile(acts, 190)
    expect(p.avgHrPctFcMax).toBeCloseTo(0.8, 1)
  })

  it('terrain is montagne when avgDplusPerKm >= 50', () => {
    // 1000m D+ / 10km = 100 m/km
    const acts = [makeActivity({ distM: 10000, dplus: 1000 })]
    const p = computeRunnerProfile(acts, 190)
    expect(p.terrainLabel).toBe('montagne')
  })
})

describe('fmtPaceProfile', () => {
  it('returns — for null', () => {
    expect(fmtPaceProfile(null)).toBe('—')
  })
  it('formats 6 min/km correctly', () => {
    expect(fmtPaceProfile(360)).toBe("6'00/km")
  })
  it('formats 5min30 correctly', () => {
    expect(fmtPaceProfile(330)).toBe("5'30/km")
  })
})
