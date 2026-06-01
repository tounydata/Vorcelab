// Catalogue de séances proposées (choix-first) construit sur la bibliothèque
// existante (WORKOUTS) + l'adaptateur de structuration. Pur, testable.

import { getWorkout, type WorkoutTemplate } from './workouts'
import { structureWorkout } from './structureWorkout'
import type { Workout } from '../sessionGenerator'

export interface CatalogEntry {
  template: WorkoutTemplate
  workout: Workout
}

/**
 * Séances de LA SEMAINE décidées par l'algo (plan), présentées en choix-first.
 * Dé-doublonne par workoutId → un menu de séances distinctes à choisir librement.
 */
export function buildWeekCatalog(weekSessions: readonly { workoutId: string }[], vdot: number): CatalogEntry[] {
  const seen = new Set<string>()
  const entries: CatalogEntry[] = []
  for (const s of weekSessions) {
    if (seen.has(s.workoutId)) continue
    const t = getWorkout(s.workoutId)
    if (!t) continue
    seen.add(s.workoutId)
    entries.push({ template: t, workout: structureWorkout(t, vdot) })
  }
  return entries
}
