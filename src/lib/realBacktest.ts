// Orchestration PURE du banc de validation réel : pour chaque course, filtre les
// activités antérieures (anti-fuite), reconstruit le GPX, reconstruit le profil
// « d'époque », appelle le VRAI moteur `computeRaceProjection`, puis compare au réel.
//
// Aucune IO ici (Supabase/FS vivent dans scripts/run-real-engine-backtest.ts) → tout
// est testable et DÉTERMINISTE. Les identifiants sont PSEUDONYMISÉS : les lignes
// publiques ne contiennent ni UUID brut, ni nom, ni coordonnées GPS.

import { computeRaceProjection, type GpxPoint } from './computeRaceProjection'
import type { TerrainWeather } from './terrain'
import { reconstructGpx, type RawStreams } from './gpxReconstruct'
import { smoothElevationProfile } from './elevationProfile'
import { buildRunnerProfileAtDate, type RawStreamSet } from './runnerProfileAtDate'
import { computeErrorMetrics, distanceBucket, dplusBucket, type ErrorMetrics } from './engineBacktest'
import { computeBaselineMetrics, type BaselineMetrics, type BaselineRaceInput } from './backtestBaselines'
import { clusteredBootstrap, type ClusteredBootstrapResult, type BootstrapPoint } from './backtestBootstrap'
import { assembleRunnerProfile } from './buildRunnerProfileCore'
import { ENGINE_VERSION, stampProjection, type ProjectionSourceContribution } from './engineVersion'
import { resolveFcMaxWithSource, type FcMaxSource } from './fcMax'
import {
  ENGINE_HISTORY_DAYS,
  RUNNER_PROFILE_WINDOW_DAYS,
  selectEngineHistoryAtDate,
  type EngineActivity,
} from './engineHistory'
import {
  buildAthleteBestEfforts,
  type BestEffortActivity,
  type BestEffortStreams,
} from './bestEfforts'

/** Version du profil « d'époque » (buildRunnerProfileAtDate). À incrémenter si sa
 *  logique de calcul change. Reliée à chaque ligne du rapport.
 *  atDate-2026.07-2 : records porteurs de provenance (§7) + garde-fous de confiance de
 *  la durabilité personnelle (§6, R²/activités distinctes) → l'activation du fade change. */
export const PROFILE_VERSION = 'atDate-2026.07-2'

// ── Entrées ────────────────────────────────────────────────────────────────────

export interface BacktestActivity {
  id: string
  user_id: string
  strava_activity_id: string | number
  name?: string | null
  type?: string | null
  sport_type?: string | null
  start_date: string
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
  workout_type?: number | string | null
  average_temp?: number | null
  deleted_at?: string | null
}

/**
 * Référence altimétrique du parcours pour la projection :
 *   • `gpx_only`             → lissage du GPX SEUL, aucun recalage → reproduit la
 *     production quand aucun D+ officiel n'est connu (MÉTRIQUE PRINCIPALE) ;
 *   • `official_course_dplus`→ recalage sur un D+ OFFICIEL connu AVANT la course
 *     (saisi dans race_calendar, valeur organisateur, métadonnée du parcours) ;
 *   • `post_race_strava_dplus`→ recalage sur le D+ Strava obtenu APRÈS la course —
 *     DIAGNOSTIC de qualité du lissage uniquement, JAMAIS la métrique principale.
 */
export type ElevationReferenceMode =
  | 'gpx_only'
  | 'official_course_dplus'
  | 'post_race_strava_dplus'

export interface RaceCaseInput {
  race: BacktestActivity
  /** Streams bruts de la course (pour reconstruire le GPX). */
  raceStreams: RawStreams | null
  /** Toutes les activités connues (tous athlètes) — filtrées par athlète + date ici. */
  allActivities: BacktestActivity[]
  /** Streams des activités antérieures, par String(strava_activity_id) (profil d'époque). */
  priorStreams: Record<string, RawStreamSet>
  /** FCmax SAISIE au profil de l'athlète (null si absente) — sert la cascade FCmax. */
  fcMax: number | null
  /** Âge (ans) de l'athlète, pour le fallback « 220 − âge » quand ni saisie ni Strava. */
  athleteAge?: number | null
  hasWeather: boolean
  weather?: TerrainWeather | null
  /** Présence d'un stream FC sur la course (indicateur de rapport ; la FC de course
   *  n'est pas consommée par le moteur). Défaut : présence de `raceStreams.heartrate`. */
  hasHr?: boolean
  /** Surfaces OSM par section (rarement dispo) → terrain. */
  surfaces?: (string | null)[] | null
  windowDays?: number
  /** Mode de référence altimétrique (défaut : `gpx_only` = parité production). */
  elevationReferenceMode?: ElevationReferenceMode
  /** D+ OFFICIEL connu AVANT la course (m), si disponible — sinon null. */
  officialDplusM?: number | null
  /** Désactive les records auto (streams) — pour comparer AVANT/APRÈS dans un même banc. */
  disableStreamBestEfforts?: boolean
}

// ── Pseudonymisation (déterministe, non nominative) ─────────────────────────────

/** FNV-1a 32 bits → base36. Stable, sans secret, suffisant pour anonymiser un id. */
export function shortHash(raw: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(7, '0').slice(0, 7)
}

// ── Sortie ──────────────────────────────────────────────────────────────────────

export type ProfileQuality = 'rich' | 'partial' | 'none'

/** Qualité de la couverture des streams historiques AVANT la course. */
export type HistoricalDataQuality = 'poor' | 'partial' | 'good'

/** Classe d'arrêt : écart elapsed − moving faible (normal) ou important (large). */
export type StopClass = 'normal' | 'large'

