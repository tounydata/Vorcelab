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
 * Adapte une séance structurée À L'INTÉRIEUR :
 * - lighten : −1 répétition (blocs fractionnés, plancher 3) ET allure +8 s/km ;
 *   séance continue (sans reps) → allure +8 s/km et durée −20 %.
 * - progress : +1 répétition ET allure −5 s/km.
 * Renvoie la séance modifiée + un résumé lisible. Pur (copie).
 */
export function scaleWorkout(w: Workout, dir: ModulationDir): { workout: Workout; summary: string } {
  const blocks = w.blocks.map((b) => ({ ...b }))
  const repBlock = blocks.find((b) => b.kind === 'main' && (b.reps ?? 1) > 1)
  const parts: string[] = []

  if (repBlock) {
    const oldReps = repBlock.reps ?? 1
    const newReps = dir === 'lighten' ? Math.max(MIN_REPS, oldReps - 1) : oldReps + 1
    if (newReps !== oldReps) {
      for (const b of blocks) {
        if (b.kind === 'main' && (b.reps ?? 1) > 1) {
          b.reps = newReps
          b.label = relabelReps(b.label, newReps)
        } else if (b.kind === 'recovery' && typeof b.reps === 'number') {
          if (b.reps === oldReps) b.reps = newReps
          else if (b.reps === oldReps - 1) b.reps = Math.max(0, newReps - 1)
        }
      }
      parts.push(`${oldReps} → ${newReps} reps`)
    }
  }

  // Allure des blocs « main » chiffrés.
  const delta = dir === 'lighten' ? PACE_EASE : -PACE_GAIN
  let paceChanged = false
  for (const b of blocks) {
    if (b.kind === 'main' && typeof b.paceSecPerKm === 'number') {
      b.paceSecPerKm += delta
      paceChanged = true
    }
  }
  if (paceChanged) parts.push(dir === 'lighten' ? `allure +${PACE_EASE} s/km` : `allure −${PACE_GAIN} s/km`)

  // Séance continue (sans reps) trop dure : on réduit aussi la durée.
  if (!repBlock && dir === 'lighten') {
    for (const b of blocks) {
      if (b.kind === 'main' && typeof b.durationSec === 'number') {
        b.durationSec = Math.max(300, Math.round((b.durationSec * 0.8) / 60) * 60)
      }
    }
    parts.push('durée réduite')
  }

  const workout: Workout = { ...w, blocks, totalMin: recomputeTotalMin(blocks) || w.totalMin }
  const summary = parts.length ? parts.join(' · ') : dir === 'lighten' ? 'allégée' : 'renforcée'
  return { workout, summary }
}
