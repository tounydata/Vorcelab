import { create } from 'zustand'
import type { StravaActivity } from '@runner-os/shared'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { env } from '@/config/env'
import type { StravaRefreshResponse } from '@runner-os/shared'

const CACHE_TTL_MS = 60_000
let lastLoadedAt = 0
let inFlightLoad: Promise<void> | null = null

interface StravaState {
  connected: boolean
  athleteName: string | null
  activities: StravaActivity[]
  loading: boolean
  error: string | null
  loadActivities: () => Promise<void>
  connectStrava: () => void
  refreshActivities: () => Promise<void>
}

export const useStravaStore = create<StravaState>((set, get) => ({
  connected: false,
  athleteName: null,
  activities: [],
  loading: false,
  error: null,

  loadActivities: async () => {
    if (inFlightLoad) return inFlightLoad
    const { activities } = get()
    if (activities.length > 0 && Date.now() - lastLoadedAt < CACHE_TTL_MS) {
      return
    }

    set({ loading: true, error: null })
    inFlightLoad = (async () => {
      try {
        const {
        data: { user },
      } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')

        const { data, error } = await supabase
        .from('activities_history')
        .select('data, zone_data')
        .eq('user_id', user.id)
        .order('imported_at', { ascending: false })
        .limit(1)
        .single()

        if (error && error.code !== 'PGRST116') throw error

        const activities = (data?.data as StravaActivity[] | null) ?? []
        lastLoadedAt = Date.now()
        set({ activities, connected: activities.length > 0, loading: false })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur de chargement'
        logger.error('Failed to load activities', { message })
        set({ error: message, loading: false })
      } finally {
        inFlightLoad = null
      }
    })()

    return inFlightLoad
  },

  connectStrava: () => {
    const redirectUri = `${window.location.origin}/auth/strava/callback`
    const params = new URLSearchParams({
      client_id: env.strava.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all',
    })
    window.location.href = `https://www.strava.com/oauth/authorize?${params.toString()}`
  },

  refreshActivities: async () => {
    set({ loading: true, error: null })
    try {
      await invokeFunction<StravaRefreshPayload, StravaRefreshResponse>('strava-refresh', {
        body: { userId: (await supabase.auth.getUser()).data.user?.id ?? '' },
      })
      lastLoadedAt = 0
      await get().loadActivities()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de rafraîchissement'
      logger.error('Failed to refresh activities', { message })
      set({ error: message, loading: false })
    }
  },
}))

interface StravaRefreshPayload {
  userId: string
}
