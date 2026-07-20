// Recalcul du profil coureur — SOURCE UNIQUE : le serveur (§1).
//
// Le profil n'est plus jamais recalculé localement (web/mobile). On invoque l'Edge Function
// `compute-runner-profile`, qui utilise le CŒUR PUR partagé sur la fenêtre moteur complète
// (183 j, streams cache-first) et PERSISTE le profil de façon non destructive. Le client se
// contente ensuite de relire le profil serveur → une seule vérité, pas de divergence
// web/mobile/benchmark, plus de calcul sur 50 activités tronquées côté navigateur.

import { supabase } from './supabase'

/**
 * Déclenche le recalcul serveur du profil coureur et attend sa fin. Lève en cas d'erreur
 * (l'appelant décide de logguer / réessayer). Le profil est persisté côté serveur ; l'appelant
 * doit ensuite rafraîchir sa lecture (refetch / invalidate).
 */
export async function recomputeRunnerProfileServer(): Promise<void> {
  const { error } = await supabase.functions.invoke('compute-runner-profile')
  if (error) throw error
}
