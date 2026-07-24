import { useCallback } from 'react'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'

// La taxonomie vit dans un module sans dépendance (testable sous Node sans
// initialiser supabase-js). Réexportée pour compatibilité des imports existants.
export { ANALYTICS_EVENTS, isActivationOnceEvent } from './analyticsEvents'
export type { AppEvent } from './analyticsEvents'
import type { AppEvent } from './analyticsEvents'
import { isActivationOnceEvent } from './analyticsEvents'

// Déduplication en session : évite de re-tenter l'insertion d'un jalon déjà émis
// dans cet onglet. La garantie RÉELLE « une fois par utilisateur » (multi-session,
// multi-appareil) vient de l'index unique partiel en base ; ici on épargne juste
// des requêtes. Clé = `${userId}:${event}`.
const emittedOnce = new Set<string>()

export function useTrackEvent() {
  const user = useVLStore((s) => s.user)

  return useCallback(
    (event: AppEvent, meta: Record<string, unknown> = {}) => {
      if (!user) return
      // Jalon d'activation : une seule fois par utilisateur.
      if (isActivationOnceEvent(event)) {
        const key = `${user.id}:${event}`
        if (emittedOnce.has(key)) return
        emittedOnce.add(key)
        // fire-and-forget ; le doublon (index unique partiel) est ignoré côté base.
        supabase.from('user_events').insert({ user_id: user.id, event, meta }).then(() => undefined)
        return
      }
      // fire-and-forget : on ne bloque jamais l'UI sur le tracking
      supabase
        .from('user_events')
        .insert({ user_id: user.id, event, meta })
        .then(() => undefined)
    },
    [user],
  )
}
