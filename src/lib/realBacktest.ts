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
import { buildRunnerProfileAtDate, type RawStreamSet } from './runnerProfileAtDate'
import { computeErrorMetrics, distanceBucket, dplusBucket, type ErrorMetrics } from './engineBacktest'
import { ENGINE_VERSION } from './engineVersion'
import { resolveFcMax } from './fcMax'

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
  fcMax: number
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

export interface BacktestRow {
  race_id: string
  athlete_id: string
  date: string
  sport: 'road' | 'trail'
  distance_km: number
  dplus_m: number
  dplus_per_km: number
  actual_s: number
  actual_elapsed_s: number | null
  predicted_s: number
  low_s: number
  high_s: number
  error_s: number
  absolute_error_s: number
  error_pct: number
  inside_interval: boolean
  confidence: string
  activities_before_count: number
  stream_coverage: number
  alt_coverage: number
  used_fallback: boolean
  profile_quality: ProfileQuality
  has_weather: boolean
  has_hr: boolean
  engine_version: string
  profile_version: string
  computed_at: string
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

/**
 * Projette UNE course avec le vrai moteur et compare au réel. Retourne soit une
 * ligne scorée, soit une exclusion motivée (GPS manquant, etc.). Les ids restent
 * bruts ici (préfixés `_raw`) ; ils sont pseudonymisés par `runRealBacktest`.
 */
export function projectRaceCase(c: RaceCaseInput): ProjectOutcome {
  const race = c.race
  const rawUserId = race.user_id
  const rawRaceId = String(race.strava_activity_id)
  const date = race.start_date.slice(0, 10)

  const actualS = typeof race.moving_time === 'number' ? race.moving_time : 0
  if (!(actualS > 0)) {
    return { excluded: { race_id: rawRaceId, athlete_id: rawUserId, date, exclusion_reason: 'no_real_time', _rawUserId: rawUserId, _rawRaceId: rawRaceId } }
  }

  const gpx = reconstructGpx(c.raceStreams)
  if (!gpx.usable) {
    return { excluded: { race_id: rawRaceId, athlete_id: rawUserId, date, exclusion_reason: gpx.issues[0] ?? 'no_gps', _rawUserId: rawUserId, _rawRaceId: rawRaceId } }
  }

  const prior = selectPriorActivities(c.allActivities, race)
  const engineActivities = prior.map(toEngineActivity)

  // FC max « d'époque » anti-fuite : on préfère la valeur profil (manuelle, stable,
  // non dérivée d'une course future) ; à défaut, on estime depuis la FC max observée
  // UNIQUEMENT sur les activités ANTÉRIEURES (par athlète — jamais la course ni après).
  const effectiveFcMax = resolveFcMax(c.fcMax, prior as unknown as Record<string, unknown>[])

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

  const points: GpxPoint[] = gpx.points
  const proj = computeRaceProjection(
    points,
    engineActivities,
    profileObj,
    { type: race.sport_type ?? race.type ?? null, goal_time: null },
    terrain,
  )

  const predicted = Math.round(proj.estTimeS)
  const low = Math.round(proj.timeMin)
  const high = Math.round(proj.timeMax)
  const err = predicted - actualS
  const { quality, confident } = profileQuality(runnerProfile)
  const distanceKm = proj.totalDistM / 1000
  const dplusPerKm = distanceKm > 0 ? proj.dplus / distanceKm : 0

  const row: BacktestRow & { _rawUserId: string; _rawRaceId: string } = {
    race_id: rawRaceId,
    athlete_id: rawUserId,
    date,
    sport: proj.isTrail ? 'trail' : 'road',
    distance_km: +distanceKm.toFixed(2),
    dplus_m: Math.round(proj.dplus),
    dplus_per_km: +dplusPerKm.toFixed(1),
    actual_s: actualS,
    actual_elapsed_s: typeof race.elapsed_time === 'number' ? race.elapsed_time : null,
    predicted_s: predicted,
    low_s: low,
    high_s: high,
    error_s: err,
    absolute_error_s: Math.abs(err),
    error_pct: actualS > 0 ? +((err / actualS) * 100).toFixed(2) : 0,
    inside_interval: actualS >= low && actualS <= high,
    confidence: proj.confidence,
    activities_before_count: prior.length,
    stream_coverage: +runnerProfile.streamCoverage.toFixed(3),
    alt_coverage: +gpx.altCoverage.toFixed(3),
    used_fallback: confident === 0,
    profile_quality: quality,
    has_weather: c.hasWeather,
    has_hr: c.hasHr ?? ((c.raceStreams as RawStreamSet | null)?.heartrate != null),
    engine_version: ENGINE_VERSION,
    profile_version: PROFILE_VERSION,
    computed_at: new Date(race.start_date).toISOString(), // « d'époque » → déterministe
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

function toCategoryMetrics(rows: BacktestRow[]): CategoryMetrics {
  const scored = rows.map((r) => ({ predictedS: r.predicted_s, actualS: r.actual_s, low: r.low_s, high: r.high_s }))
  const base = computeErrorMetrics(scored)
  const n = rows.length
  const optimistic = rows.filter((r) => r.predicted_s < r.actual_s).length
  const pessimistic = rows.filter((r) => r.predicted_s > r.actual_s).length
  return { ...base, optimisticPct: n ? optimistic / n : 0, pessimisticPct: n ? pessimistic / n : 0 }
}

function groupBy(rows: BacktestRow[], keyFn: (r: BacktestRow) => string): Record<string, CategoryMetrics> {
  const groups = new Map<string, BacktestRow[]>()
  for (const r of rows) { const k = keyFn(r); const a = groups.get(k) ?? []; a.push(r); groups.set(k, a) }
  const out: Record<string, CategoryMetrics> = {}
  for (const [k, v] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out[k] = toCategoryMetrics(v)
  return out
}

export interface ValidationBreakdown {
  candidates: number
  confirmed: number
  rejected: number
  pending: number
  rejectedReasons: Record<string, number>
  pendingReasons: Record<string, number>
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
  overall: CategoryMetrics
  byAthlete: Record<string, CategoryMetrics>
  byTerrain: Record<string, CategoryMetrics>
  byDistance: Record<string, CategoryMetrics>
  byDplus: Record<string, CategoryMetrics>
  byProfileQuality: Record<string, CategoryMetrics>
  byWeather: Record<string, CategoryMetrics>
  byHr: Record<string, CategoryMetrics>
  byEngineMode: Record<string, CategoryMetrics>
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

  for (const c of cases) {
    const out = projectRaceCase(c)
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

  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    engineVersion: ENGINE_VERSION,
    profileVersion: PROFILE_VERSION,
    counts: { candidates, confirmed, excluded: excluded.length, tested },
    validation: opts.validation,
    overall: toCategoryMetrics(rows),
    byAthlete: groupBy(rows, (r) => r.athlete_id),
    byTerrain: groupBy(rows, (r) => r.sport),
    byDistance: groupBy(rows, (r) => distanceBucket(r.distance_km)),
    byDplus: groupBy(rows, (r) => dplusBucket(r.dplus_per_km)),
    byProfileQuality: groupBy(rows, (r) => r.profile_quality),
    byWeather: groupBy(rows, (r) => (r.has_weather ? 'avec météo' : 'sans météo')),
    byHr: groupBy(rows, (r) => (r.has_hr ? 'avec FC' : 'sans FC')),
    byEngineMode: groupBy(rows, (r) => (r.used_fallback ? 'fallback' : 'historique')),
    rows: rows.sort((a, b) => a.race_id.localeCompare(b.race_id)),
    excluded: excluded.sort((a, b) => a.race_id.localeCompare(b.race_id)),
  }
}