export interface BacktestRow {
  race_id: string
  athlete_id: string
  date: string
  /** Date/événement de regroupement pour le leave-one-date-out (jour de la course). */
  event_key: string
  sport: 'road' | 'trail'
  distance_km: number
  dplus_m: number
  dplus_per_km: number
  // ── Temps réels (les deux références) ────────────────────────────────────────
  /** Temps en mouvement (moving_time) — métrique sportive secondaire. */
  actual_moving_s: number
  /** Temps écoulé (elapsed_time) — métrique PRINCIPALE (heure d'arrivée réelle). */
  actual_elapsed_s: number | null
  /** Alias historique de `actual_moving_s` (compat CSV/tests). */
  actual_s: number
  predicted_s: number
  low_s: number
  high_s: number
  // ── Erreurs vs moving / vs elapsed ───────────────────────────────────────────
  error_vs_moving_s: number
  error_vs_elapsed_s: number | null
  error_vs_moving_pct: number
  error_vs_elapsed_pct: number | null
  /** Alias historique (= erreur vs moving). */
  error_s: number
  absolute_error_s: number
  error_pct: number
  /** Écart arrêts (elapsed − moving). */
  stop_gap_s: number | null
  stop_gap_pct: number | null
  stop_class: StopClass | null
  inside_interval: boolean
  inside_interval_elapsed: boolean | null
  confidence: string
  // ── Contrôle du D+ (brut / lissé / Strava) ───────────────────────────────────
  stored_dplus_m: number | null
  raw_gpx_dplus_m: number
  smoothed_gpx_dplus_m: number
  dplus_calibration_ratio: number
  dplus_was_calibrated: boolean
  // ── Référence altimétrique explicite (parité production vs diagnostic) ────────
  /** D+ du GPX lissé SANS recalage (parité production). */
  gpx_only_dplus_m: number
  /** D+ officiel connu avant la course (m), ou null si inconnu. */
  official_dplus_m: number | null
  /** D+ Strava post-course (m), ou null — DIAGNOSTIC uniquement. */
  post_race_strava_dplus_m: number | null
  /** Mode réellement utilisé pour alimenter le moteur sur cette course. */
  elevation_reference_mode: ElevationReferenceMode
  // ── Qualité des données historiques ──────────────────────────────────────────
  activities_before_count: number
  prior_runs_count: number
  prior_runs_with_streams: number
  prior_stream_coverage_pct: number
  historical_data_quality: HistoricalDataQuality
  stream_coverage: number
  alt_coverage: number
  // ── Calibration de pente PERSONNELLE (compétitions confirmées) ────────────────
  steepness_calibration_active: boolean
  steepness_calibration_race_count: number
  steepness_calibration_spread_dplus_per_km: number
  steepness_calibration_reason: string
  // ── Records auto détectés depuis les streams (toutes sorties) ─────────────────
  auto_best_efforts_count: number
  critical_speed_mps: number | null
  used_stream_best_efforts: boolean
  /** Vrai si le fade d'endurance a utilisé l'exposant PERSONNEL appris (Étape 2). */
  used_personal_fade: boolean
  /** Exposant d'endurance personnel appliqué (ou null). */
  personal_fade_exponent: number | null
  /** Diagnostics de durabilité (remontés du moteur, §6). */
  personal_fade_r2: number | null
  personal_fade_confidence: string
  personal_fade_distinct_activity_count: number
  personal_fade_spread_ratio: number
  personal_fade_reason: string
  /** Diagnostics de fatigue globale de montée (§10). */
  global_climb_fatigue_active: boolean
  global_climb_fatigue_max_multiplier: number
  global_climb_fatigue_seconds_added: number
  /** Meilleure VAM détectée (m/h) sur les sorties de l'athlète (record de trail), ou null. */
  best_climb_vam_mh: number | null
  /** Temps projeté SANS records/durabilité auto (contrefactuel A/B) — = predicted_s si non utilisés. */
  predicted_s_no_be: number
  // ── Sources réellement utilisées ─────────────────────────────────────────────
  used_fallback: boolean
  fallback_sources: string[]
  fcmax_source: FcMaxSource
  profile_quality: ProfileQuality
  has_weather: boolean
  has_hr: boolean
  // ── Versionnement / estampillage ─────────────────────────────────────────────
  engine_version: string
  profile_version: string
  /** Instant d'EXÉCUTION du banc (≠ date historique de la course). */
  computed_at: string
  /** Date historique à laquelle le moteur se replace (départ de la course). */
  as_of_at: string
  /** Fenêtre moteur globale (jours) utilisée pour sélectionner l'historique. */
  history_window_days: number
  /** Fenêtre du profil récent par pente (jours). */
  runner_profile_window_days: number
  explanations: ProjectionSourceContribution[]
}

export interface ExcludedRace {
  race_id: string
  athlete_id: string
  date: string
  exclusion_reason: string
}

// ── Helpers moteur ──────────────────────────────────────────────────────────────

/** Projette une activité résumé vers la forme lue par `computeRaceProjection`. */
function toEngineActivity(a: BacktestActivity): Record<string, unknown> {
  return {
    // `name` + `elapsed_time` nécessaires à la validation stricte des compétitions
    // (isEligiblePersonalCalibrationRace : exclusion échauffement/footing, arrêts).
    name: a.name ?? null,
    type: a.type ?? null,
    sport_type: a.sport_type ?? null,
    distance: a.distance ?? 0,
    moving_time: a.moving_time ?? 0,
    elapsed_time: a.elapsed_time ?? null,
    total_elevation_gain: a.total_elevation_gain ?? 0,
    average_speed: a.average_speed ?? 0,
    average_heartrate: a.average_heartrate ?? 0,
    max_heartrate: a.max_heartrate ?? 0,
    start_date: a.start_date,
    is_race: a.is_race === true,
    deleted_at: a.deleted_at ?? null,
    raw_data: { workout_type: a.workout_type ?? null, average_temp: a.average_temp ?? null },
  }
}

/**
 * Sélectionne la FENÊTRE MOTEUR DE SIX MOIS avant la course (même athlète, non
 * supprimées, strictement antérieures) — via `selectEngineHistoryAtDate`, EXACTEMENT
 * comme la production. Garantit la parité production/benchmark : chaque projection est
 * alimentée par la fenêtre de six mois correspondant à sa date historique, jamais par
 * l'historique complet. La course elle-même est exclue (borne haute stricte + id).
 */
export function selectPriorActivities(
  all: BacktestActivity[],
  race: BacktestActivity,
  historyDays: number = ENGINE_HISTORY_DAYS,
): BacktestActivity[] {
  const start = Date.parse(race.start_date)
  if (Number.isNaN(start)) return []
  const window = selectEngineHistoryAtDate({
    activities: all as unknown as EngineActivity[],
    userId: race.user_id,
    asOfMs: start,
    historyDays,
  })
  return window.filter(
    (a) => String(a.strava_activity_id) !== String(race.strava_activity_id),
  ) as unknown as BacktestActivity[]
}

/** Qualité du profil d'époque = nb de buckets à confiance ≥ medium. */
function profileQuality(runnerProfile: { buckets?: Record<string, { confidence?: string }> }): { quality: ProfileQuality; confident: number } {
  const buckets = runnerProfile.buckets ?? {}
  let confident = 0
  for (const b of Object.values(buckets)) if (b.confidence === 'high' || b.confidence === 'medium') confident++
  const quality: ProfileQuality = confident >= 4 ? 'rich' : confident >= 1 ? 'partial' : 'none'
  return { quality, confident }
}

// ── Projection d'une course ─────────────────────────────────────────────────────

export interface ProjectOutcome {
  row?: BacktestRow & { _rawUserId: string; _rawRaceId: string }
  excluded?: ExcludedRace & { _rawUserId: string; _rawRaceId: string }
}

