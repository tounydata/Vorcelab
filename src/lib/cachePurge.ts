// Purge des caches du service worker susceptibles de contenir des réponses
// authentifiées de l'API Supabase. Isolé de session.ts (qui importe le client
// Supabase) pour rester importable sans initialiser supabase-js — utile aux
// tests Node et à l'appel très tôt au démarrage.
//
// Une version précédente de la PWA mettait en cache toutes les réponses
// *.supabase.co (NetworkFirst 24 h) sous le nom `supabase-api` : dangereux (fuite
// de données entre comptes sur un même appareil, données périmées hors ligne).
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
