// Modulation v3 — le verdict de la dernière séance ajuste la PROCHAINE séance
// qualité de la semaine courante (allègement / progression d'un cran).
// 100 % déterministe, borné (une seule séance touchée), réversible côté UI.
// L'affûtage (taper/course) est protégé : jamais modulé.

import { getWorkout } from './workouts'
import type { TrainingPlan, PlanWeek, PlannedSession } from './planGenerator'
import type { SessionVerdict } from './sessionVerdict'

export type AdjustDirection = 'lighten' | 'progress' | 'none'

export interface Adjustment {
  direction: AdjustDirection
  reason: string
}

export interface AppliedModulation {
  direction: 'lighten' | 'progress'
  reason: string
  dayOfWeek: number
  fromTitle: string
  toTitle: string
}

const EASY_ID = 'endurance_easy'
const PROGRESS_QUALITY_ID = 'tempo_run'
const QUALITY_SYSTEMS = new Set(['tempo', 'threshold', 'vo2max', 'speed', 'hills', 'race_pace'])

function isQuality(s: PlannedSession): boolean {
  return s.intensity === 'hard' || QUALITY_SYSTEMS.has(s.system)
}

/** Verdict de la dernière séance → sens de l'ajustement de la prochaine. */
export function computeAdjustment(latest: SessionVerdict | null): Adjustment {
  if (latest === 'trop_dur') return { direction: 'lighten', reason: 'ta dernière séance a été jugée trop dure' }
  if (latest === 'trop_facile') return { direction: 'progress', reason: 'ta dernière séance a été jugée trop facile' }
  return { direction: 'none', reason: '' }
}

function swapSession(s: PlannedSession, toId: string): PlannedSession {
  const w = getWorkout(toId)!
  return { ...s, workoutId: w.id, title: w.name, system: w.system, intensity: w.intensity, climbing: w.climbing, description: w.description }
}

/**
 * Applique la modulation à la semaine COURANTE (index 0).
 * - lighten : la 1re séance qualité devient un footing facile.
 * - progress : le 1er footing facile devient un tempo (stimulus en plus).
 * Pur (renvoie une copie). `applied = null` si rien à faire (ou taper/course).
 */
export function applyModulation(
  plan: TrainingPlan,
  adj: Adjustment,
): { plan: TrainingPlan; applied: AppliedModulation | null } {
  if (adj.direction === 'none' || plan.weeks.length === 0) return { plan, applied: null }
  const week0 = plan.weeks[0]
  if (week0.phase === 'taper' || week0.phase === 'race') return { plan, applied: null } // affûtage protégé

  const sessions = [...week0.sessions]
  let applied: AppliedModulation | null = null

  if (adj.direction === 'lighten') {
    const idx = sessions.findIndex(isQuality)
    if (idx >= 0) {
      const from = sessions[idx]
      sessions[idx] = swapSession(from, EASY_ID)
      applied = { direction: 'lighten', reason: adj.reason, dayOfWeek: from.dayOfWeek, fromTitle: from.title, toTitle: getWorkout(EASY_ID)!.name }
    }
  } else {
    const idx = sessions.findIndex((s) => s.workoutId === 'endurance_easy' || s.workoutId === 'recovery_jog')
    if (idx >= 0) {
      const from = sessions[idx]
      sessions[idx] = swapSession(from, PROGRESS_QUALITY_ID)
      applied = { direction: 'progress', reason: adj.reason, dayOfWeek: from.dayOfWeek, fromTitle: from.title, toTitle: getWorkout(PROGRESS_QUALITY_ID)!.name }
    }
  }

  if (!applied) return { plan, applied: null }
  const newWeek0: PlanWeek = { ...week0, sessions }
  return { plan: { ...plan, weeks: [newWeek0, ...plan.weeks.slice(1)] }, applied }
}
