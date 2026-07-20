// lock-projection-snapshot/index.ts
//
// Création SERVEUR d'un snapshot prospectif de projection (§4). Auparavant, le client
// insérait directement la ligne (RLS `user_id = auth.uid()`), en s'auto-contrôlant que la
// course n'avait pas commencé et en ne stockant qu'une empreinte. Désormais :
//   • création CÔTÉ SERVEUR uniquement (le service_role insère ; le client n'a plus le droit
//     d'INSERT — cf. migration) → une preuve prospective ne peut plus être forgée côté client ;
//   • la borne « la course n'a pas commencé » est VÉRIFIÉE SERVEUR à partir de `race_calendar`
//     (date + start_time faisant autorité), pas d'une valeur fournie par le client ;
//   • on enregistre un MANIFESTE COMPLET des entrées (liste des activités agrégées de la
//     fenêtre moteur — jamais de GPS brut), et l'empreinte est calculée sur ce manifeste.
//
// Le client n'envoie que l'ARTEFACT à figer (prédictions + drapeaux + versions du moteur) ;
// tout le reste (fenêtre, manifeste, activity_count, borne temporelle) est reconstruit serveur.

import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import { ENGINE_HISTORY_DAYS } from '../_shared/runner-core/mod.ts'
import { isRunningActivity } from '../_shared/runner-core/engineHistory.ts'
import {
  computeSnapshotFingerprint,
  type ActivityManifestEntry,
} from '../_shared/runner-core/projectionSnapshot.ts'

