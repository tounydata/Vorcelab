import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  fetchAndCacheActivityStreams,
  fetchStravaActivityById,
  getValidStravaAccessToken,
  upsertStravaActivity,
} from '../_shared/strava.ts'

// Client « permissif » (§7) : sans types de base générés, le schéma se paramètre en `never`
// et `.from(...).upsert({...})` ne type-check plus. `any` rétablit un typage exploitable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>

// Strava webhook — no CORS needed (server-to-server)
// Per Strava docs: https://developers.strava.com/docs/webhooks/

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── GET: Webhook subscription validation ─────────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const challenge = url.searchParams.get('hub.challenge')
    const verifyToken = url.searchParams.get('hub.verify_token')

    const expectedToken = Deno.env.get('STRAVA_VERIFY_TOKEN')

    if (mode === 'subscribe' && verifyToken === expectedToken && challenge) {
      // Strava requires this exact response format
      return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: Webhook event ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    // Always respond 200 quickly to Strava
    // Per Strava docs: must respond within 2 seconds
    const rawBody = await req.text()

    let event: {
      object_type: string
      object_id: number
      aspect_type: string
      updates?: Record<string, unknown>
      owner_id: number
      subscription_id: number
      event_time: number
    }

    try {
      event = JSON.parse(rawBody) as typeof event
    } catch {
      return new Response('OK', { status: 200 })
    }

    // Store event for processing — respond immediately (fire-and-forget en tâche de fond).
    void (async () => {
      const { error } = await supabase
        .from('strava_webhook_events')
        .insert({
          object_type: event.object_type,
          object_id: event.object_id,
          aspect_type: event.aspect_type,
          owner_id: event.owner_id,
          subscription_id: event.subscription_id,
          event_time: event.event_time,
          payload: event as unknown as Record<string, unknown>,
        })
      if (error) {
        console.error('Webhook insert error:', error.message)
        return
      }
      // Process in background after responding
      await processWebhookEvent(supabase, event).catch((e) =>
        console.error('Webhook processing error:', (e as Error).message)
      )
    })()

    return new Response('OK', { status: 200 })
  }

  return new Response('Method Not Allowed', { status: 405 })
})

