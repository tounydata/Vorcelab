// Adaptateur : transforme un WorkoutTemplate (catalogue lib/coach, descriptif) en
// séance STRUCTURÉE chiffrée (blocs + allures) via le paceEngine + les fabriques
// de sessionGenerator. C'est la glue qui pose les vraies allures sur le catalogue
// existant (le moteur lib/coach n'a pas d'allures). Pur, déterministe.

import {
  easyRun, tempoRun, cruiseIntervals, vo2_30_30, vo2_15_15, vo2Reps,
  overUnder, racePaceRun, progressiveRun, descentRun, hillSession, strides, type Workout,
} from '../sessionGenerator'
import type { WorkoutTemplate } from './workouts'

// Structures SPÉCIFIQUES par séance (la spécificité ne doit pas être écrasée par
// un proxy générique du système). Prioritaire sur le mapping par système ci-dessous.
const BY_ID: Record<string, (vdot: number, t: WorkoutTemplate) => Workout> = {
  // Seuil
  tempo_long: (v) => tempoRun(v, 40),
  threshold_intervals: (v) => cruiseIntervals(v, 4, 8),
  threshold_cruise_short: (v) => cruiseIntervals(v, 5, 5),
  fartlek_seuil: (v) => cruiseIntervals(v, 6, 4, 60),
  fartlek: (v) => cruiseIntervals(v, 6, 3, 60),
  over_under: (v) => overUnder(v, 5),
  // VO2max — chaque format est distinct
  vo2_intervals: (v) => vo2_30_30(v, 12),
  billat_30_30: (v) => vo2_30_30(v, 12),
  billat_15_15: (v) => vo2_15_15(v, 20),
  vo2_1000: (v) => vo2Reps(v, 5, 3),
  vo2_800: (v) => vo2Reps(v, 6, 2.5),
  vo2_long_reps: (v) => vo2Reps(v, 5, 4),
  roche_1_1: (v) => vo2Reps(v, 8, 1),
  // Spécifique allure course
  marathon_pace: (v) => racePaceRun(v, 30, 'M'),
  race_marathon: (v) => racePaceRun(v, 30, 'M'),
  race_half: (v) => racePaceRun(v, 25, 'T'),
  race_10k: (v) => racePaceRun(v, 20, 'T'),
  race_5k: (v) => racePaceRun(v, 15, 'I'),
  canova_special: (v) => racePaceRun(v, 25, 'M'),
  canova_extensive: (v) => racePaceRun(v, 35, 'M'),
  // Sorties longues / progressives
  long_progressive: (v, t) => progressiveRun(v, t.baseDurationMin),
  progressive_run: (v, t) => progressiveRun(v, Math.min(50, t.baseDurationMin)),
  long_fast_finish: (v, t) => progressiveRun(v, t.baseDurationMin),
  // Côtes — objectif distinct selon la séance
  hill_repeats_short: (v) => hillSession('force', 8),
  hill_repeats_long: (v) => hillSession('puissance_aerobie', 6),
  hill_30_30: (v) => hillSession('puissance_aerobie', 10),
  threshold_hill: (v) => hillSession('seuil', 5),
  vo2_hill: (v) => hillSession('puissance_aerobie', 8),
  // Descente — durabilité excentrique (pilotée au ressenti)
  descent_long: (_v, t) => descentRun(t.baseDurationMin),
  downhill_technique: (_v, t) => descentRun(Math.min(40, t.baseDurationMin)),
}

/** Structure une séance chiffrée pour un template + le VDOT du coureur. */
export function structureWorkout(t: WorkoutTemplate, vdot: number): Workout {
  const specific = BY_ID[t.id]
  if (specific) return specific(vdot, t)

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
    case 'race_pace':
      // Spécifique allure course : bloc continu à allure marathon par défaut.
      return racePaceRun(vdot, Math.min(40, Math.max(15, Math.round(t.baseDurationMin * 0.4))), 'M')
    case 'vo2max':
      return vo2_30_30(vdot, 12)
    case 'speed':
      // Vitesse/économie : profil neuromusculaire (lignes droites), hors quota 80/20.
      return { type: 'strides', intent: 'Vitesse & économie : recrutement neuromusculaire, foulée vive.', blocks: [strides(8)], totalMin: t.baseDurationMin }
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
