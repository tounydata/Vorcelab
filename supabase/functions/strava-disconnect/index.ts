import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { getServiceClient, requireAuth } from '../_shared/auth.ts'
import { deauthorizeStrava, getValidStravaAccessToken } from '../_shared/strava.ts'
import { purgeStravaData } from '../_shared/stravaPurge.ts'
import {
  resolveAssistedSupportSession,
  SupportAuditError,
  type AssistedSupportSession,
  writeSupportAudit,
} from '../_shared/supportAudit.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)
  const admin = getServiceClient()
  let supportSession: AssistedSupportSession | null = null

  try {
    const user = await requireAuth(req)
    const body = (await req.json().catch(() => ({}))) as {
      supportSessionId?: unknown
    }
    supportSession = await resolveAssistedSupportSession(
      admin,
      body.supportSessionId,
      user.id,
    )

    // Best-effort deauth with Strava
    try {
      const accessToken = await getValidStravaAccessToken(admin, user.id)
      await deauthorizeStrava(accessToken)
    } catch {
      // Token may already be invalid — continue with local cleanup
    }

    // Strava API Policy §7.4 (b) : la révocation oblige à supprimer TOUTES les
    // Strava Data et les données qui en dérivent, pas seulement le jeton. La purge
    // est transactionnelle et emporte le jeton en fin de parcours.
    const purge = await purgeStravaData(admin, user.id)

    if (supportSession) {
      await writeSupportAudit(
        admin,
        supportSession,
        'strava_disconnect',
        'success',
        'Déconnexion Strava confirmée par le serveur, données Strava purgées',
        { connected: true },
        { connected: false, source: 'strava_disconnect_function', purge },
      )
    }

    return new Response(JSON.stringify({ disconnected: true, purged: purge }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Unauthorized') return errorResponse('Unauthorized', 401)
    if (err instanceof SupportAuditError) return errorResponse(err.message, 403)
    if (supportSession) {
      await writeSupportAudit(
        admin,
        supportSession,
        'strava_disconnect',
        'error',
        'Échec de la déconnexion Strava',
        null,
        { source: 'strava_disconnect_function' },
      )
    }
    return errorResponse('Internal server error', 500)
  }
})
