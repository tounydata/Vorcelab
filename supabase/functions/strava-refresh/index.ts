import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { getServiceClient, requireAuth } from '../_shared/auth.ts'
import { getValidStravaAccessToken, syncStravaActivitiesForUser } from '../_shared/strava.ts'
import { hasRequiredStravaActivityScope } from '../_shared/stravaScopes.ts'
import {
  resolveAssistedSupportSession,
  SupportAuditError,
  type AssistedSupportSession,
  writeSupportAudit,
} from '../_shared/supportAudit.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const admin = getServiceClient()
  let supportSession: AssistedSupportSession | null = null
  let full = false

  try {
    const user = await requireAuth(req)
    const body = (await req.json().catch(() => ({}))) as {
      full?: unknown
      supportSessionId?: unknown
    }
    full = body.full === true
    supportSession = await resolveAssistedSupportSession(
      admin,
      body.supportSessionId,
      user.id,
    )

    // Check if user has a Strava connection
    const { data: tokenRow } = await admin
      .from('strava_tokens')
      .select('last_sync_at, scope')
      .eq('user_id', user.id)
      .single()

    if (!tokenRow) {
      if (supportSession) {
        await writeSupportAudit(
          admin,
          supportSession,
          full ? 'strava_sync_full' : 'strava_sync_incremental',
          'error',
          'Synchronisation refusée : aucun compte Strava lié',
        )
      }
      return new Response(JSON.stringify({ connected: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!hasRequiredStravaActivityScope(tokenRow.scope as string | null)) {
      if (supportSession) {
        await writeSupportAudit(
          admin,
          supportSession,
          full ? 'strava_sync_full' : 'strava_sync_incremental',
          'error',
          'Synchronisation refusée : autorisation activités manquante',
          { activity_access_granted: false },
        )
      }
      return errorResponse('Strava activity permission required', 403)
    }

    const accessToken = await getValidStravaAccessToken(admin, user.id)
    const synced = await syncStravaActivitiesForUser(admin, user.id, accessToken, {
      full,
    })

    const { data: updated } = await admin
      .from('strava_tokens')
      .select('last_sync_at')
      .eq('user_id', user.id)
      .single()

    if (supportSession) {
      await writeSupportAudit(
        admin,
        supportSession,
        full ? 'strava_sync_full' : 'strava_sync_incremental',
        'success',
        full
          ? 'Synchronisation Strava complète confirmée'
          : 'Synchronisation Strava récente confirmée',
        { last_sync_at: tokenRow.last_sync_at ?? null },
        {
          last_sync_at: updated?.last_sync_at ?? null,
          activities_processed: synced,
          source: 'strava_refresh_function',
        },
      )
    }

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
    if (err instanceof SupportAuditError) return errorResponse(err.message, 403)
    if (supportSession) {
      await writeSupportAudit(
        admin,
        supportSession,
        full ? 'strava_sync_full' : 'strava_sync_incremental',
        'error',
        'Échec de la synchronisation Strava',
        null,
        { source: 'strava_refresh_function' },
      )
    }
    console.error('strava-refresh error')
    return errorResponse('Internal server error', 500)
  }
})
