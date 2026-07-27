// Tracking produit — portage fidèle de src/lib/useTrackEvent.ts, adapté au
// pattern d'auth natif (useAuth au lieu du store zustand web). Fire-and-forget.
import { useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

import type { AppEvent } from './analyticsEvents'
import { isActivationOnceEvent } from './analyticsEvents'
export { ANALYTICS_EVENTS, isActivationOnceEvent } from './analyticsEvents'
export type { AppEvent } from './analyticsEvents'

// Déduplication en session (cf. web) : la garantie « une fois par utilisateur »
// vient de l'index unique partiel en base ; ici on épargne des requêtes.
const emittedOnce = new Set<string>()

export function useTrackEvent() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  return useCallback(
    (event: AppEvent, meta: Record<string, unknown> = {}) => {
      if (!userId) return
      if (isActivationOnceEvent(event)) {
        const key = `${userId}:${event}`
        if (emittedOnce.has(key)) return
        emittedOnce.add(key)
        supabase.from('user_events').insert({ user_id: userId, event, meta }).then(() => undefined)
        return
      }
      // fire-and-forget : on ne bloque jamais l'UI sur le tracking
      supabase
        .from('user_events')
        .insert({ user_id: userId, event, meta })
        .then(() => undefined)
    },
    [userId],
  )
}
