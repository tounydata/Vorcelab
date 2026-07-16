// Banc de validation RÉEL du moteur de projection Vorcelab.
//
// LECTURE SEULE : ce script ne fait que des SELECT — il ne modifie/supprime jamais
// aucune activité, profil, stream, résultat ou course en base.
//
// Deux sources de données, au choix :
//   1. Supabase (chemin de reproduction officiel, une commande) :
//        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backtest:real
//      (la service role key est requise car le RLS restreint chaque ligne à son
//       propriétaire ; elle vient UNIQUEMENT de l'environnement — jamais committée.)
//   2. Fixture JSON locale (déterministe, hors ligne) :
//        npm run backtest:real -- --fixture <chemin>.backtest-fixture.json
//      (une fixture peut contenir des coordonnées réelles → gitignorée, jamais poussée.)
//
// Sorties (dossier gitignoré artifacts/engine-backtest/) :
//   summary.json · results.csv · report.md
//
// Rien de personnel n'est écrit dans ces sorties : identifiants pseudonymisés,
// aucune coordonnée GPS, aucun nom.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateRaceCandidate, type RaceCandidateInput } from '../src/lib/raceValidation'
import {
  runRealBacktest,
  type BacktestActivity,
  type RaceCaseInput,
  type ValidationBreakdown,
} from '../src/lib/realBacktest'
import type { RawStreamSet } from '../src/lib/runnerProfileAtDate'
import { toSummaryJson, toResultsCsv, toReportMarkdown } from '../src/lib/backtestReportFormat'
import { estimateFcMaxFromActivities, resolveFcMax } from '../src/lib/fcMax'

const OUT_DIR = resolve(process.cwd(), 'artifacts/engine-backtest')
const WINDOW_DAYS = 56

interface LoadedData {
  activities: BacktestActivity[]
  fcMaxByUser: Record<string, number>
  /** Streams par String(strava_activity_id). */
  streams: Record<string, RawStreamSet>
  /** strava_activity_id des courses disposant de streams. */
  streamedIds: Set<string>
  /** Météo par String(strava_activity_id). */
  weatherByRace: Record<string, { temp?: number | null; wind?: number | null; precip?: number | null }>
  /** Courses disposant d'un stream FC (indicateur de rapport). */
  hrRaces?: Set<string>
}

// ── Sélection & validation des candidats ────────────────────────────────────────

function isRaceCandidate(a: BacktestActivity): boolean {
  return a.is_race === true || a.workout_type === 1 || a.workout_type === '1'
}

function toValidationInput(a: BacktestActivity): RaceCandidateInput {
  return {
    name: a.name, sportType: a.sport_type, type: a.type, startDate: a.start_date,
    distanceM: a.distance ?? null, movingTimeS: a.moving_time ?? null, elapsedTimeS: a.elapsed_time ?? null,
    totalElevationGainM: a.total_elevation_gain ?? null, isRace: a.is_race ?? null,
    workoutType: a.workout_type ?? null, deletedAt: a.deleted_at ?? null,
  }
}

function buildCasesAndValidation(data: LoadedData): { cases: RaceCaseInput[]; validation: ValidationBreakdown } {
  const candidates = data.activities.filter(isRaceCandidate)
  const rejectedReasons: Record<string, number> = {}
  const pendingReasons: Record<string, number> = {}
  let confirmed = 0, rejected = 0, pending = 0
  const confirmedRaces: BacktestActivity[] = []

  for (const a of candidates) {
    const v = validateRaceCandidate(toValidationInput(a))
    if (v.status === 'confirmed') { confirmed++; confirmedRaces.push(a) }
    else if (v.status === 'rejected') { rejected++; for (const r of v.reasons) rejectedReasons[r] = (rejectedReasons[r] ?? 0) + 1 }
    else { pending++; for (const r of v.reasons) pendingReasons[r] = (pendingReasons[r] ?? 0) + 1 }
  }

  const cases: RaceCaseInput[] = confirmedRaces.map((race) => {
    const rid = String(race.strava_activity_id)
    const w = data.weatherByRace[rid]
    return {
      race,
      raceStreams: data.streams[rid] ?? null,
      allActivities: data.activities,
      priorStreams: data.streams,
      fcMax: data.fcMaxByUser[race.user_id] ?? resolveFcMax(undefined, data.activities as unknown as Record<string, unknown>[]),
      hasWeather: w != null,
      // La météo n'agit que via les surfaces OSM (absentes ici) → non consommée dans
      // ce lot. On la transmet malgré tout pour la traçabilité (has_weather).
      weather: w ? { precip: w.precip ?? undefined } : null,
      hasHr: data.hrRaces?.has(rid),
      surfaces: null,
      windowDays: WINDOW_DAYS,
    }
  })

  return {
    cases,
    validation: { candidates: candidates.length, confirmed, rejected, pending, rejectedReasons, pendingReasons },
  }
}

