import { describe, it, expect } from 'vitest'
import { levelFromVdot, weaknessesFromRunnerProfile } from '../src/lib/coach/profileSignals'
import type { RunnerProfileComputed } from '../src/lib/runnerProfile'

function rp(over: Partial<RunnerProfileComputed> = {}): RunnerProfileComputed {
  return {
    _computedAt: '2026-05-01', fcMax: 185, totalStreamSeconds: 0, streamCoverage: 1,
    buckets: {},
    postClimbHrRecoveryBpmPerMin: null, postClimbHrDropPctFcMax: null,
    postClimbResumeSpeedKmH: null, postClimbRecoveryConfidence: 'none',
    postClimbRecoveryStatus: 'unknown',
    hrDriftPct: null, hrDriftConfidence: 'none', hrDriftStatus: 'unknown',
    ...over,
  } as RunnerProfileComputed
}

describe('levelFromVdot', () => {
  it('mappe les paliers de VDOT', () => {
    expect(levelFromVdot(35)).toBe('beginner')
    expect(levelFromVdot(45)).toBe('intermediate')
    expect(levelFromVdot(55)).toBe('advanced')
  })
  it('défaut intermédiaire si inconnu', () => {
    expect(levelFromVdot(null)).toBe('intermediate')
    expect(levelFromVdot(undefined)).toBe('intermediate')
    expect(levelFromVdot(NaN)).toBe('intermediate')
  })
})

describe('weaknessesFromRunnerProfile', () => {
  it('renvoie vide sans profil', () => {
    expect(weaknessesFromRunnerProfile(null)).toEqual([])
  })

  it('un bucket montée faible → climbing', () => {
    const w = weaknessesFromRunnerProfile(rp({
      buckets: { steep_up: { status: 'weak' } as never },
    }))
    expect(w).toContain('climbing')
  })

  it('un bucket descente faible → descending ; plat faible → economy', () => {
    const w = weaknessesFromRunnerProfile(rp({
      buckets: { mod_down: { status: 'weak' } as never, flat: { status: 'weak' } as never },
    }))
    expect(w).toContain('descending')
    expect(w).toContain('economy')
  })

  it('dérive cardiaque marquée → durability ; fatigue descente élevée → descending', () => {
    const w = weaknessesFromRunnerProfile(rp({
      hrDriftStatus: 'marked',
      downhillFatigue: { status: 'high' } as never,
    }))
    expect(w).toContain('durability')
    expect(w).toContain('descending')
  })

  it('ignore les buckets ok/strength', () => {
    const w = weaknessesFromRunnerProfile(rp({
      buckets: { steep_up: { status: 'strength' } as never, flat: { status: 'ok' } as never },
    }))
    expect(w).toEqual([])
  })
})
