import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { requireAuth } from '../_shared/auth.ts'
import { syncStravaActivitiesForUser } from '../_shared/strava.ts'
import { hasRequiredStravaActivityScope } from '../_shared/stravaScopes.ts'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  try {
    const user = await requireAuth(req)

    const body = (await req.json()) as { code?: string }
    const { code } = body

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
      // Ne jamais journaliser un corps de réponse OAuth : il pourrait contenir
      // des informations sensibles ajoutées par le fournisseur.
      console.error('Strava token exchange failed:', tokenRes.status)
      return errorResponse('Strava token exchange failed', 502)
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string
      refresh_token: string
      expires_at: number
      scope?: string
      athlete: {
        id: number
        firstname: string
        lastname: string
        profile_medium: string
      }
    }

    const { access_token, refresh_token, expires_at, athlete } = tokenData
    const grantedScope = tokenData.scope ?? ''
    // Le scope du navigateur est informatif et modifiable. Seule la réponse
    // serveur de l'échange OAuth fait foi.
    if (!hasRequiredStravaActivityScope(grantedScope)) {
      return errorResponse('Strava activity permission required', 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Une réautorisation doit concerner le même athlète que celui déjà lié.
    // Cela évite qu'une session Strava ouverte sur le mauvais compte remplace
    // silencieusement la connexion existante.
    const { data: currentToken, error: currentTokenError } = await supabase
      .from('strava_tokens')
      .select('strava_athlete_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (currentTokenError) {
      console.error('strava_tokens current ownership check error')
      return errorResponse('Failed to verify current Strava connection', 500)
    }

    if (
      currentToken?.strava_athlete_id != null &&
      Number(currentToken.strava_athlete_id) !== athlete.id
    ) {
      return errorResponse(
        'Le compte Strava autorisé ne correspond pas à celui déjà lié à ce compte Vorcelab.',
        409,
      )
    }

    // Security: one Strava athlete can be linked to only one Vorcelab account.
    const { data: conflictingTokens, error: conflictError } = await supabase
      .from('strava_tokens')
      .select('user_id')
      .eq('strava_athlete_id', athlete.id)
      .neq('user_id', user.id)
      .limit(1)

    if (conflictError) {
      console.error('strava_tokens ownership check error')
      return errorResponse('Failed to verify Strava connection ownership', 500)
    }

    if (conflictingTokens && conflictingTokens.length > 0) {
      return errorResponse('Ce compte Strava est déjà lié à un autre compte Vorcelab.', 409)
    }

    // Upsert strava_tokens — keyed on user_id
    const { error: upsertError } = await supabase.from('strava_tokens').upsert(
      {
        user_id: user.id,
        strava_athlete_id: athlete.id,
        access_token,
        refresh_token,
        expires_at,
        scope: grantedScope,
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
        scope: grantedScope,
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