async function processWebhookEvent(
  supabase: AnySupabaseClient,
  event: {
    object_type: string
    object_id: number
    aspect_type: string
    owner_id: number
    subscription_id: number
    event_time: number
  }
): Promise<void> {
  if (event.object_type !== 'activity') return

  // Find the Supabase user from the Strava athlete id (owner_id)
  const { data: tokenRow } = await supabase
    .from('strava_tokens')
    .select('user_id')
    .eq('strava_athlete_id', event.owner_id)
    .single()

  if (!tokenRow) {
    console.warn(`No user found for strava_athlete_id=${event.owner_id}`)
    return
  }

  const userId = tokenRow.user_id as string

  if (event.aspect_type === 'delete') {
    await supabase
      .from('strava_activities')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('strava_activity_id', event.object_id)
    return
  }

  if (event.aspect_type === 'create' || event.aspect_type === 'update') {
    try {
      const accessToken = await getValidStravaAccessToken(supabase, userId)
      const activity = await fetchStravaActivityById(accessToken, event.object_id)
      await upsertStravaActivity(supabase, userId, activity)

      // Mark as processed
      await supabase
        .from('strava_webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('object_id', event.object_id)
        .eq('owner_id', event.owner_id)
        .is('processed_at', null)

      // Sync weather (best-effort, Open-Meteo requires >7 days old)
      if (event.aspect_type === 'create') {
        syncActivityWeather(supabase, userId, activity).catch((e) =>
          console.error('Weather sync error:', (e as Error).message)
        )
      }

      // Auto-import renfo activities into renfo_session_log
      if (event.aspect_type === 'create' && isRenfoActivity(activity.type, activity.sport_type)) {
        syncRenfoActivity(supabase, userId, activity).catch((e) =>
          console.error('Renfo sync error:', (e as Error).message)
        )
      }

      if (event.aspect_type === 'create' && isTrailActivity(activity.type, activity.sport_type)) {
        // Cache le tracé GPS dès l'arrivée (alimente le profil « par pente »).
        // Best-effort : ne bloque pas le webhook, ignore les erreurs/quotas.
        fetchAndCacheActivityStreams(supabase, userId, accessToken, activity.id).catch((e) =>
          console.error('Stream cache error:', (e as Error).message)
        )
        refreshRunnerProfile(userId).catch((e) =>
          console.error('Runner profile refresh error:', (e as Error).message)
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await supabase
        .from('strava_webhook_events')
        .update({ error: message })
        .eq('object_id', event.object_id)
        .eq('owner_id', event.owner_id)
        .is('processed_at', null)
    }
  }
}

const TRAIL_TYPES = new Set([
  'Run', 'TrailRun', 'Trail Run', 'VirtualRun', 'run', 'trail', 'trailrun',
])
const RENFO_TYPES = new Set([
  'WeightTraining', 'Workout', 'CrossTraining', 'Crossfit', 'Yoga', 'Pilates',
  'weighttraining', 'workout', 'crosstraining', 'crossfit', 'yoga', 'pilates',
])

function isTrailActivity(type: string, sportType: string): boolean {
  return TRAIL_TYPES.has(type) || TRAIL_TYPES.has(sportType)
}

function isRenfoActivity(type: string, sportType: string): boolean {
  return RENFO_TYPES.has(type) || RENFO_TYPES.has(sportType)
}

// Map Strava exercise_type → renfo focus
const EXERCISE_FOCUS_MAP: Record<string, string> = {
  // Force lourde
  back_squat: 'force_lourde', front_squat: 'force_lourde', goblet_squat: 'force_lourde',
  deadlift: 'force_lourde', romanian_deadlift: 'force_lourde', sumo_deadlift: 'force_lourde',
  lunge: 'force_lourde', reverse_lunge: 'force_lourde', split_squat: 'force_lourde',
  step_up: 'force_lourde', leg_press: 'force_lourde', hip_thrust: 'force_lourde',
  // Pliométrie
  box_jump: 'pliometrie', jump_squat: 'pliometrie', broad_jump: 'pliometrie',
  burpee: 'pliometrie', single_leg_jump: 'pliometrie', jumping_lunge: 'pliometrie',
  // Excentrique
  nordic_curl: 'excentrique', single_leg_deadlift: 'excentrique',
  // Haut du corps
  bench_press: 'haut_corps', incline_bench_press: 'haut_corps', push_up: 'haut_corps',
  pull_up: 'haut_corps', chin_up: 'haut_corps', lat_pulldown: 'haut_corps',
  row: 'haut_corps', seated_row: 'haut_corps', shoulder_press: 'haut_corps',
  overhead_press: 'haut_corps', dumbbell_row: 'haut_corps',
  // Tronc
  plank: 'tronc', side_plank: 'tronc', dead_bug: 'tronc', hollow_body: 'tronc',
  sit_up: 'tronc', russian_twist: 'tronc', bird_dog: 'tronc', pallof_press: 'tronc',
}

function inferRenfoFocus(
  type: string,
  sportType: string,
  exerciseSets?: { exercise_type: string }[],
): string | null {
  const t = (type + ' ' + sportType).toLowerCase()
  if (t.includes('yoga')) return 'yoga_coureur'
  if (t.includes('pilates')) return 'pilates_coureur'

  if (!exerciseSets?.length) return null

  const counts: Record<string, number> = {}
  for (const s of exerciseSets) {
    const focus = EXERCISE_FOCUS_MAP[s.exercise_type?.toLowerCase() ?? '']
    if (focus) counts[focus] = (counts[focus] ?? 0) + 1
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return entries[0]?.[0] ?? null
}

async function syncRenfoActivity(
  supabase: AnySupabaseClient,
  userId: string,
  activity: {
    id: number
    start_date: string
    start_date_local?: string
    moving_time: number
    type: string
    sport_type: string
    exercise_sets?: { exercise_type: string; weight_kg?: number | null; sets?: number | null; reps?: number | null }[]
  },
): Promise<void> {
  const sessionDate = (activity.start_date_local ?? activity.start_date).slice(0, 10)
  const durationMin = Math.round(activity.moving_time / 60)
  const sourceActivityId = String(activity.id)

  // Anti-doublon par ID RÉEL d'activité Strava (et non par jour) : deux séances de
  // renforcement le même jour issues de deux activités distinctes sont conservées.
  const { data: existing } = await supabase
    .from('renfo_session_log')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'strava')
    .eq('source_activity_id', sourceActivityId)
    .maybeSingle()

  if (existing) return

  const focus = inferRenfoFocus(activity.type, activity.sport_type, activity.exercise_sets)

  // upsert on (user_id, source, source_activity_id) : idempotent même en cas de
  // rejeu du webhook pour la même activité.
  await supabase.from('renfo_session_log').upsert({
    user_id: userId,
    session_date: sessionDate,
    focus,
    duration_min: durationMin > 0 ? durationMin : null,
    source: 'strava',
    source_activity_id: sourceActivityId,
    completed_exercises: activity.exercise_sets?.length
      ? activity.exercise_sets.map((s) => s.exercise_type)
      : [],
  }, { onConflict: 'user_id,source,source_activity_id' })
}

async function syncActivityWeather(
  supabase: AnySupabaseClient,
  userId: string,
  activity: { id: number; start_date: string; start_latlng?: [number, number] | [] },
): Promise<void> {
  const latlng = activity.start_latlng
  if (!Array.isArray(latlng) || latlng.length !== 2) return

  const [lat, lon] = latlng as [number, number]
  const startDate = activity.start_date
  if (!startDate) return

  // Open-Meteo archive requires data to be at least 7 days old
  if (Date.now() - new Date(startDate).getTime() < 7 * 24 * 3600 * 1000) return

  const date = startDate.slice(0, 10)
  const hour = Math.min(23, parseInt(startDate.split('T')[1]?.split(':')[0] ?? '12', 10))

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=temperature_2m,windspeed_10m,precipitation&timezone=auto`

  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) return

  const d = await r.json() as { hourly?: { temperature_2m?: number[]; windspeed_10m?: number[]; precipitation?: number[] } }
  const temps = d.hourly?.temperature_2m ?? []
  const winds = d.hourly?.windspeed_10m ?? []
  const precips = d.hourly?.precipitation ?? []
  if (!temps.length) return

  const h = Math.min(hour, temps.length - 1)

  await supabase.from('activity_weather').upsert(
    {
      user_id: userId,
      activity_id: activity.id,
      temp: temps[h] ?? null,
      wind: winds[h] ?? null,
      precip: precips[h] ?? null,
      cached_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,activity_id' }
  )
}

async function refreshRunnerProfile(userId: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  await fetch(`${supabaseUrl}/functions/v1/compute-runner-profile`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  })
}
