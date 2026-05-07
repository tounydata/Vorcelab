import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { requireAuth } from '../_shared/auth.ts'
import { getValidStravaAccessToken, syncStravaActivitiesForUser } from '../_shared/strava.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  try {
    const user = await requireAuth(req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Check if user has a Strava connection
    const { data: tokenRow } = await supabase
      .from('strava_tokens')
      .select('last_sync_at')
      .eq('user_id', user.id)
      .single()

    if (!tokenRow) {
      return new Response(JSON.stringify({ connected: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getValidStravaAccessToken(supabase, user.id)

    const body = (await req.json().catch(() => ({}))) as { full?: boolean }
    const synced = await syncStravaActivitiesForUser(supabase, user.id, accessToken, {
      full: body.full === true,
    })

    const { data: updated } = await supabase
      .from('strava_tokens')
      .select('last_sync_at')
      .eq('user_id', user.id)
      .single()

    return new Response(
      JSON.stringify({
        connected: true,
        synced,
        last_sync_at: (updated?.last_sync_at as string) ?? new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Unauthorized') return errorResponse('Unauthorized', 401)
    console.error('strava-refresh error:', message)
    return errorResponse('Internal server error', 500)
  }
})
