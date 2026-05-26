import { describe, it, expect } from 'vitest'
import {
  getGradeBucket,
  fmtVam,
  fmtSpeed,
  fmtDuration,
  statusColor,
  statusLabel,
  confidenceLabel,
  type GradientBucketKey,
  type BucketStats,
  type RunnerProfileComputed,
} from '../src/lib/runnerProfile'

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
  it('boundary: grade=3 is climb_easy, grade=-3 is flat', () => {
    expect(getGradeBucket(3)).toBe('climb_easy')
    expect(getGradeBucket(-3)).toBe('flat')
  })
  it('boundary: grade=15 is climb_wall', () => {
    expect(getGradeBucket(15)).toBe('climb_wall')
  })
})

describe('fmtVam', () => {
  it('returns — for null', () => {
    expect(fmtVam(null)).toBe('—')
  })
  it('formats a VAM value', () => {
    expect(fmtVam(750)).toBe('750 m/h')
    expect(fmtVam(1023.7)).toBe('1024 m/h')
  })
})

describe('fmtSpeed', () => {
  it('returns — for null', () => {
    expect(fmtSpeed(null)).toBe('—')
  })
  it('formats a speed value with one decimal', () => {
    expect(fmtSpeed(12.4)).toBe('12.4 km/h')
    expect(fmtSpeed(9)).toBe('9.0 km/h')
  })
})

describe('fmtDuration', () => {
  it('formats seconds under 1 hour as minutes', () => {
    expect(fmtDuration(600)).toBe('10 min')
    expect(fmtDuration(45)).toBe('0 min')
  })
  it('formats seconds over 1 hour as hMM', () => {
    expect(fmtDuration(3600)).toBe('1h00')
    expect(fmtDuration(5400)).toBe('1h30')
    expect(fmtDuration(7320)).toBe('2h02')
  })
})

describe('statusColor / statusLabel', () => {
  it('returns correct color for each status', () => {
    expect(statusColor('strength')).toBe('var(--vl-growth)')
    expect(statusColor('ok')).toBe('var(--vl-text)')
    expect(statusColor('weak')).toBe('var(--vl-ember)')
    expect(statusColor('unknown')).toBe('var(--vl-text-3)')
  })
  it('returns correct label for each status', () => {
    expect(statusLabel('strength')).toBe('Point fort')
    expect(statusLabel('ok')).toBe('Correct')
    expect(statusLabel('weak')).toBe('À renforcer')
    expect(statusLabel('unknown')).toBe('—')
  })
})

describe('confidenceLabel', () => {
  it('returns correct labels', () => {
    expect(confidenceLabel('high')).toBe('Fiable')
    expect(confidenceLabel('medium')).toBe('Moyen')
    expect(confidenceLabel('low')).toBe('Peu de données')
    expect(confidenceLabel('none')).toBe('—')
  })
})

describe('RunnerProfileComputed type structure', () => {
  it('accepts a valid profile object', () => {
    const bucket: BucketStats = {
      timeSec: 1800,
      dplusM: 200,
      vamMH: 750,
      avgSpeedKmH: 6.5,
      avgHrBpm: 155,
      avgHrPctFcMax: 82,
      confidence: 'high',
      status: 'ok',
    }
    const profile: RunnerProfileComputed = {
      computedAt: new Date().toISOString(),
      periodDays: 90,
      activitiesAnalyzed: 12,
      totalActivitiesFound: 15,
      fcMax: 190,
      buckets: {
        climb_easy: bucket,
        climb_moderate: { ...bucket, vamMH: 820, status: 'strength' },
        climb_steep: { ...bucket, timeSec: 400, confidence: 'medium', status: 'ok' },
        climb_wall: { ...bucket, timeSec: 60, confidence: 'low', status: 'unknown', vamMH: null },
        flat: { ...bucket, vamMH: null, dplusM: 0 },
        descent_easy: { ...bucket, vamMH: null, avgSpeedKmH: 12.5, status: 'strength' },
        descent_moderate: { ...bucket, vamMH: null, avgSpeedKmH: 9.2, status: 'ok' },
        descent_steep: { ...bucket, vamMH: null, avgSpeedKmH: 6.0, confidence: 'low', status: 'weak' },
      },
      gradeBucketMultipliers: {
        climb_easy: 1.0,
        climb_moderate: 0.9,
        climb_steep: 1.2,
        climb_wall: 1.5,
        flat: 1.0,
        descent_easy: 0.8,
        descent_moderate: 1.0,
        descent_steep: 1.3,
      },
    }
    expect(profile.activitiesAnalyzed).toBe(12)
    expect(profile.buckets.climb_easy.vamMH).toBe(750)
    expect(profile.buckets.descent_easy.status).toBe('strength')
    expect(profile.gradeBucketMultipliers.climb_wall).toBe(1.5)
  })

  it('bucket with no data has confidence=none and status=unknown', () => {
    const emptyBucket: BucketStats = {
      timeSec: 0,
      dplusM: 0,
      vamMH: null,
      avgSpeedKmH: null,
      avgHrBpm: null,
      avgHrPctFcMax: null,
      confidence: 'none',
      status: 'unknown',
    }
    expect(emptyBucket.confidence).toBe('none')
    expect(emptyBucket.vamMH).toBeNull()
    expect(fmtVam(emptyBucket.vamMH)).toBe('—')
  })

  it('optional errors field', () => {
    const profile: RunnerProfileComputed = {
      computedAt: new Date().toISOString(),
      periodDays: 90,
      activitiesAnalyzed: 3,
      totalActivitiesFound: 10,
      fcMax: 185,
      buckets: {} as RunnerProfileComputed['buckets'],
      gradeBucketMultipliers: {} as RunnerProfileComputed['gradeBucketMultipliers'],
      errors: ['Activity 12345: no stream data', 'Activity 67890: 403 forbidden'],
    }
    expect(profile.errors).toHaveLength(2)
    expect(profile.errors![0]).toContain('12345')
  })
})

describe('GradientBucketKey type coverage', () => {
  it('all 8 bucket keys are valid', () => {
    const keys: GradientBucketKey[] = [
      'climb_easy', 'climb_moderate', 'climb_steep', 'climb_wall',
      'flat',
      'descent_easy', 'descent_moderate', 'descent_steep',
    ]
    expect(keys).toHaveLength(8)
  })
})
