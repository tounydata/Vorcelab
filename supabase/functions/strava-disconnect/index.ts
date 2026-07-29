import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { errorResponse } from '../_shared/error.ts'
import { getServiceClient, requireAuth } from '../_shared/auth.ts'
import { deauthorizeStrava, getValidStravaAccessToken } from '../_shared/strava.ts'
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

    const { error: deleteError } = await admin
      .from('strava_tokens')
      .delete()
      .eq('user_id', user.id)
    if (deleteError) throw new Error('Strava local cleanup failed')

    if (supportSession) {
      await writeSupportAudit(
        admin,
        supportSession,
        'strava_disconnect',
        'success',
        'Déconnexion Strava confirmée par le serveur',
        { connected: true },
        { connected: false, source: 'strava_disconnect_function' },
      )
    }

    return new Response(JSON.stringify({ disconnected: true }), {
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
