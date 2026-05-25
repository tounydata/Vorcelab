import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  get4WeekPhase,
  applyDeloadModifiers,
  computeCoPerioWarnings,
  computeNextLoad,
  computeImpactZone,
  todayStr,
  fmtRestTimer,
  calcE1rm,
  type DUPPhase4,
  type Activity,
  type ExerciseLog,
  type SessionLog,
} from '../src/lib/renfoUtils'

// ─── get4WeekPhase ────────────────────────────────────────────────────────────

describe('get4WeekPhase', () => {
  it('returns one of the four valid phases', () => {
    const phase = get4WeekPhase()
    expect(['force', 'volume', 'puissance', 'deload']).toContain(phase)
  })

  it('cycles through all 4 phases as weeks advance', () => {
    const phases: DUPPhase4[] = []
    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      vi.spyOn(Date, 'now').mockReturnValue(weekOffset * 7 * 86_400_000)
      phases.push(get4WeekPhase())
    }
    vi.restoreAllMocks()
    expect(new Set(phases).size).toBe(4)
  })

  it('week 0 → force', () => {
    vi.spyOn(Date, 'now').mockReturnValue(0)
    expect(get4WeekPhase()).toBe('force')
    vi.restoreAllMocks()
  })

  it('week 1 → volume', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1 * 7 * 86_400_000)
    expect(get4WeekPhase()).toBe('volume')
    vi.restoreAllMocks()
  })

  it('week 3 → deload', () => {
    vi.spyOn(Date, 'now').mockReturnValue(3 * 7 * 86_400_000)
    expect(get4WeekPhase()).toBe('deload')
    vi.restoreAllMocks()
  })

  it('wraps back to force on week 4', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4 * 7 * 86_400_000)
    expect(get4WeekPhase()).toBe('force')
    vi.restoreAllMocks()
  })
})

// ─── applyDeloadModifiers ─────────────────────────────────────────────────────

describe('applyDeloadModifiers', () => {
  it('reduces sets by 1', () => {
    const result = applyDeloadModifiers([{ sets: 4, target_rpe: 8 }])
    expect(result[0].sets).toBe(3)
  })

  it('never reduces sets below 1', () => {
    const result = applyDeloadModifiers([{ sets: 1, target_rpe: 7 }])
    expect(result[0].sets).toBe(1)
  })

  it('caps RPE at 7 when original is higher', () => {
    const result = applyDeloadModifiers([{ sets: 3, target_rpe: 9 }])
    expect(result[0].target_rpe).toBe(7)
  })

  it('keeps RPE unchanged when already ≤ 7', () => {
    const result = applyDeloadModifiers([{ sets: 3, target_rpe: 6 }])
    expect(result[0].target_rpe).toBe(6)
  })

  it('uses 8 as default RPE when undefined, then caps to 7', () => {
    const result = applyDeloadModifiers([{ sets: 3 }])
    expect(result[0].target_rpe).toBe(7) // min(7, 8) = 7
  })

  it('processes multiple exercises independently', () => {
    const result = applyDeloadModifiers([
      { sets: 4, target_rpe: 8 },
      { sets: 2, target_rpe: 6 },
    ])
    expect(result[0].sets).toBe(3)
    expect(result[1].sets).toBe(1) // max(1, 2-1)
    expect(result[0].target_rpe).toBe(7)
    expect(result[1].target_rpe).toBe(6)
  })

  it('does not mutate original objects', () => {
    const original = [{ sets: 4, target_rpe: 9 }]
    applyDeloadModifiers(original)
    expect(original[0].sets).toBe(4)
    expect(original[0].target_rpe).toBe(9)
  })
})

// ─── computeCoPerioWarnings ───────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

