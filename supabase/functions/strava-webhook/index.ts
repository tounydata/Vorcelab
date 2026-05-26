import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  fetchStravaActivityById,
  getValidStravaAccessToken,
  upsertStravaActivity,
} from '../_shared/strava.ts'

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

    // Store event for processing — respond immediately
    supabase
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
      .then(() => {
        // Process in background after responding
        processWebhookEvent(supabase, event).catch((e) =>
          console.error('Webhook processing error:', (e as Error).message)
        )
      })
      .catch((e) => console.error('Webhook insert error:', (e as Error).message))

    return new Response('OK', { status: 200 })
  }

  return new Response('Method Not Allowed', { status: 405 })
})

async function processWebhookEvent(
  supabase: ReturnType<typeof createClient>,
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

      // Recompute runner profile when a new trail activity is created
      if (event.aspect_type === 'create' && isTrailActivity(activity.type, activity.sport_type)) {
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

function isTrailActivity(type: string, sportType: string): boolean {
  return TRAIL_TYPES.has(type) || TRAIL_TYPES.has(sportType)
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
