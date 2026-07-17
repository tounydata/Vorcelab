import { describe, it, expect } from 'vitest'
import {
  ENGINE_HISTORY_DAYS,
  RUNNER_PROFILE_WINDOW_DAYS,
  REQUIRED_ENGINE_COLUMNS,
  ENGINE_COLUMNS_SELECT,
  selectEngineHistoryAtDate,
  selectActivitiesForTrainingLoad,
  selectRunningActivities,
  isEligiblePersonalCalibrationRace,
  isRunningActivity,
  engineHistoryBounds,
  type EngineActivity,
} from '../src/lib/engineHistory'

// Parité web/mobile : le module mobile doit être IDENTIQUE (même fenêtre, mêmes règles).
import {
  ENGINE_HISTORY_DAYS as MOBILE_ENGINE_HISTORY_DAYS,
  RUNNER_PROFILE_WINDOW_DAYS as MOBILE_PROFILE_WINDOW_DAYS,
  selectEngineHistoryAtDate as mobileSelectEngineHistoryAtDate,
} from '../mobile/src/lib/engineHistory'

const DAY = 86_400_000
const AS_OF = Date.parse('2026-06-01T08:00:00Z')
const USER = 'user-1'

function act(overrides: Partial<EngineActivity>): EngineActivity {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    user_id: USER,
    strava_activity_id: overrides.strava_activity_id ?? Math.floor(Math.random() * 1e9),
    type: 'Run',
    sport_type: 'Run',
    start_date: new Date(AS_OF - 10 * DAY).toISOString(),
    distance: 10000,
    moving_time: 3000,
    elapsed_time: 3050,
    total_elevation_gain: 100,
    average_speed: 3.3,
    is_race: false,
    raw_data: { workout_type: null, average_temp: null },
    deleted_at: null,
    ...overrides,
  }
}

const base = (daysAgo: number, extra: Partial<EngineActivity> = {}) =>
  act({ start_date: new Date(AS_OF - daysAgo * DAY).toISOString(), ...extra })

describe('constantes de fenêtre', () => {
  it('ENGINE_HISTORY_DAYS = 183 (six mois) et RUNNER_PROFILE_WINDOW_DAYS = 56', () => {
    expect(ENGINE_HISTORY_DAYS).toBe(183)
    expect(RUNNER_PROFILE_WINDOW_DAYS).toBe(56)
  })
  it('les colonnes requises ne contiennent jamais `*` et incluent raw_data', () => {
    expect(ENGINE_COLUMNS_SELECT).not.toContain('*')
    expect(REQUIRED_ENGINE_COLUMNS).toContain('raw_data')
    expect(REQUIRED_ENGINE_COLUMNS).toContain('deleted_at')
    expect(REQUIRED_ENGINE_COLUMNS).toContain('start_date')
  })
})

describe('selectEngineHistoryAtDate — fenêtre de six mois (section 19)', () => {
  it('1. inclut une activité vieille de 182 jours', () => {
    const sel = selectEngineHistoryAtDate({ activities: [base(182, { id: 'a182' })], userId: USER, asOfMs: AS_OF })
    expect(sel.map((a) => a.id)).toEqual(['a182'])
  })
  it('2. exclut une activité vieille de 184 jours', () => {
    const sel = selectEngineHistoryAtDate({ activities: [base(184, { id: 'a184' })], userId: USER, asOfMs: AS_OF })
    expect(sel).toHaveLength(0)
  })
  it('3. exclut une activité à l’instant exact de la course (borne haute stricte)', () => {
    const at = act({ id: 'now', start_date: new Date(AS_OF).toISOString() })
    const sel = selectEngineHistoryAtDate({ activities: [at], userId: USER, asOfMs: AS_OF })
    expect(sel).toHaveLength(0)
  })
  it('4. exclut une activité future', () => {
    const sel = selectEngineHistoryAtDate({ activities: [base(-5, { id: 'future' })], userId: USER, asOfMs: AS_OF })
    expect(sel).toHaveLength(0)
  })
  it('5. exclut une activité supprimée', () => {
    const del = base(10, { id: 'del', deleted_at: new Date(AS_OF - 9 * DAY).toISOString() })
    const sel = selectEngineHistoryAtDate({ activities: [del], userId: USER, asOfMs: AS_OF })
    expect(sel).toHaveLength(0)
  })
  it('6. peut retourner plus de 150 activités', () => {
    const many = Array.from({ length: 200 }, (_, i) => base(1 + (i % 180), { id: `m${i}`, strava_activity_id: i }))
    const sel = selectEngineHistoryAtDate({ activities: many, userId: USER, asOfMs: AS_OF })
    expect(sel.length).toBe(200)
    expect(sel.length).toBeGreaterThan(150)
  })
  it('7. exclut une activité > six mois même si elle est parmi les 150 dernières', () => {
    // 149 activités récentes + une très ancienne : l'ancienne est hors fenêtre.
    const recent = Array.from({ length: 149 }, (_, i) => base(1 + i, { id: `r${i}`, strava_activity_id: i }))
    const old = base(300, { id: 'ancienne', strava_activity_id: 9999 })
    const sel = selectEngineHistoryAtDate({ activities: [...recent, old], userId: USER, asOfMs: AS_OF })
    expect(sel.map((a) => a.id)).not.toContain('ancienne')
    expect(sel.length).toBe(149)
  })
  it('exclut les autres athlètes', () => {
    const other = base(10, { id: 'other', user_id: 'autre' })
    const mine = base(10, { id: 'mine' })
    const sel = selectEngineHistoryAtDate({ activities: [other, mine], userId: USER, asOfMs: AS_OF })
    expect(sel.map((a) => a.id)).toEqual(['mine'])
  })
  it('8. web et mobile utilisent la même fenêtre (mêmes constantes + même sélection)', () => {
    expect(MOBILE_ENGINE_HISTORY_DAYS).toBe(ENGINE_HISTORY_DAYS)
    expect(MOBILE_PROFILE_WINDOW_DAYS).toBe(RUNNER_PROFILE_WINDOW_DAYS)
    const acts = [base(1, { id: 'x1' }), base(100, { id: 'x2' }), base(190, { id: 'x3' })]
    const web = selectEngineHistoryAtDate({ activities: acts, userId: USER, asOfMs: AS_OF })
    const mob = mobileSelectEngineHistoryAtDate({ activities: acts, userId: USER, asOfMs: AS_OF })
    expect(mob.map((a) => a.id)).toEqual(web.map((a) => a.id))
  })
  it('10. déterministe pour un même asOfMs (tri stable par date décroissante)', () => {
    const acts = [base(5, { id: 'b' }), base(1, { id: 'a' }), base(20, { id: 'c' })]
    const a = selectEngineHistoryAtDate({ activities: acts, userId: USER, asOfMs: AS_OF })
    const b = selectEngineHistoryAtDate({ activities: acts, userId: USER, asOfMs: AS_OF })
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
    expect(a.map((x) => x.id)).toEqual(['a', 'b', 'c']) // 1j, 5j, 20j
  })
})