describe('computeCoPerioWarnings', () => {
  it('returns empty array for no activities', () => {
    expect(computeCoPerioWarnings([])).toEqual([])
  })

  it('returns empty array for null/undefined', () => {
    expect(computeCoPerioWarnings(null as unknown as Activity[])).toEqual([])
  })

  it('ignores activities older than 3 days', () => {
    const act: Activity = {
      start_date_local: daysAgo(4),
      distance: 30000,
      moving_time: 10800,
      total_elevation_gain: 200,
    }
    expect(computeCoPerioWarnings([act])).toHaveLength(0)
  })

  it('triggers avoid_force for run > 15 km within 2 days', () => {
    const act: Activity = {
      start_date_local: daysAgo(1),
      distance: 20000,
      moving_time: 6000,
      total_elevation_gain: 100,
    }
    const warnings = computeCoPerioWarnings([act])
    expect(warnings.some((w) => w.type === 'avoid_force')).toBe(true)
  })

  it('avoid_force has severity warn', () => {
    const act: Activity = {
      start_date_local: daysAgo(1),
      distance: 18000,
      moving_time: 5400,
      total_elevation_gain: 50,
    }
    const w = computeCoPerioWarnings([act]).find((w) => w.type === 'avoid_force')
    expect(w?.severity).toBe('warn')
  })

  it('triggers post_long for run > 25 km within 3 days', () => {
    const act: Activity = {
      start_date_local: daysAgo(2),
      distance: 28000,
      moving_time: 10800,
      total_elevation_gain: 200,
    }
    const warnings = computeCoPerioWarnings([act])
    expect(warnings.some((w) => w.type === 'post_long')).toBe(true)
  })

  it('triggers post_long for D+ > 1500m within 3 days', () => {
    const act: Activity = {
      start_date_local: daysAgo(2),
      distance: 15000,
      moving_time: 7200,
      total_elevation_gain: 1600,
    }
    const warnings = computeCoPerioWarnings([act])
    expect(warnings.some((w) => w.type === 'post_long')).toBe(true)
  })

  it('post_long has severity alert', () => {
    const act: Activity = {
      start_date_local: daysAgo(1),
      distance: 30000,
      moving_time: 12000,
      total_elevation_gain: 300,
    }
    const w = computeCoPerioWarnings([act]).find((w) => w.type === 'post_long')
    expect(w?.severity).toBe('alert')
  })

  it('triggers quality_session for fast run yesterday (pace < 5 min/km)', () => {
    // 10 km in 40 min = 4 min/km pace
    const act: Activity = {
      start_date_local: daysAgo(0),
      distance: 10000,
      moving_time: 2400,
      total_elevation_gain: 50,
    }
    const warnings = computeCoPerioWarnings([act])
    expect(warnings.some((w) => w.type === 'quality_session')).toBe(true)
  })

  it('quality_session has severity info', () => {
    const act: Activity = {
      start_date_local: daysAgo(0),
      distance: 10000,
      moving_time: 2400,
      total_elevation_gain: 50,
    }
    const w = computeCoPerioWarnings([act]).find((w) => w.type === 'quality_session')
    expect(w?.severity).toBe('info')
  })

  it('deduplicates warnings of the same type', () => {
    // Two long runs in 3 days → only one post_long
    const acts: Activity[] = [
      { start_date_local: daysAgo(1), distance: 30000, moving_time: 11000, total_elevation_gain: 300 },
      { start_date_local: daysAgo(2), distance: 28000, moving_time: 10800, total_elevation_gain: 200 },
    ]
    const types = computeCoPerioWarnings(acts).map((w) => w.type)
    const counts: Record<string, number> = {}
    for (const t of types) counts[t] = (counts[t] ?? 0) + 1
    expect(Object.values(counts).every((c) => c === 1)).toBe(true)
  })

  it('does not trigger quality_session for short run (< 3 km)', () => {
    const act: Activity = {
      start_date_local: daysAgo(0),
      distance: 2000,
      moving_time: 480,
      total_elevation_gain: 10,
    }
    const warnings = computeCoPerioWarnings([act])
    expect(warnings.some((w) => w.type === 'quality_session')).toBe(false)
  })
})

// ─── computeNextLoad ──────────────────────────────────────────────────────────