const RUN_TYPES_LC = new Set(['run', 'trailrun', 'trail run', 'virtualrun', 'running'])
function isRunActivity(a: BacktestActivity): boolean {
  const t = (a.sport_type ?? a.type ?? '').toLowerCase()
  return RUN_TYPES_LC.has(t)
}

/** Catégorise la couverture des streams historiques disponibles avant la course. */
function classifyHistoricalQuality(coveragePct: number): HistoricalDataQuality {
  if (coveragePct < 50) return 'poor'
  if (coveragePct <= 85) return 'partial'
  return 'good'
}

/**
 * Construit l'explicabilité (parts de sources) de la projection à partir des signaux
 * réellement disponibles : historique (buckets confiants), terrain, et replis. Sert
 * `stampProjection` — les replis dominants ramènent la confiance à « faible ».
 */
function buildExplanations(input: {
  confidentBuckets: number
  isTrail: boolean
  fallbackSources: string[]
  streamCoverage: number
}): ProjectionSourceContribution[] {
  const out: ProjectionSourceContribution[] = []
  if (input.confidentBuckets > 0) {
    out.push({ source: 'history', weight: input.confidentBuckets, detail: `${input.confidentBuckets} bucket(s) appris` })
  }
  if (input.streamCoverage > 0) {
    out.push({ source: 'vam', weight: input.streamCoverage * 2, detail: 'streams GPS/altimétrie' })
  }
  out.push({ source: 'terrain', weight: input.isTrail ? 1 : 0.5 })
  if (input.fallbackSources.length > 0) {
    out.push({ source: 'fallback', weight: input.fallbackSources.length, detail: input.fallbackSources.join(', ') })
  }
  return out
}

/**
 * Projette UNE course avec le vrai moteur et compare au réel. Retourne soit une
 * ligne scorée, soit une exclusion motivée (GPS manquant, etc.). Les ids restent
 * bruts ici (préfixés `_raw`) ; ils sont pseudonymisés par `runRealBacktest`.
 *
 * `computedAtISO` = instant d'EXÉCUTION du banc (déterministe si fourni). La date
 * historique du moteur (`as_of_at`) est TOUJOURS le départ de la course.
 */
