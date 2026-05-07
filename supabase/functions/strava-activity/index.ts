import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import { getValidStravaAccessToken } from '../_shared/strava.ts'

const STRAVA_STREAMS_URL = 'https://www.strava.com/api/v3/activities'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)

  try {
    const user = await requireAuth(req)
    const body = (await req.json()) as { activityId?: number | string; keys?: string }
    const { activityId, keys = 'time,distance,altitude,heartrate,velocity_smooth,cadence' } = body

    if (!activityId) {
      return new Response(JSON.stringify({ error: 'Missing activityId' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const supabase = getServiceClient()
    let accessToken: string
    try {
      accessToken = await getValidStravaAccessToken(supabase, user.id)
    } catch {
      return new Response(JSON.stringify({ error: 'No Strava connection' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const streamsRes = await fetch(
      `${STRAVA_STREAMS_URL}/${activityId}/streams?keys=${keys}&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!streamsRes.ok) {
      const err = await streamsRes.text()
      console.error('Strava streams error:', streamsRes.status, err)
      return new Response(JSON.stringify({ error: `Strava error: ${streamsRes.status}` }), {
        status: streamsRes.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const streams = await streamsRes.json()
    return new Response(JSON.stringify(streams), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthorized' ? 401 : 500
    if (status === 500) console.error('strava-activity error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
