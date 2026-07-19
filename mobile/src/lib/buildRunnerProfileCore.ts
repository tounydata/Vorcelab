// Module PUR partagé de construction du profil coureur (§1).
//
// UNE seule implémentation, sans dépendance navigateur ni Supabase, composée des primitives
// pures existantes :
//   • buildRunnerProfileAtDate  → buckets de pente / récupération / dérive cardiaque (56 j) ;
//   • buildAthleteBestEfforts   → records découplés / vitesse critique / meilleure ascension
//                                 / courbe verticale (fenêtre longue mémoire, 183 j) ;
//   • buildProfileSchemaMeta    → en-tête de schéma commun (versionnement + provenance).
//
// Destiné à être appelé À L'IDENTIQUE par le web, le mobile, le benchmark et l'Edge Function
// → garantit qu'ils produisent EXACTEMENT le même contrat (cf. tests/profileContract).
//
// Deux entrées :
//   • buildRunnerProfileFromActivitiesAndStreams(...) : calcule tout depuis activités+streams ;
//   • assembleRunnerProfile(...) : assemble un profil complet à partir de sous-résultats DÉJÀ
//     calculés (évite de recalculer quand l'appelant a déjà atDate + bestEfforts sous la main).

import { buildRunnerProfileAtDate, type ProfileActivityAtDate, type RawStreamSet } from './runnerProfileAtDate'
import {
  buildAthleteBestEfforts,
  type BestEffortActivity,
  type BestEffortStreams,
  type AthleteBestEfforts,
} from './bestEfforts'
import { buildProfileSchemaMeta } from './runnerProfileSchema'
import { ENGINE_HISTORY_DAYS, RUNNER_PROFILE_WINDOW_DAYS } from './engineHistory'
import type { RunnerProfileComputed } from './runnerProfile'

export interface BuildRunnerProfileCoreInput {
  /** Activités (résumés) de la fenêtre longue mémoire (183 j), antérieures à `asOfMs`. */
  activities: ProfileActivityAtDate[]
  /** Streams par String(strava_activity_id). */
  streamsByActivityId: Record<string, RawStreamSet>
  /** FC max résolue (la cascade FCmax est faite par l'appelant). */
  fcMax: number
  /** Horloge de référence (ms). Production = maintenant ; benchmark = départ de la course. */
  asOfMs: number
  /** Fenêtre du profil détaillé par pente (jours). Défaut 56. */
  detailedProfileDays?: number
  /** Fenêtre d'historique moteur (jours), portée par le schéma. Défaut 183. */
  historyDays?: number
  /** Désactive les records auto (pour l'A/B déterministe du benchmark). */
  disableStreamBestEfforts?: boolean
}

/** Type de retour : le contrat complet, engine-critical, avec en-tête de schéma. */
export type RunnerProfileContract = RunnerProfileComputed & {
  schemaVersion: string
  computedAt: string
  asOfAt: string
  historyDays: number
  detailedProfileDays: number
}

/**
 * Assemble un profil au CONTRAT complet à partir de sous-résultats déjà calculés. Pur, sans
 * recalcul. Utilisé par les appelants qui disposent déjà de `atDateProfile` + `bestEfforts`
 * (ex. benchmark), pour garantir un assemblage IDENTIQUE à l'entrée « from activities ».
 */
export function assembleRunnerProfile(input: {
  atDateProfile: RunnerProfileComputed
  bestEfforts: Pick<AthleteBestEfforts, 'records' | 'criticalSpeed' | 'bestClimb' | 'bestClimbByTier'>
  asOfMs: number
  historyDays?: number
  detailedProfileDays?: number
}): RunnerProfileContract {
  const historyDays = input.historyDays ?? ENGINE_HISTORY_DAYS
  const detailedProfileDays = input.detailedProfileDays ?? RUNNER_PROFILE_WINDOW_DAYS
  return {
    ...buildProfileSchemaMeta({ computedAtMs: input.asOfMs, asOfMs: input.asOfMs, historyDays, detailedProfileDays }),
    ...input.atDateProfile,
    bestEfforts: input.bestEfforts.records,
    criticalSpeed: input.bestEfforts.criticalSpeed,
    bestClimb: input.bestEfforts.bestClimb,
    bestClimbByTier: input.bestEfforts.bestClimbByTier,
  }
}

/**
 * Construit le profil coureur COMPLET (contrat engine-critical) depuis les activités et leurs
 * streams. 100 % pur → même sortie sur web / mobile / benchmark / Edge Function.
 */
export function buildRunnerProfileFromActivitiesAndStreams(
  input: BuildRunnerProfileCoreInput,
): RunnerProfileContract {
  const detailedProfileDays = input.detailedProfileDays ?? RUNNER_PROFILE_WINDOW_DAYS
  const historyDays = input.historyDays ?? ENGINE_HISTORY_DAYS
  const asOfIso = new Date(input.asOfMs).toISOString()

  // Buckets de pente / récupération / dérive : fenêtre récente (detailedProfileDays).
  const atDateProfile = buildRunnerProfileAtDate({
    activities: input.activities,
    activityStreams: input.streamsByActivityId,
    fcMax: input.fcMax,
    asOfDate: asOfIso,
    windowDays: detailedProfileDays,
  })

  // Records / vitesse critique / ascension : longue mémoire (toute la liste fournie = 183 j).
  const bestEfforts: AthleteBestEfforts = input.disableStreamBestEfforts
    ? { records: [], criticalSpeed: null, bestClimb: null, bestClimbByTier: {}, activitiesUsed: 0 }
    : buildAthleteBestEfforts(
        input.activities as unknown as BestEffortActivity[],
        input.streamsByActivityId as unknown as Record<string, BestEffortStreams>,
      )

  return assembleRunnerProfile({ atDateProfile, bestEfforts, asOfMs: input.asOfMs, historyDays, detailedProfileDays })
}
