// Pont (pur) entre une activité Strava brute et le moteur de verdict :
// extrait le réalisé (allure/FC/D+/durée) puis compile le verdict.
// La dérive cardiaque exige les streams → null en V1 (option ultérieure).

import {
  deriveSessionTarget,
  computeSessionVerdict,
  type SessionActual,
  type SessionRpe,
  type VerdictResult,
  type SessionTarget,
} from './sessionVerdict'
import type { WorkoutTemplate } from './workouts'

export interface RawActivity {
  distance?: number | null            // mètres
  moving_time?: number | null         // secondes
  average_heartrate?: number | null   // bpm
  total_elevation_gain?: number | null // mètres
  driftPct?: number | null            // optionnel (si calculé via streams)
}

/** Extrait le réalisé d'une activité. Champs manquants → null (gérés par le moteur). */
export function extractActual(a: RawActivity | null, fcMax?: number | null): SessionActual {
  if (!a) return { avgPaceSecPerKm: null, avgHrPctMax: null, driftPct: null, dplusM: null, durationMin: null }
  const km = a.distance != null ? a.distance / 1000 : 0
  const avgPaceSecPerKm = km > 0 && a.moving_time ? Math.round(a.moving_time / km) : null
  const avgHrPctMax = a.average_heartrate && fcMax ? +(a.average_heartrate / fcMax).toFixed(3) : null
  return {
    avgPaceSecPerKm,
    avgHrPctMax,
    driftPct: a.driftPct ?? null,
    dplusM: a.total_elevation_gain ?? null,
    durationMin: a.moving_time ? Math.round(a.moving_time / 60) : null,
  }
}

/** Compile le verdict d'une séance prévue confrontée à une activité (ou au ressenti seul). */
export function buildSessionVerdict(
  template: Pick<WorkoutTemplate, 'system' | 'climbing'>,
  vdot: number | null | undefined,
  fcMax: number | null | undefined,
  activity: RawActivity | null,
  rpe: SessionRpe,
): { result: VerdictResult; actual: SessionActual; target: SessionTarget } {
  const target = deriveSessionTarget(template, vdot, fcMax)
  const actual = extractActual(activity, fcMax)
  const result = computeSessionVerdict(target, actual, rpe, activity != null)
  return { result, actual, target }
}
