// Fenêtre moteur UNIQUE de six mois + sélection des activités (logique PURE + loader).
//
// Décision produit : le moteur utilise l'HISTORIQUE DISPONIBLE des six derniers mois,
// et cet historique comprend TOUTES les activités utiles — pas uniquement les
// compétitions. Chaque mécanisme sélectionne ENSUITE, à partir de cette fenêtre, les
// activités compatibles avec son propre calcul :
//   • charge d'entraînement    → toutes les activités sportives éligibles ;
//   • profil / VAM / PR running → toutes les courses à pied et trails ;
//   • ancrage / calibration     → compétitions CONFIRMÉES uniquement.
//
// Ce module est la SOURCE UNIQUE de la fenêtre et de ces règles, partagée web/mobile et
// benchmark. Aucune valeur « 180 / 183 / 190 / six mois » ne doit être dupliquée ailleurs.

import { validateRaceCandidate, type RaceCandidateInput } from './raceValidation'

/** Fenêtre GLOBALE du moteur : historique disponible des six derniers mois (jours). */
export const ENGINE_HISTORY_DAYS = 183

/** Fenêtre du PROFIL RÉCENT par pente (buckets/VAM/récup/dérive/forme récente, jours).
 *  Distincte de la fenêtre globale : le moteur reçoit six mois d'activités, mais le
 *  profil très détaillé par pente reste calculé sur cette fenêtre plus courte. */
export const RUNNER_PROFILE_WINDOW_DAYS = 56

const DAY_MS = 86_400_000

/** Colonnes RÉELLEMENT nécessaires au moteur (jamais `select('*')`). `raw_data` porte
 *  `workout_type` (Strava) et `average_temp` lus par le moteur. */
export const REQUIRED_ENGINE_COLUMNS = [
  'id',
  'user_id',
  'strava_activity_id',
  'name',
  'type',
  'sport_type',
  'start_date',
  'start_date_local',
  'distance',
  'moving_time',
  'elapsed_time',
  'total_elevation_gain',
  'average_speed',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
  'is_race',
  'raw_data',
  'deleted_at',
] as const

/** Liste de colonnes prête pour `supabase.select(...)`. */
export const ENGINE_COLUMNS_SELECT = REQUIRED_ENGINE_COLUMNS.join(',')

/** Activité telle que consommée par le moteur (superset compatible `Record<string, unknown>`). */
export interface EngineActivity {
  id?: string | number | null
  user_id?: string | null
  strava_activity_id?: string | number | null
  name?: string | null
  type?: string | null
  sport_type?: string | null
  start_date?: string | null
  start_date_local?: string | null
  distance?: number | null
  moving_time?: number | null
  elapsed_time?: number | null
  total_elevation_gain?: number | null
  average_speed?: number | null
  average_heartrate?: number | null
  max_heartrate?: number | null
  average_cadence?: number | null
  is_race?: boolean | null
  raw_data?: { workout_type?: number | string | null; average_temp?: number | null } | null
  deleted_at?: string | null
  [k: string]: unknown
}

/** Familles de course à pied / trail acceptées (running + trail). */
const RUN_SPORTS = new Set([
  'run',
  'trailrun',
  'trail run',
  'running',
  'virtualrun',
])

/** Vrai si l'activité est une course à pied ou un trail (par sport_type puis type). */
export function isRunningActivity(a: EngineActivity): boolean {
  const t = String(a.sport_type ?? a.type ?? '').toLowerCase()
  return RUN_SPORTS.has(t)
}

/** Bornes ISO de la fenêtre de six mois (borne haute STRICTE, borne basse inclusive). */
export function engineHistoryBounds(
  asOfMs?: number,
  historyDays: number = ENGINE_HISTORY_DAYS,
): { asOfISO: string; sinceISO: string; asOfMs: number; sinceMs: number } {
  const nowMs = asOfMs ?? Date.now()
  const sinceMs = nowMs - historyDays * DAY_MS
  return {
    asOfMs: nowMs,
    sinceMs,
    asOfISO: new Date(nowMs).toISOString(),
    sinceISO: new Date(sinceMs).toISOString(),
  }
}

