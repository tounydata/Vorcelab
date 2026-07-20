// compute-runner-profile/index.ts
//
// Edge Function : recalcule le profil coureur en PRODUCTION. Utilise désormais LE MÊME
// cœur pur que le web, le mobile et le benchmark — `buildRunnerProfileFromActivitiesAndStreams`
// (paquet runner-core, synchronisé sous `_shared/runner-core`) — ce qui garantit une PARITÉ
// PARFAITE du profil produit (buckets/récup/dérive + bestEfforts/criticalSpeed/bestClimb +
// en-tête de schéma). Plus aucune ré-implémentation divergente ici.
//
// Données : cache-first (activity_streams), Strava uniquement pour les streams manquants,
// respect du quota (429), sur la fenêtre moteur de 183 jours (le cœur applique 56 j pour le
// profil détaillé et 183 j pour les records). Persistance NON DESTRUCTIVE (préserve les
// extras web : météo / pénalités de condition / descente technique).

import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import { getValidStravaAccessToken } from '../_shared/strava.ts'
import {
  buildRunnerProfileFromActivitiesAndStreams,
  ENGINE_HISTORY_DAYS,
  type RawStreamSet,
} from '../_shared/runner-core/mod.ts'
import { isRunningActivity } from '../_shared/runner-core/engineHistory.ts'

const STRAVA_STREAMS_URL = 'https://www.strava.com/api/v3/activities'

interface Streams { [k: string]: { data: unknown[] } | undefined }

