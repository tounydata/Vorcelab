import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { getServiceClient, requireAuth } from '../_shared/auth.ts'
import {
  buildStravaSupportAuthorizationUrl,
  parseAdminSupportAction,
  type AdminSupportAction,
} from '../_shared/adminSupport.ts'
import {
  deauthorizeStrava,
  getValidStravaAccessToken,
  refreshStravaToken,
  syncStravaActivitiesForUser,
} from '../_shared/strava.ts'
import { hasRequiredStravaActivityScope } from '../_shared/stravaScopes.ts'

interface SupportRequest {
  sessionId?: unknown
  action?: unknown
  confirmation?: unknown
}

interface SupportSession {
  id: string
  admin_user_id: string
  target_user_id: string
  reason: string
  expires_at: string
}

interface SafeStravaStatus {
  connected: boolean
  athlete_id?: number | null
  athlete_firstname?: string | null
  athlete_lastname?: string | null
  scope?: string | null
  activity_access_granted: boolean
  last_sync_at?: string | null
  token_expires_at?: string | null
  token_state: 'missing' | 'unknown' | 'valid' | 'refresh_needed'
}

class SupportError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SupportError'
  }
}

function jsonResponse(
  origin: string | null,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

function requireUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new SupportError('invalid_session', 400, 'Session d’assistance invalide.')
  }
  return value
}

function appUrl(): string {
  const configured = Deno.env.get('PUBLIC_APP_URL')?.trim()
  if (!configured) return 'https://vorcelab.app/'

  try {
    const parsed = new URL(configured)
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      return 'https://vorcelab.app/'
    }
    return new URL('/', parsed).toString()
  } catch {
    return 'https://vorcelab.app/'
  }
}

