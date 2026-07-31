// Persistance du verdict de détection de course (logique PURE, testable, sans IO).
//
// Pourquoi : `detectRace` / `validateRaceCandidate` tournent aujourd'hui EN MÉMOIRE, au
// moment de la projection (`computeRaceProjection` → `isEligiblePersonalCalibrationRace`).
// Le verdict n'est écrit nulle part. Conséquence mesurée en prod : trois athlètes
// cumulent 501, 662 et 677 sorties à pied avec ZÉRO course en base, alors que le
// détecteur en reconnaît une trentaine. On ne peut donc ni les compter, ni les auditer,
// ni les servir au banc de validation — le seul échantillon disponible reste les 12
// courses étiquetées à la main.
//
// Ce module produit les lignes à persister. Il ne décide RIEN de neuf : il applique
// `validateRaceCandidate`, exactement la règle que le moteur utilise déjà.
//
// ── Ce que ce module NE fait PAS ─────────────────────────────────────────────────
// Il ne modifie AUCUNE projection. Le moteur continue de recalculer son verdict en
// mémoire au moment de la projection ; les colonnes persistées servent à OBSERVER et à
// alimenter le banc. `ENGINE_VERSION` est donc volontairement inchangé — aucune
// projection affichée à un athlète ne bouge à cause de ce lot.
//
// ── Une différence de PÉRIMÈTRE, assumée et tracée ───────────────────────────────
// En production, le rang de FC est calculé sur la FENÊTRE MOTEUR (183 j), car c'est le
// seul historique que la projection charge. Ici on le calcule sur TOUT l'historique de
// course à pied de l'athlète : le but est de qualifier des courses de 2018 à aujourd'hui
// pour le banc, ce qu'une fenêtre de six mois rend impossible. Le rang reste donc
// comparable d'une année sur l'autre pour un même athlète. Ce périmètre est inscrit dans
// `RACE_DETECTION_VERSION` pour qu'une ligne persistée dise toujours comment elle a été
// obtenue.

import { buildHrPercentileLookup } from './raceDetection.ts'
import { validateRaceCandidate, type RaceValidationStatus } from './raceValidation.ts'

/**
 * Version du verdict persisté = règle de détection + PÉRIMÈTRE du rang de FC.
 * À incrémenter dès que l'un des deux change, pour pouvoir re-qualifier les lignes
 * obtenues sous une règle antérieure sans les confondre avec les nouvelles.
 */
export const RACE_DETECTION_VERSION = '2026.07-31+trail-vocabulary'

/** Familles de sport dont la FC alimente la distribution personnelle de l'athlète. */
const RUN_SPORTS = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])

/** Activité telle que lue en base (sous-ensemble strictement nécessaire au verdict). */
export interface DetectionActivity {
  strava_activity_id: number | string
  name?: string | null
  type?: string | null
  sport_type?: string | null
  start_date?: string | null
  distance?: number | null
  moving_time?: number | null
  elapsed_time?: number | null
  average_heartrate?: number | null
  is_race?: boolean | null
  raw_data?: { workout_type?: number | string | null } | null
  deleted_at?: string | null
  /** Verdict DÉJÀ persisté, pour n'écrire que ce qui change (cf. `changedRows`). */
  race_detection_status?: string | null
  race_detection_version?: string | null
}

/** Ligne prête à être écrite dans `strava_activities` (colonnes serveur uniquement). */
export interface RaceDetectionRow {
  stravaActivityId: number | string
  status: RaceValidationStatus
  /** Codes machine anonymisés (jamais de nom d'activité, jamais de coordonnée). */
  reasons: string[]
  version: string
  /** Vrai si l'athlète avait coché « course » sur Strava (ou workout_type = 1). */
  labeled: boolean
}

function isRunSport(a: DetectionActivity): boolean {
  const sport = (a.sport_type ?? a.type ?? '').toLowerCase()
  return RUN_SPORTS.has(sport)
}

function isLabeled(a: DetectionActivity): boolean {
  if (a.is_race === true) return true
  const wt = a.raw_data?.workout_type
  return wt === 1 || wt === '1'
}

/**
 * Calcule le verdict de chaque activité CANDIDATE d'un athlète.
 *
 * Deux périmètres distincts, comme en production :
 *   • `hrSamples` — toutes les sorties à pied de l'athlète : c'est la distribution de FC
 *     dans laquelle chaque effort est classé. Passer ici l'historique le plus large
 *     possible, indépendamment des candidates réellement évaluées.
 *   • `candidates` — les activités à qualifier.
 *
 * Il faut au moins 10 valeurs de FC exploitables, sans quoi `buildHrPercentileLookup`
 * renvoie `null` et la détection s'abstient : un athlète sans cardio ne verra jamais une
 * course inventée, il restera simplement en `pending`.
 */
export function buildRaceDetectionRows(
  candidates: DetectionActivity[],
  hrSamples: DetectionActivity[] = candidates,
): RaceDetectionRow[] {
  const hrPercentileOf = buildHrPercentileLookup(
    hrSamples.filter(isRunSport).map((a) => ({ averageHeartrate: a.average_heartrate })),
  )
  return candidates.map((a) => {
    const { status, reasons } = validateRaceCandidate({
      name: a.name,
      sportType: a.sport_type,
      type: a.type,
      startDate: a.start_date,
      distanceM: a.distance,
      movingTimeS: a.moving_time,
      elapsedTimeS: a.elapsed_time,
      isRace: a.is_race,
      workoutType: a.raw_data?.workout_type,
      deletedAt: a.deleted_at,
      hrPercentile: hrPercentileOf(a.average_heartrate),
    })
    return {
      stravaActivityId: a.strava_activity_id,
      status,
      reasons,
      version: RACE_DETECTION_VERSION,
      labeled: isLabeled(a),
    }
  })
}

/**
 * Ne conserve que les lignes dont le verdict OU la version diffère de ce qui est déjà en
 * base — une exécution qui ne change rien ne doit produire AUCUNE écriture (le job est
 * réexécutable en boucle sans faire tourner la table ni ses index inutilement).
 */
export function changedRows(
  activities: DetectionActivity[],
  rows: RaceDetectionRow[],
): RaceDetectionRow[] {
  const previous = new Map(
    activities.map((a) => [
      String(a.strava_activity_id),
      { status: a.race_detection_status ?? null, version: a.race_detection_version ?? null },
    ]),
  )
  return rows.filter((r) => {
    const before = previous.get(String(r.stravaActivityId))
    if (!before) return true
    return before.status !== r.status || before.version !== r.version
  })
}

/** Compteurs d'un passage, pour le journal du job (aucune donnée personnelle). */
export interface RaceDetectionSummary {
  analysed: number
  confirmed: number
  pending: number
  rejected: number
  /** Compétitions confirmées que l'athlète n'avait PAS étiquetées — le gain réel. */
  confirmedUnlabeled: number
  labeled: number
}

export function summarizeRaceDetection(rows: RaceDetectionRow[]): RaceDetectionSummary {
  const count = (p: (r: RaceDetectionRow) => boolean) => rows.filter(p).length
  return {
    analysed: rows.length,
    confirmed: count((r) => r.status === 'confirmed'),
    pending: count((r) => r.status === 'pending'),
    rejected: count((r) => r.status === 'rejected'),
    confirmedUnlabeled: count((r) => r.status === 'confirmed' && !r.labeled),
    labeled: count((r) => r.labeled),
  }
}
