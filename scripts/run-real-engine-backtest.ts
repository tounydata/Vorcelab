// Banc de validation RÉEL du moteur de projection Vorcelab.
//
// LECTURE SEULE : ce script ne fait que des SELECT — il ne modifie/supprime jamais
// aucune activité, profil, stream, résultat ou course en base.
//
// UN SEUL ATHLÈTE À LA FOIS (`--athlete <user_id>`, obligatoire dès que les données
// en couvrent plusieurs). Strava API Policy §5.4 interdit l'analyse agrégée de
// plusieurs athlètes — y compris pseudonymisée — à des fins d'amélioration produit.
// Mesurer le moteur sur ses propres données reste licite ; agréger ne l'est pas.
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
// RÉFÉRENCE ALTIMÉTRIQUE (`--elevation-mode`, défaut `gpx_only`) :
//   • `gpx_only`               lissage du tracé SEUL — parité production, MÉTRIQUE
//                              PRINCIPALE : avant une course, on ne connaît pas son D+ réel.
//   • `post_race_strava_dplus` recale le profil lissé sur le D+ Strava constaté APRÈS la
//                              course. C'est une FUITE temporelle assumée, donc JAMAIS une
//                              métrique publiable — c'est un DIAGNOSTIC : il isole ce que
//                              coûte l'erreur d'altimétrie dans l'erreur de projection.
//                              Comparer les deux runs répond à « le lissage est-il bon ? »
//                              avec des chiffres au lieu d'une opinion.
//
// Sorties (dossier gitignoré artifacts/engine-backtest/) :
//   summary.json · results.csv · report.md
//
// Rien de personnel n'est écrit dans ces sorties : identifiants pseudonymisés,
// aucune coordonnée GPS, aucun nom.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateRaceCandidate, type RaceCandidateInput } from '../src/lib/raceValidation'
import { detectRace, buildHrPercentileLookup } from '../src/lib/raceDetection'
import {
  runRealBacktest,
  type BacktestActivity,
  type ElevationReferenceMode,
  type RaceCaseInput,
  type ValidationBreakdown,
} from '../src/lib/realBacktest'
import { RUNNER_PROFILE_WINDOW_DAYS, ENGINE_HISTORY_DAYS } from '../src/lib/engineHistory'

const RUN_TYPES_LC = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])
function isRunType(a: BacktestActivity): boolean {
  return RUN_TYPES_LC.has(String(a.sport_type ?? a.type ?? '').toLowerCase())
}
import type { RawStreamSet } from '../src/lib/runnerProfileAtDate'
import { toSummaryJson, toResultsCsv, toReportMarkdown } from '../src/lib/backtestReportFormat'
import { ageFromBirthdate } from '../src/lib/fcMax'

const OUT_DIR = resolve(process.cwd(), 'artifacts/engine-backtest')
// Fenêtre de chargement des STREAMS = fenêtre du profil récent par pente (56 j). Les
// résumés d'activités des six mois sont, eux, filtrés par le moteur (ENGINE_HISTORY_DAYS).
const WINDOW_DAYS = RUNNER_PROFILE_WINDOW_DAYS

export interface LoadedData {
  activities: BacktestActivity[]
  /** FC max SAISIE au profil (nullable) — la cascade FCmax est résolue dans le moteur. */
  profileFcByUser: Record<string, number | null>
  /** Âge (ans) par athlète, pour le fallback « 220 − âge ». */
  ageByUser: Record<string, number | null>
  /** Streams par String(strava_activity_id). */
  streams: Record<string, RawStreamSet>
  /** strava_activity_id des courses disposant de streams. */
  streamedIds: Set<string>
  /** Météo par String(strava_activity_id). */
  weatherByRace: Record<string, { temp?: number | null; wind?: number | null; precip?: number | null }>
  /** Courses disposant d'un stream FC (indicateur de rapport). */
  hrRaces?: Set<string>
}

// ── Restriction à un seul athlète (conformité Strava API Policy §5.4) ───────────

