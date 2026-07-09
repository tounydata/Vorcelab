// Connexion Strava (OAuth) côté front. Le client_id est PUBLIC (il apparaît dans
// l'URL d'autorisation) ; le secret reste dans l'edge function strava-oauth.
// Configurer VITE_STRAVA_CLIENT_ID dans l'environnement de build.
import { supabase, SUPA_URL, SUPA_KEY } from './supabase'


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

/** Démarre le flux OAuth Strava (redirige le navigateur vers Strava). */
export function startStravaOAuth(): void {
  if (!stravaConfigured()) return
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
  })
  window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`
}

export type StravaRedirectResult = 'connected' | 'denied' | 'error' | null

/**
 * À appeler au chargement de l'app : si l'URL contient `?code=` (retour Strava),
 * échange le code via l'edge function puis nettoie l'URL. `null` si pas de retour OAuth.
 */
export async function handleStravaRedirect(): Promise<StravaRedirectResult> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')
  const scope = url.searchParams.get('scope') ?? ''
  if (!code && !err) return null

  // Nettoie l'URL (retire la query OAuth, conserve le chemin de routage).
  window.history.replaceState({}, '', `${url.origin}${url.pathname}`)

  if (err || !code) return 'denied'

  const { data: { session } } = await supabase.auth.getSession()

  // ── Cas 1 — DÉJÀ connecté : on LIE Strava au compte existant (strava-oauth). ──
  if (session) {
    try {
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ code, scope }),
      })
      return r.ok ? 'connected' : 'error'
    } catch {
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
