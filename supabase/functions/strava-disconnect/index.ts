import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { requireAuth } from '../_shared/auth.ts'
import { deauthorizeStrava, getValidStravaAccessToken } from '../_shared/strava.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  try {
    const user = await requireAuth(req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Best-effort deauth with Strava
    try {
      const accessToken = await getValidStravaAccessToken(supabase, user.id)
      await deauthorizeStrava(accessToken)
    } catch {
      // Token may already be invalid — continue with local cleanup
    }

    await supabase.from('strava_tokens').delete().eq('user_id', user.id)

    return new Response(JSON.stringify({ disconnected: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Unauthorized') return errorResponse('Unauthorized', 401)
    return errorResponse('Internal server error', 500)
  }
})