async function requireSupportSession(
  // Supabase client is intentionally untyped because this project does not
  // generate Database types for Edge Functions.
  // deno-lint-ignore no-explicit-any
  admin: any,
  adminUserId: string,
  sessionId: string,
): Promise<SupportSession> {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', adminUserId)
    .maybeSingle()

  if (profileError || profile?.is_admin !== true) {
    throw new SupportError('forbidden', 403, 'Accès administrateur refusé.')
  }

  const { data: session, error: sessionError } = await admin
    .from('admin_support_sessions')
    .select('id, admin_user_id, target_user_id, reason, expires_at')
    .eq('id', sessionId)
    .eq('admin_user_id', adminUserId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (sessionError || !session) {
    throw new SupportError(
      'support_session_unavailable',
      403,
      'La session d’assistance est absente ou expirée.',
    )
  }

  return session as SupportSession
}

async function safeStravaStatus(
  // deno-lint-ignore no-explicit-any
  admin: any,
  targetUserId: string,
): Promise<SafeStravaStatus> {
  const { data: row, error } = await admin
    .from('strava_tokens')
    .select(
      'strava_athlete_id, athlete_firstname, athlete_lastname, scope, last_sync_at, expires_at',
    )
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (error) {
    throw new SupportError('strava_status_failed', 500, 'État Strava indisponible.')
  }
  if (!row) {
    return {
      connected: false,
      activity_access_granted: false,
      token_state: 'missing',
    }
  }

  const expiresAt = typeof row.expires_at === 'number' ? row.expires_at : null
  const tokenState = expiresAt === null
    ? 'unknown'
    : expiresAt > Math.floor(Date.now() / 1000) + 300
    ? 'valid'
    : 'refresh_needed'

  return {
    connected: true,
    athlete_id: row.strava_athlete_id ?? null,
    athlete_firstname: row.athlete_firstname ?? null,
    athlete_lastname: row.athlete_lastname ?? null,
    scope: row.scope ?? null,
    activity_access_granted: hasRequiredStravaActivityScope(row.scope),
    last_sync_at: row.last_sync_at ?? null,
    token_expires_at: expiresAt === null
      ? null
      : new Date(expiresAt * 1000).toISOString(),
    token_state: tokenState,
  }
}

async function logAction(
  // deno-lint-ignore no-explicit-any
  admin: any,
  session: SupportSession,
  action: AdminSupportAction,
  outcome: 'success' | 'error',
  summary: string,
  beforeState?: Record<string, unknown> | null,
  afterState?: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await admin.from('admin_support_action_log').insert({
    session_id: session.id,
    admin_user_id: session.admin_user_id,
    target_user_id: session.target_user_id,
    action,
    outcome,
    summary: summary.slice(0, 240),
    before_state: beforeState ?? null,
    after_state: afterState ?? null,
  })

  if (error) {
    console.error('admin-support audit write failed')
  }
}

function requireActivityScope(status: SafeStravaStatus): void {
  if (!status.connected) {
    throw new SupportError('strava_not_connected', 409, 'Aucun compte Strava lié.')
  }
  if (!status.activity_access_granted) {
    throw new SupportError(
      'strava_scope_missing',
      403,
      'L’athlète doit valider l’autorisation complète Strava.',
    )
  }
}

async function runAction(
  // deno-lint-ignore no-explicit-any
  admin: any,
  session: SupportSession,
  action: AdminSupportAction,
  confirmation: unknown,
): Promise<Record<string, unknown>> {
  switch (action) {
    case 'strava_status': {
      const before = await safeStravaStatus(admin, session.target_user_id)
      return { status: before }
    }

    case 'create_strava_reauth_link': {
      const before = await safeStravaStatus(admin, session.target_user_id)
      const clientId = Deno.env.get('STRAVA_CLIENT_ID')
      if (!clientId) {
        throw new SupportError(
          'strava_not_configured',
          500,
          'La connexion Strava n’est pas configurée.',
        )
      }
      const oauthUrl = buildStravaSupportAuthorizationUrl(clientId, appUrl())
      await logAction(
        admin,
        session,
        action,
        'success',
        'Lien de réautorisation Strava forcée généré',
        { connected: before.connected, activity_access_granted: before.activity_access_granted },
        { requested_scopes: ['read', 'activity:read_all'], approval_prompt: 'force' },
      )
      return {
        oauth_url: oauthUrl,
        requested_scopes: ['read', 'activity:read_all'],
        status: before,
      }
    }

    case 'strava_refresh_token': {
      const before = await safeStravaStatus(admin, session.target_user_id)
      if (!before.connected) {
        throw new SupportError('strava_not_connected', 409, 'Aucun compte Strava lié.')
      }
      const { data: tokenRow, error } = await admin
        .from('strava_tokens')
        .select('refresh_token')
        .eq('user_id', session.target_user_id)
        .maybeSingle()
      if (error || typeof tokenRow?.refresh_token !== 'string') {
        throw new SupportError('strava_refresh_unavailable', 409, 'Jeton Strava inutilisable.')
      }

      await refreshStravaToken(admin, session.target_user_id, tokenRow.refresh_token)
      const after = await safeStravaStatus(admin, session.target_user_id)
      await logAction(
        admin,
        session,
        action,
        'success',
        'Jeton Strava rafraîchi côté serveur',
        { token_state: before.token_state },
        { token_state: after.token_state },
      )
      return { status: after }
    }

    case 'strava_sync_incremental':
    case 'strava_sync_full': {
      const before = await safeStravaStatus(admin, session.target_user_id)
      requireActivityScope(before)
      const accessToken = await getValidStravaAccessToken(admin, session.target_user_id)
      const full = action === 'strava_sync_full'
      const synced = await syncStravaActivitiesForUser(
        admin,
        session.target_user_id,
        accessToken,
        { full },
      )
      const after = await safeStravaStatus(admin, session.target_user_id)
      await logAction(
        admin,
        session,
        action,
        'success',
        full ? 'Synchronisation Strava complète terminée' : 'Synchronisation Strava récente terminée',
        { last_sync_at: before.last_sync_at ?? null },
        { last_sync_at: after.last_sync_at ?? null, activities_processed: synced },
      )
      return { synced, status: after }
    }

    case 'strava_disconnect': {
      const before = await safeStravaStatus(admin, session.target_user_id)
      if (confirmation !== 'DISCONNECT_STRAVA') {
        throw new SupportError(
          'confirmation_required',
          400,
          'Confirmation explicite requise pour déconnecter Strava.',
        )
      }

      if (before.connected) {
        try {
          const accessToken = await getValidStravaAccessToken(admin, session.target_user_id)
          await deauthorizeStrava(accessToken)
        } catch {
          // The remote token may already be invalid. Local cleanup must still run.
        }
      }

      const { error } = await admin
        .from('strava_tokens')
        .delete()
        .eq('user_id', session.target_user_id)
      if (error) {
        throw new SupportError('strava_disconnect_failed', 500, 'Déconnexion Strava impossible.')
      }

      const after = await safeStravaStatus(admin, session.target_user_id)
      await logAction(
        admin,
        session,
        action,
        'success',
        'Connexion Strava révoquée et supprimée',
        { connected: before.connected, athlete_id: before.athlete_id ?? null },
        { connected: false },
      )
      return { disconnected: true, status: after }
    }

    case 'start_vorcelab_impersonation': {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(
        session.target_user_id,
      )
      const email = userData?.user?.email
      if (userError || !email) {
        throw new SupportError(
          'support_login_unavailable',
          409,
          'Impossible de créer la session Vorcelab assistée.',
        )
      }

      // Supabase crée un OTP à usage unique. Seul son hash éphémère est remis
      // à la fenêtre d'assistance ; aucun mot de passe utilisateur n'est lu.
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      const tokenHash = linkData?.properties?.hashed_token
      if (linkError || !tokenHash) {
        throw new SupportError(
          'support_login_failed',
          502,
          'Impossible de créer la session Vorcelab assistée.',
        )
      }

      await logAction(
        admin,
        session,
        action,
        'success',
        'Fenêtre Vorcelab assistée générée',
        null,
        { isolated_window: true, expires_at: session.expires_at },
      )

      return {
        token_hash: tokenHash,
        support_session_id: session.id,
        target_user_id: session.target_user_id,
        expires_at: session.expires_at,
      }
    }

    case 'send_password_reset':
    case 'send_magic_link': {
      const { data, error } = await admin.auth.admin.getUserById(session.target_user_id)
      const email = data?.user?.email
      if (error || !email || email.endsWith('@strava.users.vorcelab.app')) {
        throw new SupportError(
          'email_unavailable',
          409,
          'Ce compte ne possède pas d’adresse email de connexion utilisable.',
        )
      }

      const redirectTo = action === 'send_password_reset'
        ? new URL('/profile/settings', appUrl()).toString()
        : appUrl()
      const authResult = action === 'send_password_reset'
        ? await admin.auth.resetPasswordForEmail(email, { redirectTo })
        : await admin.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
        })

      if (authResult.error) {
        throw new SupportError('auth_email_failed', 502, 'Email d’assistance non envoyé.')
      }

      await logAction(
        admin,
        session,
        action,
        'success',
        action === 'send_password_reset'
          ? 'Email de réinitialisation envoyé à l’utilisateur'
          : 'Lien de connexion envoyé à l’utilisateur',
        null,
        { delivered_to_user_email: true },
      )
      return { sent: true }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const origin = req.headers.get('origin')
  let supportSession: SupportSession | null = null
  let action: AdminSupportAction | null = null
  const admin = getServiceClient()

  try {
    if (req.method !== 'POST') {
      throw new SupportError('method_not_allowed', 405, 'Méthode non autorisée.')
    }

    const user = await requireAuth(req)
    const body = (await req.json().catch(() => ({}))) as SupportRequest
    const sessionId = requireUuid(body.sessionId)
    action = parseAdminSupportAction(body.action)
    if (!action) {
      throw new SupportError('invalid_action', 400, 'Action d’assistance inconnue.')
    }

    supportSession = await requireSupportSession(admin, user.id, sessionId)
    const result = await runAction(admin, supportSession, action, body.confirmation)
    return jsonResponse(origin, { ok: true, ...result })
  } catch (error) {
    const supportError = error instanceof SupportError
      ? error
      : new SupportError('operation_failed', 502, 'L’opération d’assistance a échoué.')

    if (supportSession && action) {
      await logAction(
        admin,
        supportSession,
        action,
        'error',
        `Échec de l’action (${supportError.code})`,
      )
    }

    console.error('admin-support action failed:', supportError.code)
    return jsonResponse(
      origin,
      { ok: false, error: supportError.message, code: supportError.code },
      supportError.status,
    )
  }
})
