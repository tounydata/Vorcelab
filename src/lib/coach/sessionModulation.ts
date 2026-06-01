// Modulation v3 — adaptation AUTORÉGULÉE de la prochaine séance qualité selon le
// verdict de la dernière séance. On adapte la séance DE L'INTÉRIEUR (nombre de
// répétitions et/ou allure de la rép), pas en la remplaçant.
//
// Référence (autorégulation / RPE) : quand l'effort dépasse la cible, on réduit
// le VOLUME (reps) et/ou l'INTENSITÉ (allure) pour ramener l'effort dans la zone ;
// à l'inverse on progresse d'un cran. 100 % déterministe et borné (1 séance).

import type { Workout, Block } from '../sessionGenerator'
import type { SessionVerdict } from './sessionVerdict'

export type ModulationDir = 'lighten' | 'progress'
export interface Adjustment { direction: ModulationDir | 'none'; reason: string }

/** s/km : on assouplit l'allure de +8 (trop dur) ou on l'accélère de −5 (trop facile). */
const PACE_EASE = 8
const PACE_GAIN = 5
/** Plancher de répétitions : ne pas descendre sous 3 (la séance perd son sens). */
const MIN_REPS = 3

export function computeAdjustment(latest: SessionVerdict | null): Adjustment {
  if (latest === 'trop_dur') return { direction: 'lighten', reason: 'ta dernière séance a été jugée trop dure' }
  if (latest === 'trop_facile') return { direction: 'progress', reason: 'ta dernière séance a été jugée trop facile' }
  return { direction: 'none', reason: '' }
}

function recomputeTotalMin(blocks: Block[]): number {
  const sec = blocks.reduce((a, b) => a + (b.durationSec ?? 0) * (b.reps ?? 1), 0)
  return sec > 0 ? Math.round(sec / 60) : 0
}

/** Remplace le 1er nombre d'un label (« 6 × 400 m » → « 5 × 400 m »). */
function relabelReps(label: string, reps: number): string {
  return label.replace(/\d+/, String(reps))
}

const QUALITY_SYSTEMS = new Set(['tempo', 'threshold', 'vo2max', 'speed', 'hills', 'race_pace'])

/** workoutId de la 1re séance qualité d'une semaine (ou null). */
export function nextQualityWorkoutId(
  sessions: readonly { workoutId: string; system: string; intensity: string }[],
): string | null {
  const s = sessions.find((x) => x.intensity === 'hard' || QUALITY_SYSTEMS.has(x.system))
  return s?.workoutId ?? null
}

/**
 * Adapte une séance structurée À L'INTÉRIEUR, avec UN SEUL levier — autorégulation
 * (Daniels : changer une variable à la fois, « le moins de travail utile ») :
 * - séance FRACTIONNÉE → levier VOLUME : ±~20 % de répétitions (plancher 3).
 *   lighten = −reps (ex. 6×400 → 5×400) ; progress = +1 rep.
 * - séance CONTINUE → levier INTENSITÉ : allure (lighten +8 s/km / progress −5 s/km).
 * Renvoie la séance modifiée + un résumé lisible. Pur (copie).
 */
export function scaleWorkout(w: Workout, dir: ModulationDir): { workout: Workout; summary: string } {
  const blocks = w.blocks.map((b) => ({ ...b }))
  const repBlock = blocks.find((b) => b.kind === 'main' && (b.reps ?? 1) > 1)
  let summary: string

  if (repBlock) {
    // Levier VOLUME (le plus lisible) : on coupe ~20 % des reps (plancher 3) ou +1.
    const oldReps = repBlock.reps ?? 1
    const newReps = dir === 'lighten'
      ? Math.max(MIN_REPS, oldReps - Math.max(1, Math.round(oldReps * 0.2)))
      : oldReps + 1
    for (const b of blocks) {
      if (b.kind === 'main' && (b.reps ?? 1) > 1) {
        b.reps = newReps
        b.label = relabelReps(b.label, newReps)
      } else if (b.kind === 'recovery' && typeof b.reps === 'number') {
        if (b.reps === oldReps) b.reps = newReps
        else if (b.reps === oldReps - 1) b.reps = Math.max(0, newReps - 1)
      }
    }
    summary = `${oldReps} → ${newReps} reps`
  } else {
    // Levier INTENSITÉ (séance continue) : on assouplit / accélère l'allure.
    const delta = dir === 'lighten' ? PACE_EASE : -PACE_GAIN
    for (const b of blocks) {
      if (b.kind === 'main' && typeof b.paceSecPerKm === 'number') b.paceSecPerKm += delta
    }
    summary = dir === 'lighten' ? `allure +${PACE_EASE} s/km` : `allure −${PACE_GAIN} s/km`
  }

  const workout: Workout = { ...w, blocks, totalMin: recomputeTotalMin(blocks) || w.totalMin }
  return { workout, summary }
}
