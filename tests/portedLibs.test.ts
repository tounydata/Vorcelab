import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

// Les modules legacy importent app-state.js (VLState / sb) — on le mocke.
vi.mock('../legacy/app-state.js', () => ({
  FC_MAX_DEFAULT: 205,
  VLState: { currentRaceContext: null, currentUser: null, userProfile: { pain_zones: [] }, allActivities: [], historyActivities: [], races: [] },
  sb: {},
}))

// Modules TS portés
import * as tsGpx from '../src/lib/gpxCore'
import * as tsPred from '../src/lib/racePredictor'
import { buildSession as tsBuildSession, applyDUP as tsApplyDUP } from '../src/lib/renfoProgram'
import * as tsData from '../src/lib/renfoData'

// Modules legacy d'origine (référence 1-pour-1)
import * as jsGpx from '../legacy/gpx-core.js'
import * as jsPred from '../legacy/race-predictor.js'
import { buildSession as jsBuildSession, applyDUP as jsApplyDUP } from '../legacy/renfo-program.js'
import * as jsData from '../legacy/renfo-data.js'

// ─── gpx-core : équivalence stricte ───────────────────────────────────────────

describe('gpxCore ≡ gpx-core.js', () => {
  const a = { lat: 45.18, lon: 5.72 }
  const b = { lat: 45.20, lon: 5.75 }

  it('hav identique', () => {
    expect(tsGpx.hav(a, b)).toBe(jsGpx.hav(a, b))
    expect(tsGpx.hav(a, a)).toBe(0)
  })

  it('minettiGradePenalty identique sur toute la plage', () => {
    for (const g of [-0.4, -0.25, -0.1, 0, 0.05, 0.12, 0.25, 0.4]) {
      expect(tsGpx.minettiGradePenalty(g)).toBe(jsGpx.minettiGradePenalty(g))
    }
  })

  it('buildDetailedSections identique', () => {
    const kmSecs = [
      { startKm: 0, km: 1, dist: 1000, dplus: 80, dminus: 0 },
      { startKm: 1, km: 2, dist: 1000, dplus: 60, dminus: 0 },
      { startKm: 2, km: 3, dist: 1000, dplus: 0, dminus: 120 },
      { startKm: 3, km: 4, dist: 1000, dplus: 5, dminus: 5 },
      { startKm: 4, km: 5, dist: 1000, dplus: 200, dminus: 0 },
    ]
    expect(tsGpx.buildDetailedSections(kmSecs)).toEqual(jsGpx.buildDetailedSections(kmSecs))
  })
})

// ─── race-predictor : équivalence stricte ─────────────────────────────────────

function mkRun(daysAgo: number, over: Record<string, unknown> = {}) {
  return {
    sport_type: 'Run',
    type: 'Run',
    distance: 12000,
    moving_time: 3600,
    average_heartrate: 175,
    average_speed: 3.2,
    start_date: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    ...over,
  }
}

describe('racePredictor ≡ race-predictor.js', () => {
  const acts = [
    mkRun(40, { average_speed: 3.0 }), mkRun(35, { average_speed: 3.0 }),
    mkRun(30, { average_speed: 3.1 }), mkRun(10, { average_speed: 3.4 }),
    mkRun(5, { average_speed: 3.5 }), mkRun(2, { average_speed: 3.5 }),
  ]

  it('computeProgressionFactor identique', () => {
    expect(tsPred.computeProgressionFactor(acts, 205)).toBe(jsPred.computeProgressionFactor(acts, 205))
    expect(tsPred.computeProgressionFactor(acts, 205, true)).toBe(jsPred.computeProgressionFactor(acts, 205, true))
  })

  it('computeFreshnessAdjustment identique', () => {
    expect(tsPred.computeFreshnessAdjustment(acts, 205)).toEqual(jsPred.computeFreshnessAdjustment(acts, 205))
  })

  it('renvoie le neutre si trop peu de données', () => {
    expect(tsPred.computeProgressionFactor([], 205)).toBe(1)
    expect(tsPred.computeFreshnessAdjustment([], 205)).toEqual({ multiplier: 1, label: null })
  })
})

// ─── renfo-program : équivalence stricte ──────────────────────────────────────

describe('renfoProgram ≡ renfo-program.js', () => {
  // buildSession/applyDUP lisent Date.now() (offset de semaine + phase DUP).
  // On fige le temps pour un test 100% déterministe.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-04T10:00:00Z')) })
  afterAll(() => { vi.useRealTimers() })

  const profile = { has_gym_access: true, equipment: { barbell: true, bench: true }, sessions_per_week: 4 }

  for (const focus of ['force_lourde', 'excentrique', 'pliometrie', 'tronc']) {
    it(`buildSession("${focus}") identique`, () => {
      expect(tsBuildSession(focus, profile)).toEqual(jsBuildSession(focus, profile))
    })
    it(`applyDUP(buildSession("${focus}")) identique`, () => {
      const ts = tsApplyDUP(tsBuildSession(focus, profile))
      const js = jsApplyDUP(jsBuildSession(focus, profile))
      expect(ts).toEqual(js)
    })
  }
})

// ─── renfo-data : données intactes ────────────────────────────────────────────

describe('renfoData ≡ renfo-data.js', () => {
  it('mêmes clés d\'exercices', () => {
    expect(Object.keys(tsData.RENFO_EXERCISES).sort()).toEqual(Object.keys(jsData.RENFO_EXERCISES).sort())
  })
  it('mêmes méta de focus et séances', () => {
    expect(tsData.FOCUS_META).toEqual(jsData.FOCUS_META)
    expect(tsData.SESSION_EXERCISES).toEqual(jsData.SESSION_EXERCISES)
    expect(tsData.RENFO_FOCUS_COLORS).toEqual(jsData.RENFO_FOCUS_COLORS)
  })
  it('un exercice détaillé est identique', () => {
    expect(tsData.RENFO_EXERCISES['squat_lourd']).toEqual(jsData.RENFO_EXERCISES['squat_lourd'])
  })
  it('helpers identiques', () => {
    expect(tsData.getExerciseGifUrl('rdl')).toBe(jsData.getExerciseGifUrl('rdl'))
    expect(tsData.fmtRest(90)).toBe(jsData.fmtRest(90))
  })
})