// ── Source 1 : fixture JSON locale ──────────────────────────────────────────────

interface Fixture {
  activities: BacktestActivity[]
  fcMaxByUser?: Record<string, number>
  streams: Record<string, RawStreamSet>
  weatherByRace?: Record<string, { temp?: number | null; wind?: number | null; precip?: number | null }>
  /** strava_activity_id (texte) des courses disposant d'un stream FC. */
  hrRaces?: string[]
}

function loadFixture(path: string): LoadedData {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Fixture
  const streams = raw.streams ?? {}
  const fcMaxByUser = raw.fcMaxByUser ?? {}
  // fcMax par athlète : profil fourni sinon estimation depuis ses propres activités.
  if (Object.keys(fcMaxByUser).length === 0) {
    const byUser = new Map<string, BacktestActivity[]>()
    for (const a of raw.activities) { const arr = byUser.get(a.user_id) ?? []; arr.push(a); byUser.set(a.user_id, arr) }
    for (const [u, acts] of byUser) fcMaxByUser[u] = estimateFcMaxFromActivities(acts as unknown as Record<string, unknown>[]) ?? 185
  }
  return {
    activities: raw.activities,
    fcMaxByUser,
    streams,
    streamedIds: new Set(Object.keys(streams)),
    weatherByRace: raw.weatherByRace ?? {},
    hrRaces: new Set(raw.hrRaces ?? []),
  }
}

// ── Source 2 : Supabase (lecture seule) ─────────────────────────────────────────

