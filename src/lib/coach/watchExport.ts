// Export d'une séance structurée vers une montre (Garmin/Coros/Apple Watch).
// 🌙 FONCTION DORMANTE : Vorcelab n'a aujourd'hui AUCUNE API d'export montre.
// La logique de conversion est codée et testée (prête pour le jour où une API
// existe), mais la livraison est désactivée (WATCH_EXPORT_ENABLED = false) et
// n'est jamais appelée par l'app. Cf. principe des fonctions dormantes (backlog).

import type { Workout, Block } from '../sessionGenerator'

/** 🌙 Dormant : aucune API d'export montre. Passera à true le jour où une API existe. */
export const WATCH_EXPORT_ENABLED = false

export type WatchTargetType = 'pace' | 'open'

export interface WatchStep {
  order: number
  label: string
  durationSec?: number
  repeat?: number
  targetType: WatchTargetType
  /** Allure cible (s/km) si targetType = 'pace'. */
  paceSecPerKm?: number
  /** Chaque step = un lap manuel → évite le piège de l'Auto-Lap (1 km) qui
   *  désaligne les blocs des séances structurées (cf. benchmark Garmin/Runna). */
  manualLap: true
}

export interface WatchWorkout {
  name: string
  steps: WatchStep[]
}

function targetOf(b: Block): { targetType: WatchTargetType; paceSecPerKm?: number } {
  if (typeof b.paceSecPerKm === 'number') return { targetType: 'pace', paceSecPerKm: b.paceSecPerKm }
  // Récup / côte (pilotée RPE) → effort libre.
  return { targetType: 'open' }
}

/** Convertit une séance Vorcelab en workout structuré « montre » (laps alignés sur les blocs). */
export function toWatchWorkout(workout: Workout, name: string): WatchWorkout {
  const steps: WatchStep[] = workout.blocks.map((b, i) => ({
    order: i + 1,
    label: b.label,
    durationSec: b.durationSec,
    repeat: b.reps && b.reps > 1 ? b.reps : undefined,
    ...targetOf(b),
    manualLap: true,
  }))
  return { name, steps }
}

/**
 * 🌙 Dormant : enverrait la séance à la montre via une API (inexistante).
 * Rejette tant que WATCH_EXPORT_ENABLED est false — n'est jamais appelée par l'app.
 */
export function sendToWatch(_workout: Workout): Promise<never> {
  return Promise.reject(new Error('Export montre indisponible : aucune API connectée (fonction dormante).'))
}