/** Streams depuis Strava (une activité). 429 → rate limited (l'appelant s'arrête). */
async function fetchStreams(
  accessToken: string,
  activityId: number | bigint,
): Promise<{ streams: Streams | null; rateLimited: boolean }> {
  const keys = 'time,altitude,velocity_smooth,heartrate,grade_smooth,distance,cadence,latlng'
  const res = await fetch(
    `${STRAVA_STREAMS_URL}/${activityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (res.status === 429) return { streams: null, rateLimited: true }
  if (!res.ok) return { streams: null, rateLimited: false }
  return { streams: (await res.json()) as Streams, rateLimited: false }
}

// Champs de PROFIL produits par le web (buildRunnerProfile) mais PAS par le cœur commun
// (ils dépendent de la météo / d'OSM) : on ne doit jamais les effacer lors d'un recalcul.
const PRESERVE_KEYS = [
  'conditionPenalties', 'technicalDescent',
  'postClimbRecoveryByBucket', 'postDownhillRecoveryByBucket', 'downhillFatigue',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)
  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)

  try {
    const user = await requireAuth(req)
    const supabase = getServiceClient()

    // Profil (fcMax + runner_profile existant, pour la persistance non destructive).
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('fc_max,runner_profile')
      .eq('id', user.id)
      .single()
    const existingProfile =
      ((profileRow as { runner_profile?: Record<string, unknown> } | null)?.runner_profile) ?? null
    const fcMax: number = (profileRow as { fc_max?: number } | null)?.fc_max ?? 190

    // Activités running/trail sur la fenêtre MOTEUR (183 j). Le cœur applique 56 j pour le
    // profil détaillé par pente et 183 j pour les records — on charge donc la fenêtre large.
    //
    // §2 : plus de limite fixe (l'ancien HARD_CAP = 400 tronquait silencieusement les gros
    // volumes). On PAGINE toute la fenêtre. Bornes STRICTES en haut (activités futures ou
    // horodatées « maintenant » exclues), inclusives en bas. Activités supprimées écartées
    // (`deleted_at IS NULL`). Présélection SQL large sur `type` ET `sport_type`, puis filtre
    // running EXACT via le cœur (`isRunningActivity`) → parité totale avec le moteur.
    type ActivityRow = {
      strava_activity_id: number
      start_date: string
      moving_time: number | null
      type: string | null
      sport_type: string | null
      total_elevation_gain: number | null
      distance: number | null
      average_heartrate: number | null
      average_speed: number | null
    }
    const nowISO = new Date().toISOString()
    const sinceISO = new Date(Date.now() - ENGINE_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    // Présélection SQL : familles running/trail sur les DEUX colonnes (valeurs Strava
    // usuelles ; le filtre exact ci-dessous rattrape la casse et les variantes).
    const RUN_VALUES = ['Run', 'TrailRun', 'VirtualRun', 'Running', 'Trail Run']
    const inList = RUN_VALUES.map((v) => (v.includes(' ') ? `"${v}"` : v)).join(',')
    const runFilter = `type.in.(${inList}),sport_type.in.(${inList})`
    const PAGE = 200
    const activitiesRaw: ActivityRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from('strava_activities')
        .select('strava_activity_id,start_date,moving_time,type,sport_type,total_elevation_gain,distance,average_heartrate,average_speed')
        .eq('user_id', user.id)
        .or(runFilter)
        .is('deleted_at', null)
        .gte('start_date', sinceISO)
        .lt('start_date', nowISO)
        .order('start_date', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`activities query failed: ${error.message}`)
      const rows = (page ?? []) as ActivityRow[]
      activitiesRaw.push(...rows)
      if (rows.length < PAGE) break
    }

    // Filtre running EXACT (casse + `sport_type ?? type`) — même prédicat que le moteur.
    const activities = activitiesRaw.filter((a) =>
      isRunningActivity({ type: a.type, sport_type: a.sport_type }))

    if (activities.length === 0) {
      return new Response(JSON.stringify({ error: 'No run activities found' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let accessToken: string
    try {
      accessToken = await getValidStravaAccessToken(supabase, user.id)
    } catch {
      return new Response(JSON.stringify({ error: 'No Strava connection' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // ── Streams cache-first (§4) : cache Supabase EN PRIORITÉ, Strava seulement pour les
    // manquants, mise en cache, arrêt au premier 429. Aucun ancien stream supprimé.
    const wantedIds = activities.map((a) => a.strava_activity_id)
    const cacheById = new Map<number, Streams>()
    if (wantedIds.length > 0) {
      const { data: cachedRows } = await supabase
        .from('activity_streams')
        .select('activity_id,data')
        .eq('user_id', user.id)
        .in('activity_id', wantedIds)
      for (const row of (cachedRows ?? []) as Array<{ activity_id: number; data: Streams }>) {
        if (row.data) cacheById.set(Number(row.activity_id), row.data)
      }
    }

    const diag = { streams_requested: activities.length, streams_loaded_from_cache: 0, streams_fetched_from_strava: 0, streams_missing: 0 }
    let stravaRateLimited = false
    const streamsByActivityId: Record<string, Streams> = {}

    for (const act of activities) {
      const id = Number(act.strava_activity_id)
      let streams: Streams | null = cacheById.get(id) ?? null
      if (streams) {
        diag.streams_loaded_from_cache++
      } else if (!stravaRateLimited) {
        const fetched = await fetchStreams(accessToken, act.strava_activity_id)
        if (fetched.rateLimited) { stravaRateLimited = true; diag.streams_missing++; continue }
        streams = fetched.streams
        if (streams && streams.time?.data?.length) {
          diag.streams_fetched_from_strava++
          supabase
            .from('activity_streams')
            .upsert(
              { user_id: user.id, activity_id: id, data: streams as unknown as Record<string, unknown>, cached_at: new Date().toISOString() },
              { onConflict: 'user_id,activity_id' },
            )
            .then(({ error }: { error: { message: string } | null }) => { if (error) console.error('stream cache write error:', error.message) })
        }
      } else { diag.streams_missing++; continue }

      if (!streams || !streams.time?.data?.length) { diag.streams_missing++; continue }
      streamsByActivityId[String(act.strava_activity_id)] = streams
    }

    const streamCacheHitRate = diag.streams_requested > 0
      ? +(diag.streams_loaded_from_cache / diag.streams_requested).toFixed(3) : 0

    // ── Profil via LE CŒUR COMMUN (parité web/mobile/benchmark) ────────────────
    const computedProfile = buildRunnerProfileFromActivitiesAndStreams({
      activities: activities.map((a) => ({
        strava_activity_id: a.strava_activity_id,
        start_date: a.start_date,
        moving_time: a.moving_time ?? 0,
        total_elevation_gain: a.total_elevation_gain ?? 0,
        type: a.type,
        sport_type: a.sport_type,
        average_heartrate: a.average_heartrate,
        average_speed: a.average_speed,
      })),
      streamsByActivityId: streamsByActivityId as unknown as Record<string, RawStreamSet>,
      fcMax,
      asOfMs: Date.now(),
    })

    // Diagnostics de cache attachés au profil.
    const streamDiagnostics = {
      streams_requested: diag.streams_requested,
      streams_loaded_from_cache: diag.streams_loaded_from_cache,
      streams_fetched_from_strava: diag.streams_fetched_from_strava,
      streams_missing: diag.streams_missing,
      stream_cache_hit_rate: streamCacheHitRate,
      strava_rate_limited: stravaRateLimited,
    }

    // ── Persistance NON DESTRUCTIVE : le cœur produit le contrat engine-critical complet ;
    // on préserve uniquement les EXTRAS web (météo / condition / descente technique) que le
    // cœur ne calcule pas, s'ils existaient déjà.
    const preserved: Record<string, unknown> = {}
    if (existingProfile) {
      for (const k of PRESERVE_KEYS) if (k in existingProfile) preserved[k] = existingProfile[k]
    }
    const runnerProfile: Record<string, unknown> = {
      ...preserved,
      ...(computedProfile as unknown as Record<string, unknown>),
      _computedAt: computedProfile.computedAt,
      fcMax,
      streamDiagnostics,
    }

    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        runner_profile: runnerProfile,
        runner_profile_at: computedProfile.computedAt,
        updated_at: computedProfile.computedAt,
      })

    return new Response(
      JSON.stringify({ ok: true, profile: runnerProfile, stream_diagnostics: streamDiagnostics, preserved_fields: Object.keys(preserved) }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthorized' ? 401 : 500
    if (status === 500) console.error('compute-runner-profile error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
