import { supabase } from './supabase'
import { purgeDangerousCaches } from './cachePurge'

export { purgeDangerousCaches } from './cachePurge'

/**
 * Déconnexion propre : purge d'abord les caches locaux susceptibles de contenir
 * des données du compte, puis termine la session Supabase (ce qui efface le token
 * d'auth du localStorage). Évite qu'une réponse authentifiée reste disponible
 * localement après la déconnexion ou lors d'un changement de compte.
 */
export async function signOutAndClear(): Promise<void> {
  localStorage.removeItem('vl-had-session')
  await purgeDangerousCaches()
  await supabase.auth.signOut()
}