async function loadFromSupabase(): Promise<LoadedData> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (lecture seule). Ou utilisez --fixture <chemin>.')
  }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // 1. Toutes les activités (résumés) — pagination par 1000.
  const activities: BacktestActivity[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('strava_activities')
      .select('id,user_id,strava_activity_id,name,type,sport_type,start_date,start_date_local,distance,moving_time,elapsed_time,total_elevation_gain,average_speed,average_heartrate,max_heartrate,average_cadence,is_race,deleted_at,raw_data')
      .order('start_date', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`strava_activities: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as Record<string, unknown>[]) {
      const raw = (r.raw_data ?? {}) as Record<string, unknown>
      activities.push({
        id: String(r.id), user_id: String(r.user_id), strava_activity_id: r.strava_activity_id as number,
        name: (r.name as string) ?? null, type: (r.type as string) ?? null, sport_type: (r.sport_type as string) ?? null,
        start_date: r.start_date as string, start_date_local: (r.start_date_local as string) ?? null,
        distance: (r.distance as number) ?? null, moving_time: (r.moving_time as number) ?? null,
        elapsed_time: (r.elapsed_time as number) ?? null, total_elevation_gain: (r.total_elevation_gain as number) ?? null,
        average_speed: (r.average_speed as number) ?? null, average_heartrate: (r.average_heartrate as number) ?? null,
        max_heartrate: (r.max_heartrate as number) ?? null, average_cadence: (r.average_cadence as number) ?? null,
        is_race: (r.is_race as boolean) ?? null, workout_type: (raw.workout_type as number | string) ?? null,
        average_temp: (raw.average_temp as number) ?? null, deleted_at: (r.deleted_at as string) ?? null,
      })
    }
    if (data.length < 1000) break
  }

  // 2. fcMax par athlète (profil saisi → estimation).
  const fcMaxByUser: Record<string, number> = {}
  const { data: profiles } = await sb.from('profiles').select('id,fc_max')
  const profileFc = new Map<string, number | null>()
  for (const p of (profiles ?? []) as Record<string, unknown>[]) profileFc.set(String(p.id), (p.fc_max as number) ?? null)
  const userIds = [...new Set(activities.map((a) => a.user_id))]
  for (const u of userIds) {
    const acts = activities.filter((a) => a.user_id === u)
    fcMaxByUser[u] = resolveFcMax(profileFc.get(u) ?? undefined, acts as unknown as Record<string, unknown>[])
  }

  // 3. Streams nécessaires : courses confirmées avec streams + activités antérieures
  //    dans la fenêtre. On restreint le volume au strict nécessaire.
  const candidates = activities.filter(isRaceCandidate)
  const confirmed = candidates.filter((a) => validateRaceCandidate(toValidationInput(a)).status === 'confirmed')
  const neededIds = new Set<string>()
  for (const race of confirmed) {
    neededIds.add(String(race.strava_activity_id))
    const start = Date.parse(race.start_date)
    const lo = start - WINDOW_DAYS * 86_400_000
    for (const a of activities) {
      if (a.user_id !== race.user_id) continue
      const d = Date.parse(a.start_date)
      if (d < start && d >= lo) neededIds.add(String(a.strava_activity_id))
    }
  }

  const streams: Record<string, RawStreamSet> = {}
  const streamedIds = new Set<string>()
  const idList = [...neededIds].map((s) => Number(s)).filter((n) => Number.isFinite(n))
  for (let i = 0; i < idList.length; i += 50) {
    const batch = idList.slice(i, i + 50)
    const { data, error } = await sb.from('activity_streams').select('activity_id,data').in('activity_id', batch)
    if (error) throw new Error(`activity_streams: ${error.message}`)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = String(r.activity_id)
      streams[id] = r.data as RawStreamSet
      streamedIds.add(id)
    }
  }

  // 4. Météo des courses.
  const weatherByRace: Record<string, { temp?: number | null; wind?: number | null; precip?: number | null }> = {}
  const raceIds = confirmed.map((r) => Number(r.strava_activity_id)).filter((n) => Number.isFinite(n))
  for (let i = 0; i < raceIds.length; i += 50) {
    const batch = raceIds.slice(i, i + 50)
    const { data } = await sb.from('activity_weather').select('activity_id,temp,wind,precip').in('activity_id', batch)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      weatherByRace[String(r.activity_id)] = { temp: r.temp as number, wind: r.wind as number, precip: r.precip as number }
    }
  }

  return { activities, fcMaxByUser, streams, streamedIds, weatherByRace }
}

// ── Point d'entrée ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const fixtureIdx = args.indexOf('--fixture')
  const source = fixtureIdx >= 0 && args[fixtureIdx + 1] ? `fixture:${args[fixtureIdx + 1]}` : 'supabase'

  console.log(`[backtest] source = ${source}`)
  const data = fixtureIdx >= 0 ? loadFixture(args[fixtureIdx + 1]) : await loadFromSupabase()
  console.log(`[backtest] ${data.activities.length} activités chargées · ${Object.keys(data.streams).length} streams`)

  const { cases, validation } = buildCasesAndValidation(data)
  console.log(`[backtest] candidats=${validation.candidates} confirmées=${validation.confirmed} rejetées=${validation.rejected} en_attente=${validation.pending}`)

  const report = runRealBacktest(cases, { validation })
  console.log(`[backtest] testées=${report.counts.tested} exclues=${report.counts.excluded}`)

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, 'summary.json'), toSummaryJson(report))
  writeFileSync(resolve(OUT_DIR, 'results.csv'), toResultsCsv(report))
  writeFileSync(resolve(OUT_DIR, 'report.md'), toReportMarkdown(report))
  console.log(`[backtest] artefacts écrits dans ${OUT_DIR}`)

  if (report.counts.tested === 0) {
    console.warn('[backtest] AUCUNE course testée — vérifiez la disponibilité des streams.')
  }
}

main().catch((err) => {
  console.error('[backtest] échec :', err instanceof Error ? err.message : err)
  process.exit(1)
})
