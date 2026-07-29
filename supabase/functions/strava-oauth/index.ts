import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { getServiceClient, requireAuth } from '../_shared/auth.ts'
import { syncStravaActivitiesForUser } from '../_shared/strava.ts'
import { hasRequiredStravaActivityScope } from '../_shared/stravaScopes.ts'
import {
  resolveAssistedSupportSession,
  SupportAuditError,
  type AssistedSupportSession,
  writeSupportAudit,
} from '../_shared/supportAudit.ts'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

class StravaOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage)
    this.name = 'StravaOAuthError'
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const admin = getServiceClient()
  let supportSession: AssistedSupportSession | null = null

  try {
    const user = await requireAuth(req)

    const body = (await req.json().catch(() => ({}))) as {
      code?: unknown
      supportSessionId?: unknown
    }
    supportSession = await resolveAssistedSupportSession(
      admin,
      body.supportSessionId,
      user.id,
    )
    const { code } = body

    if (!code || typeof code !== 'string' || code.length === 0) {
      throw new StravaOAuthError('missing_code', 400, 'Missing OAuth code')
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID')
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      throw new StravaOAuthError(
        'strava_not_configured',
        500,
        'Strava credentials not configured',
      )
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
      throw new StravaOAuthError(
        'token_exchange_failed',
        502,
        'Strava token exchange failed',
      )
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
      throw new StravaOAuthError(
        'missing_activity_scope',
        403,
        'Strava activity permission required',
      )
    }

    // Une réautorisation doit concerner le même athlète que celui déjà lié.
    // Cela évite qu'une session Strava ouverte sur le mauvais compte remplace
    // silencieusement la connexion existante.
    const { data: currentToken, error: currentTokenError } = await admin
      .from('strava_tokens')
      .select('strava_athlete_id, scope')
      .eq('user_id', user.id)
      .maybeSingle()

    if (currentTokenError) {
      console.error('strava_tokens current ownership check error')
      throw new StravaOAuthError(
        'current_connection_check_failed',
        500,
        'Failed to verify current Strava connection',
      )
    }

    if (
      currentToken?.strava_athlete_id != null &&
      Number(currentToken.strava_athlete_id) !== athlete.id
    ) {
      throw new StravaOAuthError(
        'different_strava_athlete',
        409,
        'Le compte Strava autorisé ne correspond pas à celui déjà lié à ce compte Vorcelab.',
      )
    }

    // Security: one Strava athlete can be linked to only one Vorcelab account.
    const { data: conflictingTokens, error: conflictError } = await admin
      .from('strava_tokens')
      .select('user_id')
      .eq('strava_athlete_id', athlete.id)
      .neq('user_id', user.id)
      .limit(1)

    if (conflictError) {
      console.error('strava_tokens ownership check error')
      throw new StravaOAuthError(
        'ownership_check_failed',
        500,
        'Failed to verify Strava connection ownership',
      )
    }

    if (conflictingTokens && conflictingTokens.length > 0) {
      throw new StravaOAuthError(
        'strava_athlete_already_linked',
        409,
        'Ce compte Strava est déjà lié à un autre compte Vorcelab.',
      )
    }

    if (supportSession) {
      // En assistance, le stockage du jeton et la preuve d'audit sont atomiques :
      // aucun succès ne peut apparaître sans le scope réellement stocké.
      const { error: assistedUpsertError } = await admin.rpc(
        'support_apply_strava_oauth',
        {
          p_support_session_id: supportSession.id,
          p_target_user_id: user.id,
          p_strava_athlete_id: athlete.id,
          p_access_token: access_token,
          p_refresh_token: refresh_token,
          p_expires_at: expires_at,
          p_scope: grantedScope,
          p_athlete_firstname: athlete.firstname,
          p_athlete_lastname: athlete.lastname,
          p_athlete_avatar: athlete.profile_medium,
        },
      )
      if (assistedUpsertError) {
        console.error('assisted strava_tokens atomic upsert error')
        throw new StravaOAuthError(
          'assisted_store_failed',
          500,
          'Failed to store Strava connection',
        )
      }
    } else {
      // Upsert strava_tokens — keyed on user_id
      const { error: upsertError } = await admin.from('strava_tokens').upsert(
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
        { onConflict: 'user_id' },
      )

      if (upsertError) {
        console.error('strava_tokens upsert error:', upsertError.message)
        throw new StravaOAuthError(
          'store_failed',
          500,
          'Failed to store Strava connection',
        )
      }
    }

    // Initial sync — run in background, don't block OAuth response
    syncStravaActivitiesForUser(admin, user.id, access_token, { full: true }).catch((e) =>
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
    const oauthError = err instanceof StravaOAuthError
      ? err
      : err instanceof SupportAuditError
      ? new StravaOAuthError(err.code, 403, err.message)
      : err instanceof Error && err.message === 'Unauthorized'
      ? new StravaOAuthError('unauthorized', 401, 'Unauthorized')
      : new StravaOAuthError('internal_error', 500, 'Internal server error')

    if (supportSession) {
      await writeSupportAudit(
        admin,
        supportSession,
        'strava_oauth_failed',
        'error',
        `Échec de la réautorisation Strava (${oauthError.code})`,
        null,
        { source: 'strava_token_exchange', error_code: oauthError.code },
      )
    }

    console.error('strava-oauth error:', oauthError.code)
    return errorResponse(oauthError.publicMessage, oauthError.status)
  }
})
