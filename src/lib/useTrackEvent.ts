import { useCallback } from 'react'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'

export type AppEvent =
  | 'session_start'
  | 'coach_viewed'
  | 'race_created'
  | 'strategy_viewed'
  | 'activities_viewed'
  | 'strava_connected'
  | 'gpx_uploaded'
  | 'plan_upgraded'

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
