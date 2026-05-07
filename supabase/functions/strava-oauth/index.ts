import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { requireAuth } from '../_shared/auth.ts'
import { syncStravaActivitiesForUser } from '../_shared/strava.ts'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  try {
    const user = await requireAuth(req)

    const body = (await req.json()) as { code?: string; scope?: string; state?: string }
    const { code, scope = '' } = body

    if (!code || typeof code !== 'string' || code.length === 0) {
      return errorResponse('Missing OAuth code', 400)
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID')
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return errorResponse('Strava credentials not configured', 500)
    }

    // Exchange code for tokens — per Strava docs
    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text()
      console.error('Strava token exchange failed:', tokenRes.status, errBody)
      return errorResponse('Strava token exchange failed', 502)
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_at: number
      athlete: {
        id: number
        firstname: string
        lastname: string
        profile_medium: string
      }
    }

    const { access_token, refresh_token, expires_at, athlete } = tokenData

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Upsert strava_tokens — keyed on user_id
    const { error: upsertError } = await supabase.from('strava_tokens').upsert(
      {
        user_id: user.id,
        strava_athlete_id: athlete.id,
        access_token,
        refresh_token,
        expires_at,
        scope,
        athlete_firstname: athlete.firstname,
        athlete_lastname: athlete.lastname,
        athlete_avatar: athlete.profile_medium,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    if (upsertError) {
      console.error('strava_tokens upsert error:', upsertError.message)
      return errorResponse('Failed to store Strava connection', 500)
    }

    // Initial sync — run in background, don't block OAuth response
    syncStravaActivitiesForUser(supabase, user.id, access_token, { full: true }).catch((e) =>
      console.error('Initial sync error:', (e as Error).message)
    )

    return new Response(
      JSON.stringify({
        connected: true,
        athlete: {
          id: athlete.id,
          firstname: athlete.firstname,
          lastname: athlete.lastname,
          avatar: athlete.profile_medium,
        },
        scope,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Unauthorized') return errorResponse('Unauthorized', 401)
    console.error('strava-oauth error:', message)
    return errorResponse('Internal server error', 500)
  }
})