export function projectRaceCase(c: RaceCaseInput, computedAtISO?: string): ProjectOutcome {
  const race = c.race
  const rawUserId = race.user_id
  const rawRaceId = String(race.strava_activity_id)
  const date = race.start_date.slice(0, 10)
  const computedAt = computedAtISO ?? new Date().toISOString()

  const movingS = typeof race.moving_time === 'number' ? race.moving_time : 0
  if (!(movingS > 0)) {
    return { excluded: { race_id: rawRaceId, athlete_id: rawUserId, date, exclusion_reason: 'no_real_time', _rawUserId: rawUserId, _rawRaceId: rawRaceId } }
  }

  const gpx = reconstructGpx(c.raceStreams)
  if (!gpx.usable) {
    return { excluded: { race_id: rawRaceId, athlete_id: rawUserId, date, exclusion_reason: gpx.issues[0] ?? 'no_gps', _rawUserId: rawUserId, _rawRaceId: rawRaceId } }
  }

  // ── Référence altimétrique : trois modes explicites, MÉTRIQUE PRINCIPALE = gpx_only. ─
  // La production ne connaît PAS le D+ Strava avant la course : la métrique principale
  // ne doit donc jamais s'y recaler. On calcule les trois D+ pour diagnostic, mais on
  // n'alimente le moteur qu'avec le mode demandé (défaut : gpx_only = parité production).
  const mode: ElevationReferenceMode = c.elevationReferenceMode ?? 'gpx_only'
  const storedDplus = typeof race.total_elevation_gain === 'number' ? race.total_elevation_gain : null
  const officialDplus = typeof c.officialDplusM === 'number' && c.officialDplusM > 0 ? c.officialDplusM : null

  const gpxOnly = smoothElevationProfile({ points: gpx.points }) // lissage seul, aucun recalage
  const officialSmooth = officialDplus != null
    ? smoothElevationProfile({ points: gpx.points, targetElevationGainM: officialDplus })
    : null
  const postRaceSmooth = storedDplus != null
    ? smoothElevationProfile({ points: gpx.points, targetElevationGainM: storedDplus })
    : null

  const smooth = mode === 'official_course_dplus' && officialSmooth
    ? officialSmooth
    : mode === 'post_race_strava_dplus' && postRaceSmooth
      ? postRaceSmooth
      : gpxOnly
  const points: GpxPoint[] = smooth.points

  const prior = selectPriorActivities(c.allActivities, race)
  const engineActivities = prior.map(toEngineActivity)

  // FC max « d'époque » anti-fuite : valeur profil saisie prioritaire ; sinon FC max
  // observée UNIQUEMENT sur les activités ANTÉRIEURES (jamais la course ni après) ;
  // sinon 220 − âge (si l'âge est connu) ; sinon repère fixe.
  const fc = resolveFcMaxWithSource(c.fcMax, prior as unknown as Record<string, unknown>[], c.athleteAge)
  const effectiveFcMax = fc.value

  const runnerProfile = buildRunnerProfileAtDate({
    activities: prior.map((a) => ({
      id: a.id,
      strava_activity_id: a.strava_activity_id,
      start_date: a.start_date,
      moving_time: a.moving_time ?? 0,
      total_elevation_gain: a.total_elevation_gain ?? 0,
      type: a.type ?? null,
      sport_type: a.sport_type ?? null,
      average_heartrate: a.average_heartrate ?? null,
      average_speed: a.average_speed ?? null,
    })),
    activityStreams: c.priorStreams,
    fcMax: effectiveFcMax,
    asOfDate: race.start_date,
    // Profil détaillé par pente : fenêtre récente (56 j), distincte des six mois globaux.
    windowDays: c.windowDays ?? RUNNER_PROFILE_WINDOW_DAYS,
  })

  // Records AUTO détectés depuis les streams de TOUTES les sorties running de la fenêtre
  // (pas seulement les courses étiquetées). Sur six mois — mémoire longue des perfs,
  // distincte du profil de pente (56 j). Attachés au profil pour que le moteur en dispose.
  const athleteBest = c.disableStreamBestEfforts
    ? { records: [], criticalSpeed: null, bestClimb: null, activitiesUsed: 0 }
    : buildAthleteBestEfforts(
        prior as unknown as BestEffortActivity[],
        c.priorStreams as unknown as Record<string, BestEffortStreams>,
      )
  // Profil assemblé par le MODULE PUR PARTAGÉ (§1) — même contrat que le builder de
  // production (web/mobile) et l'Edge Function. `assembleRunnerProfile` réutilise les
  // sous-résultats déjà calculés (atDate + bestEfforts) → sortie identique, sans recalcul.
  const runnerProfileWithBest = assembleRunnerProfile({
    atDateProfile: runnerProfile,
    bestEfforts: {
      records: athleteBest.records,
      criticalSpeed: athleteBest.criticalSpeed,
      bestClimb: athleteBest.bestClimb,
      bestClimbByTier: 'bestClimbByTier' in athleteBest ? athleteBest.bestClimbByTier : {},
    },
    asOfMs: Date.parse(race.start_date),
    historyDays: ENGINE_HISTORY_DAYS,
    detailedProfileDays: c.windowDays ?? RUNNER_PROFILE_WINDOW_DAYS,
  }) as unknown as Record<string, unknown>

  const profileObj: Record<string, unknown> = {
    fc_max: effectiveFcMax,
    runner_profile: runnerProfileWithBest,
  }

  const terrain = c.surfaces?.length
    ? { surfaces: c.surfaces, weather: c.weather ?? undefined }
    : null

  // Horloge HISTORIQUE : le moteur se replace au départ de la course (récence,
  // fenêtres 7 j/42 j, ACWR, PR… calculées par rapport à la course, pas au script).
  const asOfMs = Date.parse(race.start_date)
  const engineCtx = { asOfMs: Number.isNaN(asOfMs) ? undefined : asOfMs }
  const proj = computeRaceProjection(
    points,
    engineActivities,
    profileObj,
    { type: race.sport_type ?? race.type ?? null, goal_time: null },
    terrain,
    engineCtx,
  )

  // A/B DÉTERMINISTE dans le même run : contrefactuel SANS records auto (même horloge,
  // mêmes données) → isole l'effet propre des records, sans le confondre avec les autres
  // changements du moteur. Recalculé seulement si des records ont réellement été détectés.
  let predictedNoBe = Math.round(proj.estTimeS)
  if (athleteBest.records.length > 0) {
    const projNoBe = computeRaceProjection(
      points,
      engineActivities,
      { fc_max: effectiveFcMax, runner_profile: runnerProfile as unknown as Record<string, unknown> },
      { type: race.sport_type ?? race.type ?? null, goal_time: null },
      terrain,
      engineCtx,
    )
    predictedNoBe = Math.round(projNoBe.estTimeS)
  }

  const predicted = Math.round(proj.estTimeS)
  const low = Math.round(proj.timeMin)
  const high = Math.round(proj.timeMax)
  const { quality, confident } = profileQuality(runnerProfile)
  const distanceKm = proj.totalDistM / 1000
  const dplusPerKm = distanceKm > 0 ? proj.dplus / distanceKm : 0

  // ── Références temps : moving (sportif) et elapsed (heure d'arrivée = principal). ─
  const elapsedS = typeof race.elapsed_time === 'number' && race.elapsed_time > 0 ? race.elapsed_time : null
  const errMoving = predicted - movingS
  const errElapsed = elapsedS != null ? predicted - elapsedS : null
  const stopGapS = elapsedS != null ? elapsedS - movingS : null
  const stopGapPct = stopGapS != null && elapsedS ? +((stopGapS / elapsedS) * 100).toFixed(2) : null
  // Arrêt « large » si elapsed dépasse moving de plus de 5 % (pauses ravito/attente).
  const stopClass: StopClass | null = stopGapPct == null ? null : stopGapPct > 5 ? 'large' : 'normal'

  // ── Qualité des données historiques : couverture des streams avant la course. ────
  const priorRuns = prior.filter(isRunActivity)
  const priorRunsWithStreams = priorRuns.filter((a) => c.priorStreams[String(a.strava_activity_id)] != null).length
  const priorStreamCoveragePct = priorRuns.length > 0 ? (priorRunsWithStreams / priorRuns.length) * 100 : 0

  const explanations = buildExplanations({
    confidentBuckets: confident,
    isTrail: proj.isTrail,
    fallbackSources: proj.fallbackSources,
    streamCoverage: runnerProfile.streamCoverage,
  })
  const stamped = stampProjection({
    profileVersion: PROFILE_VERSION,
    lowS: low, centralS: predicted, highS: high,
    explanations,
    now: new Date(computedAt),
  })

  const row: BacktestRow & { _rawUserId: string; _rawRaceId: string } = {
    race_id: rawRaceId,
    athlete_id: rawUserId,
    date,
    event_key: date, // regroupement par JOUR de course (leave-one-date-out)
    sport: proj.isTrail ? 'trail' : 'road',
    distance_km: +distanceKm.toFixed(2),
    dplus_m: Math.round(proj.dplus),
    dplus_per_km: +dplusPerKm.toFixed(1),
    actual_moving_s: movingS,
    actual_elapsed_s: elapsedS,
    actual_s: movingS,
    predicted_s: predicted,
    low_s: low,
    high_s: high,
    error_vs_moving_s: errMoving,
    error_vs_elapsed_s: errElapsed,
    error_vs_moving_pct: movingS > 0 ? +((errMoving / movingS) * 100).toFixed(2) : 0,
    error_vs_elapsed_pct: elapsedS != null ? +((errElapsed! / elapsedS) * 100).toFixed(2) : null,
    error_s: errMoving,
    absolute_error_s: Math.abs(errMoving),
    error_pct: movingS > 0 ? +((errMoving / movingS) * 100).toFixed(2) : 0,
    stop_gap_s: stopGapS,
    stop_gap_pct: stopGapPct,
    stop_class: stopClass,
    inside_interval: movingS >= low && movingS <= high,
    inside_interval_elapsed: elapsedS != null ? elapsedS >= low && elapsedS <= high : null,
    confidence: proj.confidence,
    stored_dplus_m: storedDplus != null ? Math.round(storedDplus) : null,
    raw_gpx_dplus_m: smooth.rawGainM,
    smoothed_gpx_dplus_m: smooth.finalGainM,
    dplus_calibration_ratio: smooth.calibrationRatio,
    dplus_was_calibrated: smooth.wasCalibrated,
    gpx_only_dplus_m: gpxOnly.finalGainM,
    official_dplus_m: officialDplus != null ? Math.round(officialDplus) : null,
    post_race_strava_dplus_m: storedDplus != null ? Math.round(storedDplus) : null,
    elevation_reference_mode: mode,
    activities_before_count: prior.length,
    prior_runs_count: priorRuns.length,
    prior_runs_with_streams: priorRunsWithStreams,
    prior_stream_coverage_pct: +priorStreamCoveragePct.toFixed(1),
    historical_data_quality: classifyHistoricalQuality(priorStreamCoveragePct),
    stream_coverage: +runnerProfile.streamCoverage.toFixed(3),
    alt_coverage: +gpx.altCoverage.toFixed(3),
    steepness_calibration_active: proj.steepness_calibration_active,
    steepness_calibration_race_count: proj.steepness_calibration_race_count,
    steepness_calibration_spread_dplus_per_km: proj.steepness_calibration_spread_dplus_per_km,
    steepness_calibration_reason: proj.steepness_calibration_reason,
    auto_best_efforts_count: athleteBest.records.length,
    critical_speed_mps: athleteBest.criticalSpeed?.csMetersPerSec ?? null,
    used_stream_best_efforts: proj.used_stream_best_efforts,
    used_personal_fade: proj.used_personal_fade,
    personal_fade_exponent: proj.personal_fade_exponent,
    personal_fade_r2: proj.personal_fade_r2,
    personal_fade_confidence: proj.personal_fade_confidence,
    personal_fade_distinct_activity_count: proj.personal_fade_distinct_activity_count,
    personal_fade_spread_ratio: proj.personal_fade_spread_ratio,
    personal_fade_reason: proj.personal_fade_reason,
    global_climb_fatigue_active: proj.global_climb_fatigue_active,
    global_climb_fatigue_max_multiplier: proj.global_climb_fatigue_max_multiplier,
    global_climb_fatigue_seconds_added: proj.global_climb_fatigue_seconds_added,
    best_climb_vam_mh: athleteBest.bestClimb?.vamMh ?? null,
    predicted_s_no_be: predictedNoBe,
    used_fallback: proj.usedFallback,
    fallback_sources: proj.fallbackSources,
    fcmax_source: fc.source,
    profile_quality: quality,
    has_weather: c.hasWeather,
    has_hr: c.hasHr ?? ((c.raceStreams as RawStreamSet | null)?.heartrate != null),
    engine_version: ENGINE_VERSION,
    profile_version: PROFILE_VERSION,
    computed_at: computedAt,
    as_of_at: new Date(race.start_date).toISOString(),
    history_window_days: ENGINE_HISTORY_DAYS,
    runner_profile_window_days: c.windowDays ?? RUNNER_PROFILE_WINDOW_DAYS,
    explanations: stamped.explanations,
    _rawUserId: rawUserId,
    _rawRaceId: rawRaceId,
  }
  return { row }
}

