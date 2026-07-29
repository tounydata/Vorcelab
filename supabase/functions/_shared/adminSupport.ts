export const ADMIN_SUPPORT_ACTIONS = [
  'strava_status',
  'strava_refresh_token',
  'strava_sync_incremental',
  'strava_sync_full',
  'create_strava_reauth_link',
  'strava_disconnect',
  'start_vorcelab_impersonation',
  'send_password_reset',
  'send_magic_link',
] as const

export type AdminSupportAction = (typeof ADMIN_SUPPORT_ACTIONS)[number]

export function parseAdminSupportAction(value: unknown): AdminSupportAction | null {
  if (typeof value !== 'string') return null
  return (ADMIN_SUPPORT_ACTIONS as readonly string[]).includes(value)
    ? value as AdminSupportAction
    : null
}

export const STRAVA_SUPPORT_SCOPES = 'read,activity:read_all'
export const STRAVA_SUPPORT_STATE = 'vl_strava'

export function buildStravaSupportAuthorizationUrl(
  clientId: string,
  redirectUri = 'https://vorcelab.app/',
): string {
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('approval_prompt', 'force')
  url.searchParams.set('scope', STRAVA_SUPPORT_SCOPES)
  url.searchParams.set('state', STRAVA_SUPPORT_STATE)
  return url.toString()
}
