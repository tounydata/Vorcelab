// Catalogue de séances — génère les séances proposées (choix-first) pour un VDOT.
// Noms DESCRIPTIFS CLAIRS (DA Vorcelab, pas de naming créatif). Pur, testable.

import { easyRun, tempoRun, cruiseIntervals, vo2_30_30, hillSession, type Workout } from './sessionGenerator'
import type { SessionCategory } from './sessionRecommender'

/** Libellés descriptifs clairs (pas de noms créatifs). */
export const CATEGORY_LABEL: Record<SessionCategory, string> = {
  recovery: 'Récupération',
  easy: 'Footing facile',
  long: 'Sortie longue',
  tempo: 'Tempo — seuil',
  cruise: 'Seuil fractionné',
  vo2: 'VO2max 30/30',
  hill: 'Côtes',
  race_pace: 'Allure course',
}

/** Difficulté 1-5 (points) par catégorie. */
export const CATEGORY_DIFFICULTY: Record<SessionCategory, number> = {
  recovery: 1, easy: 1, long: 3, tempo: 3, cruise: 3, race_pace: 3, vo2: 4, hill: 4,
}

export interface CatalogEntry {
  category: SessionCategory
  label: string
  difficulty: number
  workout: Workout
}

// Catégories disposant d'un générateur (race_pace ajouté plus tard).
const GENERATORS: Partial<Record<SessionCategory, (vdot: number) => Workout>> = {
  recovery: (v) => easyRun(v, 30),
  easy: (v) => easyRun(v, 45),
  long: (v) => easyRun(v, 90),
  tempo: (v) => tempoRun(v, 20),
  cruise: (v) => cruiseIntervals(v, 5, 6),
  vo2: (v) => vo2_30_30(v, 12),
  hill: () => hillSession('force', 8),
}

/** Catalogue de séances générées pour un VDOT donné. */
export function buildCatalog(vdot: number): CatalogEntry[] {
  return (Object.keys(GENERATORS) as SessionCategory[]).map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    difficulty: CATEGORY_DIFFICULTY[category],
    workout: GENERATORS[category]!(vdot),
  }))
}