describe('computeNextLoad', () => {
  it('returns null for empty log', () => {
    expect(computeNextLoad([])).toBeNull()
  })

  it('returns null when last load is null', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: null, reps_completed: 5, rpe: 7, e1rm: null, completed_all_reps: true },
    ]
    expect(computeNextLoad(logs)).toBeNull()
  })

  it('returns same load when RPE = 8 and all reps completed', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 5, rpe: 8, e1rm: null, completed_all_reps: true },
    ]
    expect(computeNextLoad(logs)).toBe(80)
  })

  it('increases load when RPE ≤ 7', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 5, rpe: 6, e1rm: null, completed_all_reps: true },
    ]
    const next = computeNextLoad(logs)
    expect(next).toBeGreaterThan(80)
  })

  it('increment is a multiple of 1.25 kg', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 5, rpe: 6, e1rm: null, completed_all_reps: true },
    ]
    const next = computeNextLoad(logs)!
    expect((next * 100) % 125).toBe(0)
  })

  it('reduces load when RPE = 9', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 5, rpe: 9, e1rm: null, completed_all_reps: true },
    ]
    const next = computeNextLoad(logs)!
    expect(next).toBeLessThan(80)
  })

  it('reduces load when RPE = 10', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 5, rpe: 10, e1rm: null, completed_all_reps: true },
    ]
    const next = computeNextLoad(logs)!
    expect(next).toBeLessThan(80)
    expect(next).toBeLessThan(computeNextLoad([
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 5, rpe: 9, e1rm: null, completed_all_reps: true },
    ])!) // RPE 10 cuts more than RPE 9
  })

  it('keeps same load when not all reps completed (one failed session)', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 3, rpe: 9, e1rm: null, completed_all_reps: false },
    ]
    expect(computeNextLoad(logs)).toBe(80)
  })

  it('reduces load when two consecutive failed sessions', () => {
    const logs: ExerciseLog[] = [
      { session_date: '2026-01-10', exercise_id: 'squat', load_kg: 80, reps_completed: 3, rpe: 9, e1rm: null, completed_all_reps: false },
      { session_date: '2026-01-08', exercise_id: 'squat', load_kg: 80, reps_completed: 3, rpe: 9, e1rm: null, completed_all_reps: false },
    ]
    const next = computeNextLoad(logs)!
    expect(next).toBeLessThan(80)
  })
})

// ─── computeImpactZone ────────────────────────────────────────────────────────