// ── Agrégation + pseudonymisation ────────────────────────────────────────────────

export interface CategoryMetrics extends ErrorMetrics {
  optimisticPct: number // part predicted < actual (moteur trop rapide)
  pessimisticPct: number // part predicted > actual (moteur trop lent)
}

/** Référence temporelle d'évaluation : `moving` (sportif) ou `elapsed` (arrivée réelle). */
export type MetricBasis = 'moving' | 'elapsed'

function actualFor(r: BacktestRow, basis: MetricBasis): number | null {
  return basis === 'elapsed' ? r.actual_elapsed_s : r.actual_moving_s
}

function toCategoryMetrics(rows: BacktestRow[], basis: MetricBasis = 'moving'): CategoryMetrics {
  const usable = rows.filter((r) => { const a = actualFor(r, basis); return typeof a === 'number' && a > 0 })
  const scored = usable.map((r) => ({ predictedS: r.predicted_s, actualS: actualFor(r, basis) as number, low: r.low_s, high: r.high_s }))
  const base = computeErrorMetrics(scored)
  const n = usable.length
  const optimistic = usable.filter((r) => r.predicted_s < (actualFor(r, basis) as number)).length
  const pessimistic = usable.filter((r) => r.predicted_s > (actualFor(r, basis) as number)).length
  return { ...base, optimisticPct: n ? optimistic / n : 0, pessimisticPct: n ? pessimistic / n : 0 }
}

