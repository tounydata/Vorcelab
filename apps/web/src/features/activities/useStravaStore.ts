import { create } from 'zustand'
import type { StravaActivity, StravaSyncResponse } from '@runner-os/shared'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { env } from '@/config/env'

type StravaActivityRow = Database['public']['Tables']['strava_activities']['Row']

interface StravaState {
  connected: boolean
  athleteName: string | null
  activities: StravaActivity[]
  loading: boolean
  error: string | null
  loadActivities: () => Promise<void>
  loadConnectionStatus: () => Promise<void>
  connectStrava: () => void
  refreshActivities: () => Promise<void>
}

export const useStravaStore = create<StravaState>((set, get) => ({
  connected: false,
  athleteName: null,
  activities: [],
  loading: false,
  error: null,

  loadConnectionStatus: async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('strava_tokens')
        .select('athlete_firstname, athlete_lastname, athlete_avatar, last_sync_at, scope')
        .eq('user_id', user.id)
        .maybeSingle()

      if (data) {
        const name = [data.athlete_firstname, data.athlete_lastname].filter(Boolean).join(' ')
        set({ connected: true, athleteName: name || null })
      } else {
        set({ connected: false, athleteName: null })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de statut Strava'
      logger.error('Failed to load Strava connection status', { message })
    }
  },

  loadActivities: async () => {
    set({ loading: true, error: null })

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const { data: activitiesData, error } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(200)

      if (error) throw error

      const rows = (activitiesData ?? []) as StravaActivityRow[]
      const activities: StravaActivity[] = rows.map((row) => {
        const base = {
          id: Number(row.strava_activity_id),
          name: row.name ?? '',
          type: row.type ?? 'Run',
          sport_type: row.sport_type ?? '',
          start_date: row.start_date ?? '',
          start_date_local: row.start_date_local ?? '',
          distance: Number(row.distance ?? 0),
          moving_time: Number(row.moving_time ?? 0),
          elapsed_time: Number(row.elapsed_time ?? 0),
          total_elevation_gain: Number(row.total_elevation_gain ?? 0),
          average_speed: Number(row.average_speed ?? 0),
          max_speed: Number(row.max_speed ?? 0),
          achievement_count: 0,
          kudos_count: 0,
        }
        return {
          ...base,
          ...(row.average_heartrate != null && {
            average_heartrate: Number(row.average_heartrate),
          }),
          ...(row.max_heartrate != null && { max_heartrate: Number(row.max_heartrate) }),
          ...(row.average_cadence != null && { average_cadence: Number(row.average_cadence) }),
          ...(row.suffer_score != null && { suffer_score: Number(row.suffer_score) }),
          ...(row.calories != null && { calories: Number(row.calories) }),
        }
      })

      set({ activities, connected: activities.length > 0, loading: false })
      void get().loadConnectionStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      logger.error('Failed to load activities', { message })
      set({ error: message, loading: false })
    }
  },

  connectStrava: () => {
    const state = crypto.randomUUID()
    sessionStorage.setItem('strava_oauth_state', state)

    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
    const redirectUri = `${window.location.origin}${basePath}/auth/strava/callback`

    const params = new URLSearchParams({
      client_id: env.strava.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read,activity:read_all',
      state,
    })

    window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`
  },

  refreshActivities: async () => {
    set({ loading: true, error: null })

    try {
      await invokeFunction<Record<string, never>, StravaSyncResponse>('strava-refresh', {})
      await get().loadActivities()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de rafraîchissement'
      logger.error('Failed to refresh activities', { message })
      set({ error: message, loading: false })
    }
  },
}))
