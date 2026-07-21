// Connexions sociales mobiles gérées PAR Supabase (Apple / Google).
// Apple : bouton NATIF `expo-apple-authentication` sur iOS (exigence Apple à la
// publication App Store), avec fallback OAuth Supabase par navigateur (Android /
// simulateur sans capacité Sign in with Apple). Activation par
// EXPO_PUBLIC_APPLE_ENABLED — positionné à `true` dans les profils EAS
// preview/production (mobile/eas.json) : rien à flipper le jour J.
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from './supabase'

export const APPLE_ENABLED = process.env.EXPO_PUBLIC_APPLE_ENABLED === 'true'

/** Sign in with Apple NATIF (feuille système iOS) → session Supabase via id_token.
 *  Hors iOS (ou capacité indisponible), bascule sur le flux OAuth navigateur. */
export async function signInWithAppleMobile(): Promise<SocialResult> {
  const available = await AppleAuthentication.isAvailableAsync().catch(() => false)
  if (!available) return signInWithSupabaseOAuthMobile('apple')

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
    if (!credential.identityToken) return 'error'
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    })
    return error ? 'error' : 'connected'
  } catch (e) {
    const code = (e as { code?: string })?.code
    if (code === 'ERR_REQUEST_CANCELED') return 'denied'
    return 'error'
  }
}

export type SocialResult = 'connected' | 'denied' | 'error'

/** Flux OAuth Supabase (apple/google) sur mobile : ouvre le navigateur, récupère le
 *  code PKCE au retour sur le schéma de l'app, l'échange contre une session. */
export async function signInWithSupabaseOAuthMobile(provider: 'apple' | 'google'): Promise<SocialResult> {
  const redirectTo = Linking.createURL('auth') // vorcelab://auth (build) / exp://…/auth (dev)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  })
  if (error || !data?.url) return 'error'

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (res.type === 'cancel' || res.type === 'dismiss') return 'denied'
  if (res.type !== 'success' || !res.url) return 'error'

  const code = res.url.match(/[?&]code=([^&#]*)/)?.[1]
  if (!code) return 'error'
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(code))
  return exErr ? 'error' : 'connected'
}
