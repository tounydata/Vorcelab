// Adaptateur : transforme un WorkoutTemplate (catalogue lib/coach, descriptif) en
// séance STRUCTURÉE chiffrée (blocs + allures) via le paceEngine + les fabriques
// de sessionGenerator. C'est la glue qui pose les vraies allures sur le catalogue
// existant (le moteur lib/coach n'a pas d'allures). Pur, déterministe.

import {
  easyRun, tempoRun, cruiseIntervals, vo2_30_30, hillSession, type Workout,
} from '../sessionGenerator'
import type { WorkoutTemplate } from './workouts'

/** Structure une séance chiffrée pour un template + le VDOT du coureur. */
export function structureWorkout(t: WorkoutTemplate, vdot: number): Workout {
  switch (t.system) {
    case 'endurance':
    case 'recovery':
    case 'long':
      return easyRun(vdot, t.baseDurationMin)
    case 'tempo':
      // Bloc continu au seuil, plafonné pour rester raisonnable.
      return tempoRun(vdot, Math.min(40, Math.max(15, Math.round(t.baseDurationMin * 0.5))))
    case 'threshold':
      return cruiseIntervals(vdot, 4, 8)
    case 'vo2max':
      return vo2_30_30(vdot, 12)
    case 'hills':
      return hillSession('force', 10)
    case 'descent':
    case 'strength':
    case 'race':
    default:
      // Représentation simple (édge cases trail/renfo/jour J) — l'identité vient du template.
      return easyRun(vdot, t.baseDurationMin)
  }
}
