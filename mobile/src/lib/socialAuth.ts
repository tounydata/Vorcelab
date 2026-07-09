// Connexions sociales mobiles gérées PAR Supabase (Apple / Google) via navigateur natif.
// Apple est CÂBLÉ mais désactivé (EXPO_PUBLIC_APPLE_ENABLED) : on l'activera à la
// publication App Store (Apple l'impose alors). À ce moment, la voie idéale iOS est le
// bouton NATIF `expo-apple-authentication` — ce helper (OAuth Supabase par navigateur)
// est le fallback prêt à l'emploi en attendant.
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from './supabase'

export const APPLE_ENABLED = process.env.EXPO_PUBLIC_APPLE_ENABLED === 'true'

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
