// src/lib/coach/adaptCatalog.ts
// Moteur d'ADAPTATION AU PROFIL (déterministe, 100 % pur — aucune IA).
// Filtre + score la bibliothèque WORKOUTS selon le profil du coureur :
// niveau × distance cible × terrain (route/trail) × points faibles × phase.
//
// Fidèle à docs/coach/session-library.md §A-G (gating niveau, priorité par
// distance, boost point faible, garde-fous). Sert de socle au plan (qualityPool)
// et au catalogue choix-first.

import {
  WORKOUTS, type WorkoutTemplate, type WorkoutSystem, type Level,
  type DistanceFocus, type Phase, type WorkoutTarget, type Terrain,
} from './workouts'

export interface AdaptProfile {
  /** Niveau d'expérience (gating de sécurité). */
  level: Level
  /** Distance cible de l'objectif. */
  distance: DistanceFocus
  /** Course trail (true) ou route (false). */
  trail: boolean
  /** Phase d'entraînement courante. */
  phase: Phase
  /** Points faibles détectés (issus de runnerProfile). Le levier le plus fort. */
  weaknesses?: WorkoutTarget[]
  /** Terrains réellement accessibles au coureur (faisabilité). */
  terrainAvailable?: Terrain[]
  /** Nb de séances « dures » déjà placées dans la semaine (pénalité anti-surcharge). */
  qualityDensity?: number
}

export interface ScoredWorkout {
  template: WorkoutTemplate
  score: number
  reasons: string[]
}

/** Systèmes prioritaires par distance cible (session-library §B). */
const DISTANCE_PRIORITY_SYSTEMS: Record<DistanceFocus, WorkoutSystem[]> = {
  '5k': ['vo2max', 'speed', 'race_pace'],
  '10k': ['vo2max', 'threshold', 'race_pace'],
  half: ['threshold', 'race_pace'],
  marathon: ['race_pace', 'long', 'tempo'],
  ultra: ['long', 'hills', 'descent'],
}

/** Déduit la distance cible depuis la distance de course (km). */
export function distanceFocusFromKm(km: number): DistanceFocus {
  if (km <= 7) return '5k'
  if (km <= 15) return '10k'
  if (km <= 30) return 'half'
  if (km <= 45) return 'marathon'
  return 'ultra'
}

/**
 * Une séance trailOnly est admissible sur route uniquement si le coureur a le
 * terrain ad hoc ET un point faible montée/descente à corriger (exception §C).
 */
function trailExceptionAllowed(t: WorkoutTemplate, p: AdaptProfile): boolean {
  const terr = p.terrainAvailable ?? []
  const hasTerrain = terr.includes('uphill') || terr.includes('downhill')
  const wk = p.weaknesses ?? []
  const wantsClimbDesc = wk.includes('climbing') || wk.includes('descending')
  return hasTerrain && wantsClimbDesc
}

/** Une séance passe-t-elle les filtres durs (gating) ? */
export function isEligible(t: WorkoutTemplate, p: AdaptProfile): boolean {
  if (!t.levels.includes(p.level)) return false          // gating niveau
  if (!t.phases.includes(p.phase)) return false          // filtre phase
  if (t.trailOnly && !p.trail && !trailExceptionAllowed(t, p)) return false // route/trail
  return true
}

/** Score d'adéquation d'une séance au profil (session-library §F). */
function scoreWorkout(t: WorkoutTemplate, p: AdaptProfile): ScoredWorkout {
  const reasons: string[] = []
  let score = 0

  if (t.distances.includes(p.distance)) {
    score += 3
    reasons.push(`distance ${p.distance}`)
  }
  if (DISTANCE_PRIORITY_SYSTEMS[p.distance].includes(t.system)) {
    score += 2
    reasons.push(`système prioritaire ${t.system}`)
  }
  const weaknesses = p.weaknesses ?? []
  if (weaknesses.includes(t.target)) {
    score += 4 // levier le plus fort
    reasons.push(`point faible ${t.target}`)
  }
  if (p.trail && (t.terrain === 'uphill' || t.terrain === 'downhill')) {
    score += 2
    reasons.push('terrain trail')
  }
  const terr = p.terrainAvailable
  if (!terr || t.terrain === 'any' || terr.includes(t.terrain)) {
    score += 1
    reasons.push('terrain faisable')
  }
  if (t.intensity === 'hard' && p.qualityDensity) {
    score -= p.qualityDensity // anti-surcharge (garde-fou 80/20)
    reasons.push(`-${p.qualityDensity} densité qualité`)
  }
  return { template: t, score, reasons }
}

/**
 * Catalogue adapté au profil : séances éligibles, triées par score décroissant
 * (tri stable par id pour le déterminisme). N'inclut PAS les séances filtrées.
 */
export function adaptCatalog(p: AdaptProfile): ScoredWorkout[] {
  return WORKOUTS
    .filter((t) => isEligible(t, p))
    .map((t) => scoreWorkout(t, p))
    .sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id))
}

/** Top N ids des séances les plus adaptées (pour le plan / la sélection qualité). */
export function topAdaptedIds(p: AdaptProfile, n: number): string[] {
  return adaptCatalog(p).slice(0, n).map((s) => s.template.id)
}