function groupBy(rows: BacktestRow[], keyFn: (r: BacktestRow) => string, basis: MetricBasis = 'moving'): Record<string, CategoryMetrics> {
  const groups = new Map<string, BacktestRow[]>()
  for (const r of rows) { const k = keyFn(r); const a = groups.get(k) ?? []; a.push(r); groups.set(k, a) }
  const out: Record<string, CategoryMetrics> = {}
  for (const [k, v] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out[k] = toCategoryMetrics(v, basis)
  return out
}

// ── ANALYSE D'ERREUR PAR GROUPES (PAS du hors-échantillon) ───────────────────────
// IMPORTANT — HONNÊTETÉ MÉTHODOLOGIQUE : ces blocs ne recalculent PAS les projections
// en excluant un fold ; ils REGROUPENT les erreurs DÉJÀ obtenues par date/événement ou
// par athlète. Ce n'est donc PAS une vraie validation hors échantillon (`is_true_out_of
// _sample = false`). Ils garantissent l'intégrité des groupes (une même date/athlète
// n'est jamais scindée) et exposent la sensibilité des métriques au découpage (macro-
// moyenne par fold). La vraie validation hors échantillon (recalibration d'un
// coefficient GLOBAL en excluant le fold) est portée séparément — voir
// `computeTrueLeaveOneOut` : non applicable ici car aucun coefficient global n'est
// recalibré dans ce lot (mécanismes purement PERSONNELS → rien à tenir à l'écart).

export type GroupedAnalysisProtocol =
  | 'grouped_error_analysis_by_date'
  | 'grouped_error_analysis_by_athlete'

export interface GroupedErrorAnalysis {
  protocol: GroupedAnalysisProtocol
  /** Toujours false : simple regroupement d'erreurs, pas de recalcul hors échantillon. */
  is_true_out_of_sample: false
  folds: number
  n: number
  elapsed: CategoryMetrics
  moving: CategoryMetrics
  /** Moyenne des MAPE elapsed par fold (macro) — révèle une dépendance à un groupe. */
  macroMapeElapsedPct: number
  /** Moyenne des MAPE moving par fold (macro). */
  macroMapeMovingPct: number
}

/** Clé de regroupement d'un protocole. Exportée pour tester l'intégrité des groupes. */
export function groupedKeyFn(protocol: GroupedAnalysisProtocol): (r: BacktestRow) => string {
  return protocol === 'grouped_error_analysis_by_date' ? (r) => r.event_key : (r) => r.athlete_id
}

/** Regroupe les lignes par fold (une entrée par clé). Aucun groupe n'est scindé. */
export function foldsByKey(rows: BacktestRow[], keyFn: (r: BacktestRow) => string): Map<string, BacktestRow[]> {
  const m = new Map<string, BacktestRow[]>()
  for (const r of rows) { const k = keyFn(r); const a = m.get(k) ?? []; a.push(r); m.set(k, a) }
  return m
}

function computeGroupedErrorAnalysis(rows: BacktestRow[], protocol: GroupedAnalysisProtocol): GroupedErrorAnalysis {
  const keyFn = groupedKeyFn(protocol)
  const folds = foldsByKey(rows, keyFn)
  const macroE: number[] = []
  const macroM: number[] = []
  for (const foldRows of folds.values()) {
    const e = toCategoryMetrics(foldRows, 'elapsed')
    const m = toCategoryMetrics(foldRows, 'moving')
    if (Number.isFinite(e.mapePct)) macroE.push(e.mapePct)
    if (Number.isFinite(m.mapePct)) macroM.push(m.mapePct)
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN)
  return {
    protocol,
    is_true_out_of_sample: false,
    folds: folds.size,
    n: rows.length,
    elapsed: toCategoryMetrics(rows, 'elapsed'),
    moving: toCategoryMetrics(rows, 'moving'),
    macroMapeElapsedPct: mean(macroE),
    macroMapeMovingPct: mean(macroM),
  }
}

/**
 * Vraie validation hors échantillon : recalibrerait un coefficient GLOBAL en excluant
 * chaque fold, puis évaluerait sur le fold tenu à l'écart. NON APPLICABLE dans ce lot :
 * aucun coefficient global n'est recalibré (la calibration de pente et l'ancrage sont
 * PERSONNELS — appris uniquement sur l'historique de l'athlète, disponible avant la
 * course). Retourne `null` plutôt que de présenter un regroupement comme du hors-
 * échantillon. Reliée à un test qui documente cette non-applicabilité.
 */
export function computeTrueLeaveOneOut(): null {
  return null
}

// ── Contrôle du D+ (brut / lissé / Strava) ───────────────────────────────────────

export interface DplusControl {
  n: number
  /** Écart moyen |D+ brut − Strava| (m), sur les courses ayant un D+ Strava. */
  meanRawVsStoredM: number
  /** Écart moyen |D+ lissé − Strava| (m). */
  meanSmoothedVsStoredM: number
  /** Nombre de parcours recalés proportionnellement. */
  calibratedCount: number
  /** Plus gros écarts brut→Strava (course + valeurs), pour inspection. */
  largestGaps: { race_id: string; stored: number | null; raw: number; smoothed: number }[]
}

function computeDplusControl(rows: BacktestRow[]): DplusControl {
  const withStored = rows.filter((r) => r.stored_dplus_m != null)
  const meanAbs = (f: (r: BacktestRow) => number) => (withStored.length ? withStored.reduce((s, r) => s + Math.abs(f(r)), 0) / withStored.length : NaN)
  const largest = [...withStored]
    .sort((a, b) => Math.abs(b.raw_gpx_dplus_m - (b.stored_dplus_m as number)) - Math.abs(a.raw_gpx_dplus_m - (a.stored_dplus_m as number)))
    .slice(0, 5)
    .map((r) => ({ race_id: r.race_id, stored: r.stored_dplus_m, raw: r.raw_gpx_dplus_m, smoothed: r.smoothed_gpx_dplus_m }))
  return {
    n: withStored.length,
    meanRawVsStoredM: meanAbs((r) => r.raw_gpx_dplus_m - (r.stored_dplus_m as number)),
    meanSmoothedVsStoredM: meanAbs((r) => r.smoothed_gpx_dplus_m - (r.stored_dplus_m as number)),
    calibratedCount: rows.filter((r) => r.dplus_was_calibrated).length,
    largestGaps: largest,
  }
}

export interface ValidationBreakdown {
  candidates: number
  confirmed: number
  rejected: number
  pending: number
  rejectedReasons: Record<string, number>
  pendingReasons: Record<string, number>
}

/** Qualité de l'échantillon testé (pour le rapport). */
export interface SampleQuality {
  candidates: number
  confirmed: number
  tested: number
  athletes: number
  /** Dates/événements distincts (leave-one-date-out). */
  distinctEvents: number
  road: number
  trail: number
  /** Répartition de la qualité des streams historiques. */
  historicalQuality: Record<HistoricalDataQuality, number>
}

/** Fenêtres temporelles du moteur (rapport). */
export interface EngineWindows {
  engineHistoryDays: number
  runnerProfileWindowDays: number
}

/** Volume d'activités chargé par projection (diagnostic anonymisé, section 18). */
export interface ActivityVolumeDiagnostic {
  meanActivityCount: number
  p75ActivityCount: number
  p90ActivityCount: number
  maxActivityCount: number
  /** Estimation grossière de la charge utile (octets) : count × ~octets/ligne. */
  approxPayloadBytes: number
}

/** Un côté d'A/B : MAPE/MAE elapsed AVEC vs SANS les features stream, sur n courses. */
export interface ABSide {
  n: number
  mapeElapsedWithPct: number
  mapeElapsedWithoutPct: number
  maeElapsedWithS: number
  maeElapsedWithoutS: number
}

/**
 * A/B des features dérivées des streams (records auto + durabilité personnelle) :
 * précision AVEC vs SANS, même run déterministe. Ventilé route/trail car les records
 * touchent surtout la route et la durabilité surtout le trail long.
 */
export interface StreamBestEffortsAB {
  overall: ABSide
  road: ABSide
  trail: ABSide
}

/** Comptes agrégés sur la fenêtre de six mois (dérivés des lignes testées). */
export interface SixMonthCounts {
  /** Moyenne d'activités (toutes) dans la fenêtre par course. */
  meanAllActivities: number
  /** Moyenne de courses à pied/trail dans la fenêtre par course. */
  meanRunningActivities: number
  /** Total de compétitions confirmées testées (une par course). */
  confirmedRaceAnchorCount: number
  /** Moyenne de runs disposant de streams (profil récent). */
  meanRunsWithStreams: number
  /** Couverture moyenne des streams running (%). */
  meanStreamCoveragePct: number
}

export interface BacktestReport {
  generatedAt: string
  engineVersion: string
  profileVersion: string
  windows: EngineWindows
  activityVolume: ActivityVolumeDiagnostic
  sixMonthCounts: SixMonthCounts
  /** A/B des records auto : précision AVEC vs SANS (contrefactuel déterministe). */
  streamBestEffortsAB: StreamBestEffortsAB
  counts: {
    candidates: number
    confirmed: number
    excluded: number
    tested: number
  }
  validation?: ValidationBreakdown
  sample: SampleQuality
  /** Métrique PRINCIPALE : temps écoulé (heure d'arrivée réelle). */
  overallElapsed: CategoryMetrics
  /** Métrique secondaire : temps en mouvement (analyse sportive). */
  overallMoving: CategoryMetrics
  /** Alias historique (= overallMoving). */
  overall: CategoryMetrics
  /** Couverture de l'intervalle vs moving / vs elapsed. */
  coverageVsMoving: number | null
  coverageVsElapsed: number | null
  /** Référence altimétrique de la métrique principale (parité production). */
  elevationReferenceMode: ElevationReferenceMode
  // ── Validation ────────────────────────────────────────────────────────────────
  inSample: { elapsed: CategoryMetrics; moving: CategoryMetrics }
  /** Regroupement d'erreurs par date/événement — PAS du hors-échantillon. */
  groupedErrorAnalysisByDate: GroupedErrorAnalysis
  /** Regroupement d'erreurs par athlète — PAS du hors-échantillon. */
  groupedErrorAnalysisByAthlete: GroupedErrorAnalysis
  /** Vraie validation hors échantillon par date (null = non applicable dans ce lot). */
  trueLeaveOneDateOut: null
  /** Vraie validation hors échantillon par athlète (null = non applicable dans ce lot). */
  trueLeaveOneAthleteOut: null
  /** Contrôle du dénivelé (brut / lissé / Strava). */
  dplusControl: DplusControl
  /** Métriques restreintes aux courses à historique de bonne qualité (streams > 85 %). */
  goodQualityOnly: { n: number; elapsed: CategoryMetrics; moving: CategoryMetrics }
  byAthlete: Record<string, CategoryMetrics>
  byTerrain: Record<string, CategoryMetrics>
  byDistance: Record<string, CategoryMetrics>
  byDplus: Record<string, CategoryMetrics>
  byProfileQuality: Record<string, CategoryMetrics>
  byDataQuality: Record<string, CategoryMetrics>
  byWeather: Record<string, CategoryMetrics>
  byHr: Record<string, CategoryMetrics>
  byEngineMode: Record<string, CategoryMetrics>
  byFcMaxSource: Record<string, CategoryMetrics>
  // ── Validation scientifique (§15, §16, §17) ──────────────────────────────────
  /** Nature de l'évaluation : ce lot rétrospectif est un ÉCHANTILLON DE DÉVELOPPEMENT. */
  evaluationType: EvaluationType
  /** Baselines déterministes (moving) — mêmes courses, références par athlète. */
  baselinesMoving: BaselineMetrics[]
  /** Baselines déterministes (elapsed). */
  baselinesElapsed: BaselineMetrics[]
  /** IC bootstrap clusterisé par athlète (moving). */
  bootstrapMoving: ClusteredBootstrapResult
  /** IC bootstrap clusterisé par athlète (elapsed). */
  bootstrapElapsed: ClusteredBootstrapResult
  rows: BacktestRow[]
  excluded: ExcludedRace[]
}

/** §16 : séparer calibration et évaluation. Ce lot historique = development_sample. */
export type EvaluationType = 'development_sample' | 'retrospective_holdout' | 'prospective_locked'

export interface RunRealBacktestOptions {
  candidateCount?: number
  confirmedCount?: number
  validation?: ValidationBreakdown
  now?: Date
}

/** Percentile (interpolation linéaire) d'une liste triée croissante. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** Estimation d'octets par ligne d'activité (colonnes moteur, ordre de grandeur). */
const APPROX_BYTES_PER_ACTIVITY = 400

function computeActivityVolume(rows: BacktestRow[]): ActivityVolumeDiagnostic {
  const counts = rows.map((r) => r.activities_before_count).sort((a, b) => a - b)
  const mean = counts.length ? counts.reduce((s, x) => s + x, 0) / counts.length : 0
  const max = counts.length ? counts[counts.length - 1] : 0
  return {
    meanActivityCount: +mean.toFixed(1),
    p75ActivityCount: +percentile(counts, 0.75).toFixed(1),
    p90ActivityCount: +percentile(counts, 0.9).toFixed(1),
    maxActivityCount: max,
    approxPayloadBytes: Math.round(mean * APPROX_BYTES_PER_ACTIVITY),
  }
}

function abSide(rows: BacktestRow[]): ABSide {
  // Courses où les features stream ont RÉELLEMENT changé la projection (records et/ou
  // durabilité), avec un temps réel elapsed disponible.
  const used = rows.filter(
    (r) => r.predicted_s !== r.predicted_s_no_be && r.actual_elapsed_s != null && r.actual_elapsed_s > 0,
  )
  const n = used.length
  const mape = (f: (r: BacktestRow) => number) =>
    n ? (used.reduce((s, r) => s + Math.abs(f(r) - (r.actual_elapsed_s as number)) / (r.actual_elapsed_s as number), 0) / n) * 100 : NaN
  const mae = (f: (r: BacktestRow) => number) =>
    n ? used.reduce((s, r) => s + Math.abs(f(r) - (r.actual_elapsed_s as number)), 0) / n : NaN
  return {
    n,
    mapeElapsedWithPct: +mape((r) => r.predicted_s).toFixed(2),
    mapeElapsedWithoutPct: +mape((r) => r.predicted_s_no_be).toFixed(2),
    maeElapsedWithS: Math.round(mae((r) => r.predicted_s)),
    maeElapsedWithoutS: Math.round(mae((r) => r.predicted_s_no_be)),
  }
}

function computeStreamBestEffortsAB(rows: BacktestRow[]): StreamBestEffortsAB {
  return {
    overall: abSide(rows),
    road: abSide(rows.filter((r) => r.sport === 'road')),
    trail: abSide(rows.filter((r) => r.sport === 'trail')),
  }
}

function computeSixMonthCounts(rows: BacktestRow[]): SixMonthCounts {
  const mean = (f: (r: BacktestRow) => number) =>
    rows.length ? +(rows.reduce((s, r) => s + f(r), 0) / rows.length).toFixed(1) : 0
  return {
    meanAllActivities: mean((r) => r.activities_before_count),
    meanRunningActivities: mean((r) => r.prior_runs_count),
    confirmedRaceAnchorCount: rows.length,
    meanRunsWithStreams: mean((r) => r.prior_runs_with_streams),
    meanStreamCoveragePct: mean((r) => r.prior_stream_coverage_pct),
  }
}

/**
 * Exécute le banc sur un ensemble de cas, agrège les métriques et PSEUDONYMISE tous
 * les identifiants. Déterministe (hors `generatedAt`, injectable via `now`).
 */
export function runRealBacktest(cases: RaceCaseInput[], opts: RunRealBacktestOptions = {}): BacktestReport {
  const rawRows: (BacktestRow & { _rawUserId: string; _rawRaceId: string })[] = []
  const rawExcluded: (ExcludedRace & { _rawUserId: string; _rawRaceId: string })[] = []

  // `computed_at` = instant d'exécution du banc (déterministe via `opts.now`), distinct
  // de `as_of_at` (date historique de la course, portée par chaque ligne).
  const computedAtISO = (opts.now ?? new Date()).toISOString()
  for (const c of cases) {
    const out = projectRaceCase(c, computedAtISO)
    if (out.row) rawRows.push(out.row)
    if (out.excluded) rawExcluded.push(out.excluded)
  }

  // Étiquettes athlètes (A1, A2…) déterministes : ordre par hash stable.
  const athleteHashes = [...new Set([...rawRows, ...rawExcluded].map((r) => r._rawUserId))]
    .map((u) => ({ raw: u, h: shortHash(u) }))
    .sort((a, b) => a.h.localeCompare(b.h))
  const athleteLabel = new Map<string, string>()
  athleteHashes.forEach((a, i) => athleteLabel.set(a.raw, `A${i + 1}`))

  // Étiquettes courses (R01…) : ordre par date puis hash.
  const allRaces = [...rawRows.map((r) => ({ raw: r._rawRaceId, date: r.date })), ...rawExcluded.map((r) => ({ raw: r._rawRaceId, date: r.date }))]
  const raceSorted = [...new Map(allRaces.map((r) => [r.raw, r])).values()]
    .sort((a, b) => (a.date === b.date ? shortHash(a.raw).localeCompare(shortHash(b.raw)) : a.date.localeCompare(b.date)))
  const raceLabel = new Map<string, string>()
  raceSorted.forEach((r, i) => raceLabel.set(r.raw, `R${String(i + 1).padStart(2, '0')}`))

  const strip = <T extends { _rawUserId: string; _rawRaceId: string }>(r: T): Omit<T, '_rawUserId' | '_rawRaceId'> => {
    const { _rawUserId, _rawRaceId, ...rest } = r
    return { ...(rest as Omit<T, '_rawUserId' | '_rawRaceId'>) }
  }

  const rows: BacktestRow[] = rawRows.map((r) => ({
    ...strip(r),
    race_id: raceLabel.get(r._rawRaceId)!,
    athlete_id: athleteLabel.get(r._rawUserId)!,
  }))
  const excluded: ExcludedRace[] = rawExcluded.map((r) => ({
    ...strip(r),
    race_id: raceLabel.get(r._rawRaceId)!,
    athlete_id: athleteLabel.get(r._rawUserId)!,
  }))

  const tested = rows.length
  const candidates = opts.candidateCount ?? opts.validation?.candidates ?? (tested + excluded.length)
  const confirmed = opts.confirmedCount ?? opts.validation?.confirmed ?? (tested + excluded.length)

  const overallMoving = toCategoryMetrics(rows, 'moving')
  const overallElapsed = toCategoryMetrics(rows, 'elapsed')
  const goodRows = rows.filter((r) => r.historical_data_quality === 'good')

  const histQuality: Record<HistoricalDataQuality, number> = { poor: 0, partial: 0, good: 0 }
  for (const r of rows) histQuality[r.historical_data_quality]++

  const sample: SampleQuality = {
    candidates,
    confirmed,
    tested,
    athletes: new Set(rows.map((r) => r.athlete_id)).size,
    distinctEvents: new Set(rows.map((r) => r.event_key)).size,
    road: rows.filter((r) => r.sport === 'road').length,
    trail: rows.filter((r) => r.sport === 'trail').length,
    historicalQuality: histQuality,
  }

  return {
    generatedAt: computedAtISO,
    engineVersion: ENGINE_VERSION,
    profileVersion: PROFILE_VERSION,
    windows: {
      engineHistoryDays: ENGINE_HISTORY_DAYS,
      runnerProfileWindowDays: rows[0]?.runner_profile_window_days ?? RUNNER_PROFILE_WINDOW_DAYS,
    },
    activityVolume: computeActivityVolume(rows),
    sixMonthCounts: computeSixMonthCounts(rows),
    streamBestEffortsAB: computeStreamBestEffortsAB(rows),
    counts: { candidates, confirmed, excluded: excluded.length, tested },
    validation: opts.validation,
    sample,
    overallElapsed,
    overallMoving,
    overall: overallMoving,
    coverageVsMoving: overallMoving.intervalCoverage,
    coverageVsElapsed: overallElapsed.intervalCoverage,
    elevationReferenceMode: rows[0]?.elevation_reference_mode ?? 'gpx_only',
    inSample: { elapsed: overallElapsed, moving: overallMoving },
    groupedErrorAnalysisByDate: computeGroupedErrorAnalysis(rows, 'grouped_error_analysis_by_date'),
    groupedErrorAnalysisByAthlete: computeGroupedErrorAnalysis(rows, 'grouped_error_analysis_by_athlete'),
    trueLeaveOneDateOut: computeTrueLeaveOneOut(),
    trueLeaveOneAthleteOut: computeTrueLeaveOneOut(),
    dplusControl: computeDplusControl(rows),
    goodQualityOnly: {
      n: goodRows.length,
      elapsed: toCategoryMetrics(goodRows, 'elapsed'),
      moving: toCategoryMetrics(goodRows, 'moving'),
    },
    byAthlete: groupBy(rows, (r) => r.athlete_id),
    byTerrain: groupBy(rows, (r) => r.sport),
    byDistance: groupBy(rows, (r) => distanceBucket(r.distance_km)),
    byDplus: groupBy(rows, (r) => dplusBucket(r.dplus_per_km)),
    byProfileQuality: groupBy(rows, (r) => r.profile_quality),
    byDataQuality: groupBy(rows, (r) => r.historical_data_quality),
    byWeather: groupBy(rows, (r) => (r.has_weather ? 'avec météo' : 'sans météo')),
    byHr: groupBy(rows, (r) => (r.has_hr ? 'avec FC' : 'sans FC')),
    byEngineMode: groupBy(rows, (r) => (r.used_fallback ? 'fallback' : 'historique')),
    byFcMaxSource: groupBy(rows, (r) => r.fcmax_source),
    // ── Validation scientifique (§15/§16/§17) ────────────────────────────────
    evaluationType: 'development_sample',
    baselinesMoving: computeBaselineMetrics(toBaselineInputs(rows), 'moving'),
    baselinesElapsed: computeBaselineMetrics(toBaselineInputs(rows), 'elapsed'),
    bootstrapMoving: clusteredBootstrap(toBootstrapPoints(rows, 'moving')),
    bootstrapElapsed: clusteredBootstrap(toBootstrapPoints(rows, 'elapsed')),
    rows: rows.sort((a, b) => a.race_id.localeCompare(b.race_id)),
    excluded: excluded.sort((a, b) => a.race_id.localeCompare(b.race_id)),
  }
}

/** Adapte les lignes du banc vers les entrées des baselines (§15). */
function toBaselineInputs(rows: BacktestRow[]): BaselineRaceInput[] {
  return rows.map((r) => ({
    athleteId: r.athlete_id,
    raceId: r.race_id,
    distanceKm: r.distance_km,
    dplusM: r.dplus_m,
    actualMovingS: r.actual_moving_s,
    actualElapsedS: r.actual_elapsed_s,
    predictedNoBeS: r.predicted_s_no_be,
  }))
}

/** Adapte les lignes vers les points de bootstrap clusterisé par athlète (§17). */
function toBootstrapPoints(rows: BacktestRow[], basis: 'moving' | 'elapsed'): BootstrapPoint[] {
  const pts: BootstrapPoint[] = []
  for (const r of rows) {
    const actual = basis === 'elapsed' ? r.actual_elapsed_s : r.actual_moving_s
    if (actual == null || actual <= 0) continue
    pts.push({ predictedS: r.predicted_s, actualS: actual, low: r.low_s, high: r.high_s, clusterId: r.athlete_id })
  }
  return pts
}
