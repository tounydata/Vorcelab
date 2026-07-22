// Tracking produit — portage fidèle de src/lib/useTrackEvent.ts, adapté au
// pattern d'auth natif (useAuth au lieu du store zustand web). Fire-and-forget.
import { useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

import type { AppEvent } from './analyticsEvents'
export { ANALYTICS_EVENTS } from './analyticsEvents'
export type { AppEvent } from './analyticsEvents'

export function useTrackEvent() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  return useCallback(
    (event: AppEvent, meta: Record<string, unknown> = {}) => {
      if (!userId) return
      // fire-and-forget : on ne bloque jamais l'UI sur le tracking
      supabase
        .from('user_events')
        .insert({ user_id: userId, event, meta })
        .then(() => undefined)
    },
    [userId],
  )
}
