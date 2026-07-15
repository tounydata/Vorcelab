import { useCallback } from 'react'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'

// La taxonomie vit dans un module sans dépendance (testable sous Node sans
// initialiser supabase-js). Réexportée pour compatibilité des imports existants.
export { ANALYTICS_EVENTS } from './analyticsEvents'
export type { AppEvent } from './analyticsEvents'
import type { AppEvent } from './analyticsEvents'

export function useTrackEvent() {
  const user = useVLStore((s) => s.user)

  return useCallback(
    (event: AppEvent, meta: Record<string, unknown> = {}) => {
      if (!user) return
      // fire-and-forget : on ne bloque jamais l'UI sur le tracking
      supabase
        .from('user_events')
        .insert({ user_id: user.id, event, meta })
        .then(() => undefined)
    },
    [user],
  )
}