/**
 * Sélection PURE de la fenêtre moteur de six mois, à une date de référence. Règles :
 *   • même athlète (si l'activité porte un `user_id`) ;
 *   • non supprimée (`deleted_at == null`) ;
 *   • date valide, STRICTEMENT antérieure à `asOfMs` (une course n'entre jamais dans
 *     sa propre projection) ;
 *   • dans la fenêtre `[asOfMs − historyDays j, asOfMs[`.
 * Résultat trié par date décroissante → DÉTERMINISTE pour un même `asOfMs`.
 */
export function selectEngineHistoryAtDate({
  activities,
  userId,
  asOfMs,
  historyDays = ENGINE_HISTORY_DAYS,
}: {
  activities: EngineActivity[]
  userId: string
  asOfMs: number
  historyDays?: number
}): EngineActivity[] {
  if (!Number.isFinite(asOfMs)) return []
  const lo = asOfMs - historyDays * DAY_MS
  return activities
    .filter((a) => {
      if (userId && a.user_id != null && String(a.user_id) !== String(userId)) return false
      if (a.deleted_at != null) return false
      if (!a.start_date) return false
      const d = Date.parse(a.start_date)
      if (Number.isNaN(d)) return false
      return d < asOfMs && d >= lo // borne haute STRICTE, borne basse inclusive
    })
    .sort((a, b) => Date.parse(b.start_date as string) - Date.parse(a.start_date as string))
}

/**
 * Activités éligibles à la CHARGE d'entraînement (signaux généraux : charge aiguë /
 * chronique, fatigue, fraîcheur, volume, régularité, récupération). Toutes les
 * activités sportives compatibles alimentent ces signaux — pas seulement le running.
 * On ne garde que celles ayant une durée réelle exploitable ; le calcul de charge gère
 * ENSUITE chaque sport via son coefficient de famille (vélo, aqua, renfo…).
 */
export function selectActivitiesForTrainingLoad(history: EngineActivity[]): EngineActivity[] {
  return history.filter((a) => {
    const moving = typeof a.moving_time === 'number' ? a.moving_time : 0
    const elapsed = typeof a.elapsed_time === 'number' ? a.elapsed_time : 0
    return moving > 0 || elapsed > 0
  })
}

/**
 * Activités de COURSE À PIED / TRAIL (footings, côtes, sorties longues, fractionnés,
 * entraînements trail, compétitions). Alimentent le profil par pente, la VAM, les
 * PR, la progression, etc. On n'exige JAMAIS `is_race === true` ici.
 */
export function selectRunningActivities(history: EngineActivity[]): EngineActivity[] {
  return history.filter(isRunningActivity)
}

function toRaceCandidate(a: EngineActivity): RaceCandidateInput {
  return {
    name: a.name ?? null,
    sportType: a.sport_type ?? null,
    type: a.type ?? null,
    startDate: a.start_date ?? null,
    distanceM: typeof a.distance === 'number' ? a.distance : null,
    movingTimeS: typeof a.moving_time === 'number' ? a.moving_time : null,
    elapsedTimeS: typeof a.elapsed_time === 'number' ? a.elapsed_time : null,
    totalElevationGainM: typeof a.total_elevation_gain === 'number' ? a.total_elevation_gain : null,
    isRace: a.is_race ?? null,
    workoutType: a.raw_data?.workout_type ?? null,
    deletedAt: a.deleted_at ?? null,
  }
}

/**
 * Vrai UNIQUEMENT pour une compétition CONFIRMÉE utilisable par les mécanismes
 * spécifiques aux courses (ancrage sur les performances, calibration personnelle de
 * pente, comparaison projection/résultat, cas du benchmark). Réutilise la logique de
 * `raceValidation.ts` : running/trail, explicitement course, non supprimée, date/temps/
 * vitesse/distance plausibles, ni échauffement/décrassage/footing, ni pending/rejected.
 * Un footing reste une activité valide pour le profil général — mais PAS ici.
 */
export function isEligiblePersonalCalibrationRace(activity: EngineActivity): boolean {
  return validateRaceCandidate(toRaceCandidate(activity)).status === 'confirmed'
}

/** Options du chargeur d'historique moteur (cf. `fetchEngineHistory`). */
export interface EngineHistoryQuery {
  /** Date de référence (défaut : maintenant en production). */
  asOfMs?: number
  /** Fenêtre en jours (défaut : ENGINE_HISTORY_DAYS). */
  historyDays?: number
}
