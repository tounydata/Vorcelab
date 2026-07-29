// Connexion Strava (OAuth) côté front. Le client_id est PUBLIC (il apparaît dans
// l'URL d'autorisation) ; le secret reste dans l'edge function strava-oauth.
// Configurer VITE_STRAVA_CLIENT_ID dans l'environnement de build.
import { supabase, SUPA_URL, SUPA_KEY } from './supabase'
import { hasRequiredStravaActivityScope } from './stravaScopes'
import {
  classifyStravaOAuthFailure,
  type StravaRedirectResult,
} from './stravaOAuthResult'

export type { StravaRedirectResult } from './stravaOAuthResult'

// client_id PUBLIC de l'app Strava Vorcelab (visible dans l'URL d'autorisation).
// Override possible via VITE_STRAVA_CLIENT_ID. Le secret reste côté edge function.
export const STRAVA_CLIENT_ID =
  (import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined) ?? '161609'

export function stravaConfigured(): boolean {
  return STRAVA_CLIENT_ID.length > 0
}

/** URL de redirection (le domaine doit être déclaré dans « Authorization Callback Domain » côté Strava). */
function redirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

// Marqueur renvoyé tel quel par Strava dans `state` : permet de distinguer un retour
// Strava d'un retour OAuth Supabase (Google/Apple) qui utilise AUSSI `?code=`.
const STRAVA_STATE = 'vl_strava'

/** Démarre le flux OAuth Strava (redirige le navigateur vers Strava). */
export function startStravaOAuth(options: { forceApproval?: boolean } = {}): void {
  if (!stravaConfigured()) return
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    approval_prompt: options.forceApproval ? 'force' : 'auto',
    scope: 'read,activity:read_all',
    state: STRAVA_STATE,
  })
  window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`
}

async function logAssistedOAuthResult(
  supportSessionId: string | undefined,
  result: 'denied' | 'missing_scope' | 'client_error',
): Promise<void> {
  if (!supportSessionId) return
  try {
    await supabase.rpc('support_log_assisted_oauth_result', {
      support_session_id: supportSessionId,
      result_code: result,
    })
  } catch {
    // L'erreur OAuth reste affichée même si son audit secondaire est indisponible.
  }
}

/**
 * À appeler au chargement de l'app : si l'URL contient `?code=` (retour Strava),
 * échange le code via l'edge function puis nettoie l'URL. `null` si pas de retour OAuth.
 */
export async function handleStravaRedirect(
  options: { supportSessionId?: string } = {},
): Promise<StravaRedirectResult> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')
  const scope = url.searchParams.get('scope') ?? ''
  // On n'intercepte QUE les retours Strava (state dédié) : un retour OAuth Supabase
  // (Google/Apple) utilise aussi `?code=` et doit être laissé à detectSessionInUrl.
  if (url.searchParams.get('state') !== STRAVA_STATE) return null
  if (!code && !err) return null

  // Nettoie l'URL (retire la query OAuth, conserve le chemin de routage).
  window.history.replaceState({}, '', `${url.origin}${url.pathname}`)

  if (err || !code) {
    await logAssistedOAuthResult(options.supportSessionId, 'denied')
    return 'denied'
  }
  if (!hasRequiredStravaActivityScope(scope)) {
    await logAssistedOAuthResult(options.supportSessionId, 'missing_scope')
    return 'missing_scope'
  }

  const { data: { session } } = await supabase.auth.getSession()

  // ── Cas 1 — DÉJÀ connecté : on LIE Strava au compte existant (strava-oauth). ──
  if (session) {
    try {
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          code,
          scope,
          supportSessionId: options.supportSessionId,
        }),
      })
      if (r.ok) return 'connected'
      const payload = await r.json().catch(() => null) as unknown
      return classifyStravaOAuthFailure(payload)
    } catch {
      await logAssistedOAuthResult(options.supportSessionId, 'client_error')
      return 'error'
    }
  }

  // ── Cas 2 — PAS de session : inscription / connexion AVEC Strava (strava-auth). ──
  // La fonction publique retrouve/crée le compte lié à l'athlète et renvoie un
  // token_hash de magic-link ; on l'échange contre une session côté client.
  try {
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ code, scope }),
    })
    if (!r.ok) return 'error'
    const { token_hash } = (await r.json()) as { token_hash?: string }
    if (!token_hash) return 'error'
    const { error: otpErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash })
    return otpErr ? 'error' : 'connected'
  } catch {
    return 'error'
  }
}