/**
 * Le banc ne peut porter que sur UN athlète à la fois.
 *
 * Strava API Policy §5.4 interdit de traiter des Strava Data « in an aggregated,
 * de-identified, or anonymized manner, for the purposes of analytics, analyses […]
 * or product or service improvements », et interdit de combiner les données de
 * plusieurs utilisateurs à ces fins. La pseudonymisation ne lève pas l'interdiction :
 * elle est explicitement visée.
 *
 * Mesurer le moteur sur ses PROPRES données reste licite. Le banc est donc restreint
 * à un athlète unique, choisi explicitement par `--athlete <user_id>`. Si les données
 * chargées en contiennent plusieurs sans que le choix soit fait, on refuse de tourner
 * plutôt que d'agréger silencieusement.
 */
export function restrictToSingleAthlete(data: LoadedData, athleteId?: string): LoadedData {
  const present = [...new Set(data.activities.map((a) => a.user_id))].sort()

  if (present.length === 0) return data

  let selected: string
  if (athleteId) {
    if (!present.includes(athleteId)) {
      throw new Error(
        `--athlete « ${athleteId} » absent des données chargées (${present.length} athlète(s) présent(s)).`,
      )
    }
    selected = athleteId
  } else if (present.length === 1) {
    selected = present[0]
  } else {
    throw new Error(
      `Les données chargées couvrent ${present.length} athlètes. Le banc ne peut porter que sur un ` +
        `seul athlète à la fois (Strava API Policy §5.4 : pas d'analyse agrégée, même pseudonymisée, ` +
        `à des fins d'amélioration du produit). Relancez avec --athlete <user_id>.`,
    )
  }

  if (present.length > 1) {
    console.log(`[backtest] restriction à un athlète unique (§5.4) — ${present.length} présents, 1 retenu`)
  }

  const activities = data.activities.filter((a) => a.user_id === selected)
  const keptIds = new Set(activities.map((a) => String(a.strava_activity_id)))

  const pick = <T>(src: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(src).filter(([id]) => keptIds.has(id)))

  return {
    ...data,
    activities,
    profileFcByUser: { [selected]: data.profileFcByUser[selected] ?? null },
    ageByUser: { [selected]: data.ageByUser[selected] ?? null },
    streams: pick(data.streams),
    weatherByRace: pick(data.weatherByRace),
    streamedIds: new Set([...data.streamedIds].filter((id) => keptIds.has(id))),
    hrRaces: data.hrRaces
      ? new Set([...data.hrRaces].filter((id) => keptIds.has(id)))
      : undefined,
  }
}

// ── Sélection & validation des candidats ────────────────────────────────────────

/** Rang de FC personnel, par athlète — indispensable à la DÉTECTION automatique.
 *
 *  Sans lui, `validateRaceCandidate` appelle `detectRace` sans `hrPercentile`, qui
 *  répond `no_intensity_signal` : la détection était donc MORTE dans le banc, et seules
 *  les courses étiquetées à la main pouvaient être testées.
 */
type HrResolver = (a: BacktestActivity) => number | null

function buildHrResolver(activities: BacktestActivity[]): HrResolver {
  const byUser = new Map<string, BacktestActivity[]>()
  for (const a of activities) {
    if (!isRunType(a)) continue
    const list = byUser.get(a.user_id)
    if (list) list.push(a)
    else byUser.set(a.user_id, [a])
  }
  const lookups = new Map<string, (hr?: number | null) => number | null>()
  for (const [user, list] of byUser) {
    lookups.set(user, buildHrPercentileLookup(list.map((a) => ({ averageHeartrate: a.average_heartrate }))))
  }
  return (a) => lookups.get(a.user_id)?.(a.average_heartrate) ?? null
}

/** Candidat = course ÉTIQUETÉE, ou compétition DÉTECTÉE automatiquement.
 *
 *  Le banc ne retenait auparavant que `is_race`/`workout_type = 1`. La détection
 *  automatique n'était appliquée qu'À L'INTÉRIEUR de ce vivier : elle pouvait donc
 *  seulement REJETER, jamais AJOUTER. Conséquence mesurée sur la base `runnerdata`
 *  (2026-07-31) : 28 des 31 sorties de 30 km et plus restaient invisibles au banc —
 *  dont un 78,5 km / 3 914 m D+ — alors qu'elles portaient toutes leur tracé GPS.
 *  Le moteur était donc validé uniquement sur ce que les athlètes avaient pensé à
 *  cocher, c'est-à-dire presque exclusivement de la route et du format court.
 */
