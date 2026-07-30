// Session d'assistance MOBILE — usurpation encadrée, avec restauration.
//
// Sur le web, l'assistance ouvre une FENÊTRE isolée dont la session vit dans un
// `sessionStorage` séparé : la session admin n'est jamais touchée. Une app mobile n'a
// pas de seconde fenêtre. L'équivalent honnête est donc de BASCULER la session du
// client principal vers l'utilisateur assisté, puis de RESTAURER celle de l'admin.
//
// Comme `AuthProvider` écoute `onAuthStateChange`, la bascule se propage à tous les
// écrans : l'admin voit l'app exactement comme l'utilisateur la voit.
//
// Garde-fous :
//   • la session admin est capturée AVANT la bascule et restaurée à la sortie ;
//   • le serveur borne la session d'assistance dans le temps (`expires_at`) ; un minuteur
//     local restaure automatiquement l'admin à l'échéance, même si l'admin oublie ;
//   • aucun mot de passe n'est lu : le serveur remet un OTP à usage unique (`token_hash`)
//     via `admin.auth.admin.generateLink`, et toute action reste journalisée côté serveur.
//
// Limite ASSUMÉE : la session admin capturée vit en mémoire. Si l'app est tuée pendant
// une assistance, l'admin devra se reconnecter — c'est volontairement plus sûr que de
// persister ses jetons sur l'appareil.

import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { runSupportAction } from './adminApi'

export interface AssistedSessionMeta {
  supportSessionId: string
  targetUserId: string
  targetLabel: string
  expiresAt: string
}

let adminSession: Session | null = null
let current: AssistedSessionMeta | null = null
let expiryTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(meta: AssistedSessionMeta | null) => void>()

function emit(): void {
  for (const listener of listeners) listener(current)
}

/** S'abonne à l'état d'assistance (pour la bannière). Renvoie le désabonnement. */
export function subscribeAssistedSession(
  listener: (meta: AssistedSessionMeta | null) => void,
): () => void {
  listeners.add(listener)
  listener(current)
  return () => { listeners.delete(listener) }
}

export function getAssistedSession(): AssistedSessionMeta | null {
  return current
}

function clearTimer(): void {
  if (expiryTimer) { clearTimeout(expiryTimer) ; expiryTimer = null }
}

/**
 * Bascule l'app sur l'utilisateur assisté. Exige une session d'assistance ACTIVE côté
 * serveur (créée via `admin_start_support_session`) : c'est le serveur qui délivre l'OTP.
 */
export async function startAssistedSession(
  supportSessionId: string,
  targetLabel: string,
): Promise<AssistedSessionMeta> {
  if (current) throw new Error('Une session assistée est déjà en cours.')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Session admin introuvable.')

  const result = await runSupportAction(supportSessionId, 'start_vorcelab_impersonation')
  const tokenHash = result.token_hash
  if (typeof tokenHash !== 'string' || !tokenHash) {
    throw new Error('Le serveur n’a pas délivré de jeton d’assistance.')
  }

  // On capture la session admin AVANT toute bascule : sans ça, un échec de
  // `verifyOtp` laisserait l'admin déconnecté sans moyen de revenir.
  adminSession = session

  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (error) {
    adminSession = null
    throw new Error(`Bascule impossible : ${error.message}`)
  }

  const expiresAt = typeof result.expires_at === 'string'
    ? result.expires_at
    : new Date(Date.now() + 45 * 60_000).toISOString()

  current = {
    supportSessionId: String(result.support_session_id ?? ''),
    targetUserId: String(result.target_user_id ?? ''),
    targetLabel,
    expiresAt,
  }

  // Restauration automatique à l'échéance serveur : l'assistance ne doit jamais
  // survivre à sa fenêtre autorisée, même si l'admin l'oublie.
  const remaining = Date.parse(expiresAt) - Date.now()
  clearTimer()
  if (Number.isFinite(remaining) && remaining > 0) {
    expiryTimer = setTimeout(() => { void endAssistedSession() }, remaining)
  }

  emit()
  return current
}

/** Restaure la session admin. Idempotent : sans assistance en cours, ne fait rien. */
export async function endAssistedSession(): Promise<void> {
  clearTimer()
  if (!current) return
  current = null

  const saved = adminSession
  adminSession = null
  emit()

  if (!saved) {
    // Sécurité : plutôt déconnecter que laisser l'app sur le compte de l'utilisateur.
    await supabase.auth.signOut()
    return
  }
  const { error } = await supabase.auth.setSession({
    access_token: saved.access_token,
    refresh_token: saved.refresh_token,
  })
  if (error) await supabase.auth.signOut()
}
