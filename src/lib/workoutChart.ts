// Profil d'intensité d'une séance (UI — écran de séance, tranche 1).
// Transforme un Workout (sessionGenerator) en barres : largeur = part de durée,
// hauteur = intensité de la zone. PURE géométrie, sans couleur ni React — la couche
// vue mappe zone → token de couleur du design (--vl-growth/amber/ember…).

import type { Block, Workout } from './sessionGenerator'
import type { PaceZone } from './paceEngine'

export interface ChartBar {
  label: string
  kind: Block['kind']
  zone?: PaceZone
  /** Part de la durée totale (%). La somme des barres ≈ 100. */
  widthPct: number
  /** Hauteur visuelle 0-100, encode l'intensité. */
  heightPct: number
}

/** Hauteur par zone d'allure (intensité croissante E→R). */
const ZONE_HEIGHT: Record<PaceZone, number> = { E: 25, M: 45, T: 65, I: 90, R: 100 }
const RECOVERY_HEIGHT = 15

function blockSeconds(b: Block): number {
  return (b.durationSec ?? 0) * (b.reps ?? 1)
}

function barHeight(b: Block): number {
  if (b.kind === 'recovery') return RECOVERY_HEIGHT
  if (b.zone) return ZONE_HEIGHT[b.zone]
  // Bloc sans zone d'allure (ex. côte, piloté au RPE) → hauteur dérivée du RPE.
  if (typeof b.rpe === 'number') return Math.min(100, Math.max(10, b.rpe * 10))
  return ZONE_HEIGHT.E
}

/**
 * Barres du profil d'intensité, une par bloc, dans l'ordre. Largeur proportionnelle
 * à la durée, hauteur à l'intensité. Retourne [] si la séance n'a aucune durée.
 */
export function workoutChartBars(workout: Workout): ChartBar[] {
  const total = workout.blocks.reduce((sum, b) => sum + blockSeconds(b), 0)
  if (total <= 0) return []
  return workout.blocks.map((b) => ({
    label: b.label,
    kind: b.kind,
    zone: b.zone,
    widthPct: +((blockSeconds(b) / total) * 100).toFixed(1),
    heightPct: barHeight(b),
  }))
}