function isRaceCandidate(a: BacktestActivity, hrOf?: HrResolver): boolean {
  if (a.is_race === true || a.workout_type === 1 || a.workout_type === '1') return true
  if (!hrOf) return false
  return detectRace({
    name: a.name, sportType: a.sport_type, type: a.type,
    distanceM: a.distance ?? null, movingTimeS: a.moving_time ?? null,
    elapsedTimeS: a.elapsed_time ?? null, hrPercentile: hrOf(a),
  }).detected
}

function toValidationInput(a: BacktestActivity, hrOf?: HrResolver): RaceCandidateInput {
  return {
    name: a.name, sportType: a.sport_type, type: a.type, startDate: a.start_date,
    distanceM: a.distance ?? null, movingTimeS: a.moving_time ?? null, elapsedTimeS: a.elapsed_time ?? null,
    totalElevationGainM: a.total_elevation_gain ?? null, isRace: a.is_race ?? null,
    workoutType: a.workout_type ?? null, deletedAt: a.deleted_at ?? null,
    hrPercentile: hrOf ? hrOf(a) : null,
  }
}

export function buildCasesAndValidation(
  data: LoadedData,
  elevationReferenceMode: ElevationReferenceMode,
): { cases: RaceCaseInput[]; validation: ValidationBreakdown } {
  const hrOf = buildHrResolver(data.activities)
  const candidates = data.activities.filter((a) => isRaceCandidate(a, hrOf))
  const rejectedReasons: Record<string, number> = {}
  const pendingReasons: Record<string, number> = {}
  let confirmed = 0, rejected = 0, pending = 0
  const confirmedRaces: BacktestActivity[] = []

  for (const a of candidates) {
    const v = validateRaceCandidate(toValidationInput(a, hrOf))
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
      // FCmax SAISIE au profil (nullable) : la cascade (user → Strava d'époque →
      // 220−âge → repère fixe) est résolue par le moteur, anti-fuite, avec source.
      fcMax: data.profileFcByUser[race.user_id] ?? null,
      athleteAge: data.ageByUser[race.user_id] ?? null,
      hasWeather: w != null,
      // La météo n'agit que via les surfaces OSM (absentes ici) → non consommée dans
      // ce lot. On la transmet malgré tout pour la traçabilité (has_weather).
      weather: w ? { precip: w.precip ?? undefined } : null,
      hasHr: data.hrRaces?.has(rid),
      surfaces: null,
      windowDays: WINDOW_DAYS,
      elevationReferenceMode,
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
  /** FC max SAISIE au profil, par athlète (nullable). */
  profileFcByUser?: Record<string, number | null>
  /** Âge par athlète (ans). À défaut, dérivé de `birthdateByUser`. */
  ageByUser?: Record<string, number | null>
  birthdateByUser?: Record<string, string | null>
  /** Rétro-compat : ancienne clé (traitée comme FC max profil). */
  fcMaxByUser?: Record<string, number>
  streams: Record<string, RawStreamSet>
  weatherByRace?: Record<string, { temp?: number | null; wind?: number | null; precip?: number | null }>
  /** strava_activity_id (texte) des courses disposant d'un stream FC. */
  hrRaces?: string[]
}

export function loadFixture(path: string): LoadedData {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Fixture
  const streams = raw.streams ?? {}
  const profileFcByUser: Record<string, number | null> = { ...(raw.profileFcByUser ?? raw.fcMaxByUser ?? {}) }
  const ageByUser: Record<string, number | null> = { ...(raw.ageByUser ?? {}) }
  if (raw.birthdateByUser) {
    for (const [u, bd] of Object.entries(raw.birthdateByUser)) if (ageByUser[u] == null) ageByUser[u] = ageFromBirthdate(bd)
  }
  return {
    activities: raw.activities,
    profileFcByUser,
    ageByUser,
    streams,
    streamedIds: new Set(Object.keys(streams)),
    weatherByRace: raw.weatherByRace ?? {},
    hrRaces: new Set(raw.hrRaces ?? []),
  }
}

// ── Source 2 : Supabase (lecture seule) ─────────────────────────────────────────

export async function loadFromSupabase(): Promise<LoadedData> {
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

  // 2. FC max SAISIE + âge par athlète (LECTURE SEULE ; la cascade FCmax est résolue,
  //    anti-fuite et avec traçage de la source, dans le moteur — jamais écrite en base).
  const profileFcByUser: Record<string, number | null> = {}
  const ageByUser: Record<string, number | null> = {}
  const { data: profiles } = await sb.from('profiles').select('id,fc_max,age,birthdate')
  for (const p of (profiles ?? []) as Record<string, unknown>[]) {
    const id = String(p.id)
    profileFcByUser[id] = (p.fc_max as number) ?? null
    const ageVal = typeof p.age === 'number' ? p.age : ageFromBirthdate(p.birthdate)
    ageByUser[id] = ageVal ?? null
  }

  // 3. Streams nécessaires : courses confirmées + activités RUNNING antérieures sur la
  //    fenêtre MOTEUR de six mois (ENGINE_HISTORY_DAYS). Les records auto (streams) ont
  //    besoin de la mémoire longue ; le profil de pente n'utilise qu'un sous-ensemble
  //    (56 j) des mêmes streams. Seules les activités course à pied/trail ont besoin de
  //    streams (profil + records) → on ne charge pas les autres sports.
  const hrOf = buildHrResolver(activities)
  const candidates = activities.filter((a) => isRaceCandidate(a, hrOf))
  const confirmed = candidates.filter((a) => validateRaceCandidate(toValidationInput(a, hrOf)).status === 'confirmed')
  const neededIds = new Set<string>()
  for (const race of confirmed) {
    neededIds.add(String(race.strava_activity_id))
    const start = Date.parse(race.start_date)
    const lo = start - ENGINE_HISTORY_DAYS * 86_400_000
    for (const a of activities) {
      if (a.user_id !== race.user_id) continue
      if (!isRunType(a)) continue
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

  return { activities, profileFcByUser, ageByUser, streams, streamedIds, weatherByRace }
}

// ── Point d'entrée ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const fixtureIdx = args.indexOf('--fixture')
  const source = fixtureIdx >= 0 && args[fixtureIdx + 1] ? `fixture:${args[fixtureIdx + 1]}` : 'supabase'

  const modeIdx = args.indexOf('--elevation-mode')
  const rawMode = modeIdx >= 0 ? args[modeIdx + 1] : undefined
  const ALLOWED_MODES: ElevationReferenceMode[] = ['gpx_only', 'post_race_strava_dplus']
  if (rawMode !== undefined && !ALLOWED_MODES.includes(rawMode as ElevationReferenceMode)) {
    throw new Error(`--elevation-mode invalide : « ${rawMode} ». Attendu : ${ALLOWED_MODES.join(' | ')}.`)
  }
  const elevationMode = (rawMode as ElevationReferenceMode | undefined) ?? 'gpx_only'

  console.log(`[backtest] source = ${source} · altimétrie = ${elevationMode}`)
  if (elevationMode !== 'gpx_only') {
    console.warn(
      `[backtest] ⚠ mode « ${elevationMode} » : le profil est recalé sur une donnée POSTÉRIEURE ` +
      `à la course. Résultat de DIAGNOSTIC uniquement — ne jamais le publier comme précision du moteur.`,
    )
  }
  const athleteIdx = args.indexOf('--athlete')
  const athleteArg = athleteIdx >= 0 ? args[athleteIdx + 1] : undefined

  const loaded = fixtureIdx >= 0 ? loadFixture(args[fixtureIdx + 1]) : await loadFromSupabase()
  const data = restrictToSingleAthlete(loaded, athleteArg)
  console.log(`[backtest] ${data.activities.length} activités chargées · ${Object.keys(data.streams).length} streams`)

  const { cases, validation } = buildCasesAndValidation(data, elevationMode)
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

// Exécuté directement (`npm run backtest:real`) — mais les fonctions de chargement
// ci-dessus sont aussi importées par `sweep-engine-params.ts`, qui rejoue le banc pour
// plusieurs réglages sans recharger les données. On ne lance donc `main()` que lorsque ce
// fichier est le point d'entrée.
const isEntryPoint = process.argv[1] && resolve(process.argv[1]).endsWith('run-real-engine-backtest.ts')
if (isEntryPoint) {
  main().catch((err) => {
    console.error('[backtest] échec :', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