describe('engineHistoryBounds', () => {
  it('borne basse = asOf − 183 j, borne haute = asOf', () => {
    const { asOfMs, sinceMs } = engineHistoryBounds(AS_OF)
    expect(asOfMs).toBe(AS_OF)
    expect(sinceMs).toBe(AS_OF - ENGINE_HISTORY_DAYS * DAY)
  })
})

describe('sélection par type d’activité (section 20)', () => {
  const asRun = (extra: Partial<EngineActivity>) => base(10, { type: 'Run', sport_type: 'Run', ...extra })
  const footing = asRun({ id: 'footing', name: 'Footing matinal', is_race: false })
  const cotes = asRun({ id: 'cotes', name: 'Séance de côtes', is_race: false })
  const longTrail = base(12, { id: 'long', type: 'TrailRun', sport_type: 'TrailRun', name: 'Sortie longue', distance: 30000, total_elevation_gain: 1200, moving_time: 12000 })
  const fractionne = asRun({ id: 'frac', name: 'Fractionné 10x400' })
  const velo = base(8, { id: 'velo', type: 'Ride', sport_type: 'Ride', name: 'Sortie vélo' })
  const confirmedRace = asRun({ id: 'race', name: 'Trail des Aiguilles', is_race: true, raw_data: { workout_type: 1 }, average_speed: 3.0 })
  const rejectedRace = asRun({ id: 'warmup', name: 'Échauffement course', is_race: true, raw_data: { workout_type: 1 } })

  const all = [footing, cotes, longTrail, fractionne, velo, confirmedRace, rejectedRace]

  it('1/2/3/4. footing, côtes, sortie longue trail, fractionné → activités running transmises au moteur', () => {
    const runs = selectRunningActivities(all)
    const ids = runs.map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['footing', 'cotes', 'long', 'frac', 'race']))
  })
  it('5. une activité vélo alimente la charge générale', () => {
    const load = selectActivitiesForTrainingLoad(all)
    expect(load.map((a) => a.id)).toContain('velo')
  })
  it('6. une activité vélo n’est jamais une activité running (VAM/allures/PR)', () => {
    expect(isRunningActivity(velo)).toBe(false)
    expect(selectRunningActivities(all).map((a) => a.id)).not.toContain('velo')
  })
  it('7. un footing n’alimente pas la calibration de compétition', () => {
    expect(isEligiblePersonalCalibrationRace(footing)).toBe(false)
  })
  it('8. une course confirmée alimente le profil général ET l’ancrage compétition', () => {
    expect(isRunningActivity(confirmedRace)).toBe(true) // profil général
    expect(isEligiblePersonalCalibrationRace(confirmedRace)).toBe(true) // ancrage
  })
  it('9. une activité marquée course mais rejetée (échauffement) n’alimente pas l’ancrage', () => {
    expect(isEligiblePersonalCalibrationRace(rejectedRace)).toBe(false)
  })
  it('la charge d’entraînement retient toute activité avec durée réelle', () => {
    const load = selectActivitiesForTrainingLoad(all)
    expect(load.length).toBe(all.length) // toutes ont moving/elapsed > 0
  })
})
