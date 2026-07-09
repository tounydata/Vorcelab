// Connexion / inscription Strava sur mobile (OAuth natif).
// Strava n'accepte qu'un DOMAINE en callback (pas de schéma custom), donc on passe par
// une page-pont web (https://vorcelab.app/mobile-strava) qui rebondit vers le schéma de
// l'app (vorcelab://strava) ; expo-web-browser intercepte ce retour. On réutilise ensuite
// les edge functions existantes : strava-oauth (déjà connecté → liaison) ou strava-auth
// (pas de session → inscription/connexion, renvoie un token_hash de magic-link).
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase, SUPA_URL, SUPA_KEY } from './supabase'

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '161609'
// Page-pont hébergée par le web (déployée avec l'app) — cf. src/App.tsx route /mobile-strava.
const BRIDGE_URL = process.env.EXPO_PUBLIC_STRAVA_BRIDGE ?? 'https://vorcelab.app/mobile-strava'

export type StravaMobileResult = 'connected' | 'denied' | 'error'

/** Extrait un paramètre de query d'une URL sans dépendre de l'objet URL (Hermes limité). */
function param(url: string, key: string): string | null {
  const m = url.match(new RegExp(`[?&]${key}=([^&#]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

export async function signInWithStravaMobile(): Promise<StravaMobileResult> {
  const returnUrl = Linking.createURL('strava') // vorcelab://strava (build) ou exp://…/strava (dev)
  const authUrl =
    'https://www.strava.com/oauth/authorize' +
    `?client_id=${encodeURIComponent(STRAVA_CLIENT_ID)}` +
    '&response_type=code' +
    `&redirect_uri=${encodeURIComponent(BRIDGE_URL)}` +
    '&approval_prompt=auto' +
    '&scope=read,activity:read_all' +
    // La page-pont lira `state` pour savoir vers quel schéma d'app rebondir.
    `&state=${encodeURIComponent(returnUrl)}`

  const res = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl)
  if (res.type === 'cancel' || res.type === 'dismiss') return 'denied'
  if (res.type !== 'success' || !res.url) return 'error'

  const code = param(res.url, 'code')
  const err = param(res.url, 'error')
  if (err || !code) return 'denied'
  const scope = param(res.url, 'scope') ?? 'read,activity:read_all'

  try {
    const { data: { session } } = await supabase.auth.getSession()
    // Déjà connecté → on LIE Strava au compte existant.
    if (session) {
      const r = await fetch(`${SUPA_URL}/functions/v1/strava-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ code, scope }),
      })
      return r.ok ? 'connected' : 'error'
    }
    // Pas de session → inscription / connexion via strava-auth (magic-link → verifyOtp).
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ code, scope }),
    })
    if (!r.ok) return 'error'
    const { token_hash } = (await r.json()) as { token_hash?: string }
    if (!token_hash) return 'error'
    const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash })
    return error ? 'error' : 'connected'
  } catch {
    return 'error'
  }
}
