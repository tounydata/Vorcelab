import { supabase } from './supabase'

// Caches gérés (ou anciennement gérés) par le service worker qui ont pu contenir
// des réponses authentifiées de l'API Supabase. Une version précédente de la PWA
// mettait en cache toutes les réponses *.supabase.co (NetworkFirst 24 h) sous le
// nom `supabase-api` : dangereux (fuite de données entre comptes sur un même
// appareil, données périmées hors ligne). On purge ces caches au démarrage — pour
// nettoyer les clients qui ont déjà installé l'ancien service worker — et à la
// déconnexion.
const DANGEROUS_CACHE_NAMES = ['supabase-api']

/**
 * Supprime les caches susceptibles de contenir des réponses authentifiées.
 * `cacheStorage` est injectable pour les tests ; par défaut on utilise l'API du
 * navigateur si elle est présente (absente en SSR / environnement Node).
 */
export async function purgeDangerousCaches(
  cacheStorage: CacheStorage | undefined = typeof caches !== 'undefined' ? caches : undefined,
): Promise<void> {
  if (!cacheStorage) return
  const names = await cacheStorage.keys()
  await Promise.all(
    names.filter((name) => DANGEROUS_CACHE_NAMES.includes(name)).map((name) => cacheStorage.delete(name)),
  )
}

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
