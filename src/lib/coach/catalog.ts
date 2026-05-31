// Catalogue de séances proposées (choix-first) construit sur la bibliothèque
// existante (WORKOUTS) + l'adaptateur de structuration. Pur, testable.

import { WORKOUTS, type WorkoutTemplate } from './workouts'
import { structureWorkout } from './structureWorkout'
import type { Workout } from '../sessionGenerator'

export interface CatalogEntry {
  template: WorkoutTemplate
  workout: Workout
}

/**
 * Séances proposées au choix pour un VDOT donné.
 * Exclut le renfo (module dédié) et le jour de course ; n'inclut le trail-only
 * que si l'objectif est trail.
 */
export function buildWorkoutCatalog(vdot: number, opts?: { trail?: boolean }): CatalogEntry[] {
  return WORKOUTS
    .filter((t) => t.system !== 'strength' && t.system !== 'race')
    .filter((t) => (opts?.trail ? true : !t.trailOnly))
    .map((t) => ({ template: t, workout: structureWorkout(t, vdot) }))
}