describe('computeImpactZone', () => {
  it('returns sous_dose zone for empty sessions', () => {
    const result = computeImpactZone([])
    expect(result.zone).toBe('sous_dose')
    expect(result.score).toBe(0)
  })

  it('score accumulates weighted by focus type', () => {
    const sessions: SessionLog[] = [
      { focus: 'force_lourde', duration_min: 40, session_date: '2026-01-10' },
    ]
    const result = computeImpactZone(sessions)
    // force_lourde weight = 1.5 → score = 40 * 1.5 = 60
    expect(result.score).toBe(60)
  })

  it('zone maintien for score 60–119', () => {
    const sessions: SessionLog[] = [
      { focus: 'force_lourde', duration_min: 40, session_date: '2026-01-10' },
      { focus: 'tronc', duration_min: 30, session_date: '2026-01-11' },
    ]
    const result = computeImpactZone(sessions)
    // 40*1.5 + 30*0.8 = 60 + 24 = 84 → maintien
    expect(result.zone).toBe('maintien')
  })

  it('zone adaptation for score 120–179', () => {
    const sessions: SessionLog[] = [
      { focus: 'force_lourde', duration_min: 60, session_date: '2026-01-10' },
      { focus: 'pliometrie', duration_min: 30, session_date: '2026-01-11' },
    ]
    const result = computeImpactZone(sessions)
    // 60*1.5 + 30*1.3 = 90 + 39 = 129 → adaptation
    expect(result.zone).toBe('adaptation')
  })

  it('zone optimal for score 180–239', () => {
    const sessions: SessionLog[] = [
      { focus: 'force_lourde', duration_min: 80, session_date: '2026-01-10' },
      { focus: 'excentrique', duration_min: 60, session_date: '2026-01-11' },
    ]
    const result = computeImpactZone(sessions)
    // 80*1.5 + 60*1.2 = 120 + 72 = 192 → optimal
    expect(result.zone).toBe('optimal')
  })

  it('zone surcharge for score ≥ 240', () => {
    const sessions: SessionLog[] = [
      { focus: 'force_lourde', duration_min: 90, session_date: '2026-01-10' },
      { focus: 'pliometrie', duration_min: 90, session_date: '2026-01-11' },
      { focus: 'excentrique', duration_min: 60, session_date: '2026-01-12' },
    ]
    const result = computeImpactZone(sessions)
    // 90*1.5 + 90*1.3 + 60*1.2 = 135 + 117 + 72 = 324 → surcharge
    expect(result.zone).toBe('surcharge')
  })

  it('uses 30 min as default when duration_min is null', () => {
    const sessions: SessionLog[] = [
      { focus: 'tronc', duration_min: null, session_date: '2026-01-10' },
    ]
    const result = computeImpactZone(sessions)
    // 30 * 0.8 = 24 → sous_dose
    expect(result.score).toBe(24)
  })

  it('unknown focus uses weight 1.0', () => {
    const sessions: SessionLog[] = [
      { focus: 'unknown_focus', duration_min: 30, session_date: '2026-01-10' },
    ]
    const result = computeImpactZone(sessions)
    expect(result.score).toBe(30)
  })

  it('result includes color string', () => {
    const result = computeImpactZone([])
    expect(typeof result.color).toBe('string')
    expect(result.color.length).toBeGreaterThan(0)
  })
})

// ─── todayStr ─────────────────────────────────────────────────────────────────

describe('todayStr', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches current date', () => {
    const expected = new Date().toISOString().slice(0, 10)
    expect(todayStr()).toBe(expected)
  })
})

// ─── fmtRestTimer ─────────────────────────────────────────────────────────────

describe('fmtRestTimer', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(fmtRestTimer(0)).toBe('0:00')
  })

  it('formats 90 seconds as 1:30', () => {
    expect(fmtRestTimer(90)).toBe('1:30')
  })

  it('formats 60 seconds as 1:00', () => {
    expect(fmtRestTimer(60)).toBe('1:00')
  })

  it('formats 45 seconds as 0:45', () => {
    expect(fmtRestTimer(45)).toBe('0:45')
  })

  it('formats 125 seconds as 2:05', () => {
    expect(fmtRestTimer(125)).toBe('2:05')
  })

  it('pads single-digit seconds', () => {
    expect(fmtRestTimer(61)).toBe('1:01')
  })
})

// ─── calcE1rm ─────────────────────────────────────────────────────────────────

describe('calcE1rm', () => {
  it('returns load unchanged for 1 rep (Epley: load * (1 + 1/30))', () => {
    // 100 * (1 + 1/30) = 103.3 → round to 103.3
    expect(calcE1rm(100, 1)).toBeCloseTo(103.3, 1)
  })

  it('returns load for 0 reps (trivial)', () => {
    expect(calcE1rm(100, 0)).toBe(100)
  })

  it('returns > load for any positive reps', () => {
    expect(calcE1rm(80, 5)).toBeGreaterThan(80)
  })

  it('increases with more reps at same load', () => {
    expect(calcE1rm(80, 10)).toBeGreaterThan(calcE1rm(80, 5))
  })

  it('standard: 100 kg × 5 reps ≈ 116.7 kg e1RM', () => {
    // 100 * (1 + 5/30) = 100 * 1.1667 = 116.67 → 116.7
    expect(calcE1rm(100, 5)).toBeCloseTo(116.7, 1)
  })

  it('rounds to 1 decimal place', () => {
    const result = calcE1rm(75, 8)
    expect(result).toBe(Math.round(result * 10) / 10)
  })
})