interface LockBody {
  raceId?: string
  predictionCentralS?: number
  predictionPrudentS?: number
  predictionAggressiveS?: number
  usedPersonalFade?: boolean
  usedSteepnessCalibration?: boolean
  usedFallback?: boolean
  fallbackSources?: string[]
  engineVersion?: string
  profileVersion?: string
  profileSchemaVersion?: string
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)
  const cors = getCorsHeaders(req.headers.get('origin'))

  try {
    const user = await requireAuth(req)
    const supabase = getServiceClient()
    const body = (await req.json().catch(() => ({}))) as LockBody

    const raceId = typeof body.raceId === 'string' ? body.raceId : ''
    const central = Math.round(Number(body.predictionCentralS))
    if (!raceId || !(central > 0)) return json({ result: 'invalid' }, 400, cors)

    const engineVersion = String(body.engineVersion ?? '')
    const profileVersion = String(body.profileVersion ?? '')
    const profileSchemaVersion = String(body.profileSchemaVersion ?? '')
    if (!engineVersion || !profileVersion) return json({ result: 'invalid' }, 400, cors)

    // ── Course (fait autorité) : appartenance à l'utilisateur + horaire de départ ──────
    const { data: race } = await supabase
      .from('race_calendar')
      .select('id,user_id,date,start_time,distance,elevation')
      .eq('id', raceId)
      .eq('user_id', user.id)
      .single()
    const raceRow = race as
      | { date: string | null; start_time: string | null; distance: number | null; elevation: number | null }
      | null
    if (!raceRow || !raceRow.date) return json({ result: 'race_not_found' }, 404, cors)

    // Départ = date (+ start_time, défaut 08:00). Borne STRICTE côté serveur.
    const startTime = (raceRow.start_time && /^\d{2}:\d{2}/.test(raceRow.start_time)) ? raceRow.start_time.slice(0, 5) : '08:00'
    const raceStartMs = Date.parse(`${String(raceRow.date).slice(0, 10)}T${startTime}`)
    if (!Number.isFinite(raceStartMs)) return json({ result: 'invalid' }, 400, cors)
    const nowMs = Date.now()
    if (raceStartMs <= nowMs) return json({ result: 'race_started' }, 409, cors)

    // ── Idempotence : même prédiction + mêmes versions déjà figée pour cette course ? ──
    const { data: existing } = await supabase
      .from('projection_validation_snapshots')
      .select('id')
      .eq('user_id', user.id)
      .eq('race_id', raceId)
      .eq('engine_version', engineVersion)
      .eq('profile_version', profileVersion)
      .eq('prediction_central_s', central)
      .limit(1)
    if (existing && (existing as unknown[]).length > 0) return json({ result: 'exists' }, 200, cors)

    // ── Manifeste COMPLET : activités running de la fenêtre moteur (agrégats, pas de GPS) ──
    const sinceISO = new Date(nowMs - ENGINE_HISTORY_DAYS * 86_400_000).toISOString()
    const nowISO = new Date(nowMs).toISOString()
    const RUN_VALUES = ['Run', 'TrailRun', 'VirtualRun', 'Running', 'Trail Run']
    const inList = RUN_VALUES.map((v) => (v.includes(' ') ? `"${v}"` : v)).join(',')
    const runFilter = `type.in.(${inList}),sport_type.in.(${inList})`
    const PAGE = 200
    type Row = {
      strava_activity_id: number
      start_date: string
      moving_time: number | null
      distance: number | null
      total_elevation_gain: number | null
      type: string | null
      sport_type: string | null
    }
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from('strava_activities')
        .select('strava_activity_id,start_date,moving_time,distance,total_elevation_gain,type,sport_type')
        .eq('user_id', user.id)
        .or(runFilter)
        .is('deleted_at', null)
        .gte('start_date', sinceISO)
        .lt('start_date', nowISO)
        .order('start_date', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`activities query failed: ${error.message}`)
      const got = (page ?? []) as Row[]
      rows.push(...got)
      if (got.length < PAGE) break
    }

    const manifest: ActivityManifestEntry[] = rows
      .filter((a) => isRunningActivity({ type: a.type, sport_type: a.sport_type }))
      .map((a) => ({
        activityId: Number(a.strava_activity_id),
        startDate: a.start_date,
        movingTimeS: a.moving_time ?? 0,
        distanceM: a.distance ?? 0,
        dplusM: a.total_elevation_gain ?? 0,
      }))

    const raceDistanceM = (raceRow.distance ?? 0) * 1000
    const raceDplusM = raceRow.elevation ?? 0
    const fallbackSources = Array.isArray(body.fallbackSources) ? body.fallbackSources.map(String) : []

    const inputFingerprint = computeSnapshotFingerprint({
      engineVersion,
      profileVersion,
      profileSchemaVersion,
      raceDistanceM,
      raceDplusM,
      historyStartAt: sinceISO,
      historyEndAt: nowISO,
      predictionCentralS: central,
      usedPersonalFade: !!body.usedPersonalFade,
      usedSteepnessCalibration: !!body.usedSteepnessCalibration,
      usedFallback: !!body.usedFallback,
      fallbackSources,
      manifest,
    })

    const { data: inserted, error: insertErr } = await supabase
      .from('projection_validation_snapshots')
      .insert({
        user_id: user.id,
        race_id: raceId,
        race_start_at: new Date(raceStartMs).toISOString(),
        engine_version: engineVersion,
        profile_version: profileVersion,
        profile_schema_version: profileSchemaVersion,
        prediction_central_s: central,
        prediction_prudent_s: Math.round(Number(body.predictionPrudentS) || central),
        prediction_aggressive_s: Math.round(Number(body.predictionAggressiveS) || central),
        history_start_at: sinceISO,
        history_end_at: nowISO,
        activity_count: manifest.length,
        used_personal_fade: !!body.usedPersonalFade,
        used_steepness_calibration: !!body.usedSteepnessCalibration,
        used_fallback: !!body.usedFallback,
        fallback_sources: fallbackSources,
        input_fingerprint: inputFingerprint,
        input_manifest: manifest,
        status: 'locked',
      })
      .select('id')
      .single()

    if (insertErr) throw new Error(insertErr.message)
    return json({ ok: true, result: 'created', snapshot_id: (inserted as { id: string }).id }, 200, cors)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthorized' ? 401 : 500
    if (status === 500) console.error('lock-projection-snapshot error:', msg)
    return json({ result: 'error', error: msg }, status, cors)
  }
})
