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
import { ENGINE_VERSION, stampProjection, type ProjectionSourceContribution } from './engineVersion'
import { resolveFcMaxWithSource, type FcMaxSource } from './fcMax'

/** Version du profil « d'époque » (buildRunnerProfileAtDate). À incrémenter si sa
 *  logique de calcul change. Reliée à chaque ligne du rapport. */
export const PROFILE_VERSION = 'atDate-2026.07-1'

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
  // ── Qualité des données historiques ──────────────────────────────────────────
  activities_before_count: number
  prior_runs_count: number
  prior_runs_with_streams: number
  prior_stream_coverage_pct: number
  historical_data_quality: HistoricalDataQuality
  stream_coverage: number
  alt_coverage: number
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
    type: a.type ?? null,
    sport_type: a.sport_type ?? null,
    distance: a.distance ?? 0,
    moving_time: a.moving_time ?? 0,
    total_elevation_gain: a.total_elevation_gain ?? 0,
    average_speed: a.average_speed ?? 0,
    average_heartrate: a.average_heartrate ?? 0,
    max_heartrate: a.max_heartrate ?? 0,
    start_date: a.start_date,
    is_race: a.is_race === true,
    raw_data: { workout_type: a.workout_type ?? null, average_temp: a.average_temp ?? null },
  }
}

/**
 * Sélectionne les activités STRICTEMENT antérieures à la course, du MÊME athlète,
 * non supprimées (anti-fuite). C'est l'ensemble fourni au moteur.
 */
export function selectPriorActivities(all: BacktestActivity[], race: BacktestActivity): BacktestActivity[] {
  const start = Date.parse(race.start_date)
  if (Number.isNaN(start)) return []
  return all.filter((a) => {
    if (a.user_id !== race.user_id) return false
    if (a.deleted_at != null) return false
    if (String(a.strava_activity_id) === String(race.strava_activity_id)) return false
    const d = Date.parse(a.start_date)
    return !Number.isNaN(d) && d < start
  })
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

  // ── Lissage altimétrique robuste (anti-bruit cumulé) + recalage Strava optionnel. ─
  const storedDplus = typeof race.total_elevation_gain === 'number' ? race.total_elevation_gain : null
  const smooth = smoothElevationProfile({ points: gpx.points, targetElevationGainM: storedDplus })
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
    windowDays: c.windowDays ?? 56,
  })

  const profileObj: Record<string, unknown> = {
    fc_max: effectiveFcMax,
    runner_profile: runnerProfile as unknown as Record<string, unknown>,
  }

  const terrain = c.surfaces?.length
    ? { surfaces: c.surfaces, weather: c.weather ?? undefined }
    : null

  // Horloge HISTORIQUE : le moteur se replace au départ de la course (récence,
  // fenêtres 7 j/42 j, ACWR, PR… calculées par rapport à la course, pas au script).
  const asOfMs = Date.parse(race.start_date)
  const proj = computeRaceProjection(
    points,
    engineActivities,
    profileObj,
    { type: race.sport_type ?? race.type ?? null, goal_time: null },
    terrain,
    { asOfMs: Number.isNaN(asOfMs) ? undefined : asOfMs },
  )

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
    activities_before_count: prior.length,
    prior_runs_count: priorRuns.length,
    prior_runs_with_streams: priorRunsWithStreams,
    prior_stream_coverage_pct: +priorStreamCoveragePct.toFixed(1),
    historical_data_quality: classifyHistoricalQuality(priorStreamCoveragePct),
    stream_coverage: +runnerProfile.streamCoverage.toFixed(3),
    alt_coverage: +gpx.altCoverage.toFixed(3),
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

// ── Validation HORS ÉCHANTILLON (leave-one-*-out) ────────────────────────────────
// Aucun coefficient n'est ajusté dans ce lot : les folds ne servent pas à ré-entraîner
// le moteur mais à GARANTIR l'intégrité des groupes (une même date/événement — ou un
// même athlète — n'est jamais scindée entre « appris » et « validé ») et à exposer la
// sensibilité des métriques au découpage. Le moteur étant figé, l'union des folds tenus
// à l'écart = l'échantillon complet ; on rapporte donc les métriques agrégées + le
// nombre de folds + la macro-moyenne (moyenne des MAPE par fold, sensible aux groupes).

export type OosProtocol = 'leave_one_date_out' | 'leave_one_athlete_out'

export interface OosResult {
  protocol: OosProtocol
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
export function oosKeyFn(protocol: OosProtocol): (r: BacktestRow) => string {
  return protocol === 'leave_one_date_out' ? (r) => r.event_key : (r) => r.athlete_id
}

/** Regroupe les lignes par fold (une entrée par clé). Aucun groupe n'est scindé. */
export function foldsByKey(rows: BacktestRow[], keyFn: (r: BacktestRow) => string): Map<string, BacktestRow[]> {
  const m = new Map<string, BacktestRow[]>()
  for (const r of rows) { const k = keyFn(r); const a = m.get(k) ?? []; a.push(r); m.set(k, a) }
  return m
}

function computeOos(rows: BacktestRow[], protocol: OosProtocol): OosResult {
  const keyFn = oosKeyFn(protocol)
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
    folds: folds.size,
    n: rows.length,
    elapsed: toCategoryMetrics(rows, 'elapsed'),
    moving: toCategoryMetrics(rows, 'moving'),
    macroMapeElapsedPct: mean(macroE),
    macroMapeMovingPct: mean(macroM),
  }
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

export interface BacktestReport {
  generatedAt: string
  engineVersion: string
  profileVersion: string
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
  /** Validation hors échantillon. */
  inSample: { elapsed: CategoryMetrics; moving: CategoryMetrics }
  leaveOneDateOut: OosResult
  leaveOneAthleteOut: OosResult
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
  rows: BacktestRow[]
  excluded: ExcludedRace[]
}

export interface RunRealBacktestOptions {
  candidateCount?: number
  confirmedCount?: number
  validation?: ValidationBreakdown
  now?: Date
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
    counts: { candidates, confirmed, excluded: excluded.length, tested },
    validation: opts.validation,
    sample,
    overallElapsed,
    overallMoving,
    overall: overallMoving,
    coverageVsMoving: overallMoving.intervalCoverage,
    coverageVsElapsed: overallElapsed.intervalCoverage,
    inSample: { elapsed: overallElapsed, moving: overallMoving },
    leaveOneDateOut: computeOos(rows, 'leave_one_date_out'),
    leaveOneAthleteOut: computeOos(rows, 'leave_one_athlete_out'),
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
    rows: rows.sort((a, b) => a.race_id.localeCompare(b.race_id)),
    excluded: excluded.sort((a, b) => a.race_id.localeCompare(b.race_id)),
  }
}
