import { create } from 'zustand'
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'
import { supabase } from '../lib/supabase'

export interface StravaActivity {
  id: number
  name: string
  type: string
  start_date: string
  distance: number
  moving_time: number
  total_elevation_gain: number
  average_speed: number
  average_heartrate?: number
  max_heartrate?: number
  calories?: number
}

interface StravaState {
  connected: boolean
  athleteName: string | null
  activities: StravaActivity[]
  loading: boolean
  error: string | null
  loadActivities: () => Promise<void>
  connectStrava: () => Promise<void>
  refreshActivities: () => Promise<void>
}

const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? ''
const OAUTH_FUNCTION = process.env.EXPO_PUBLIC_STRAVA_OAUTH_FUNCTION ?? 'strava-oauth'

export const useStravaStore = create<StravaState>((set, get) => ({
  connected: false,
  athleteName: null,
  activities: [],
  loading: false,
  error: null,

  loadActivities: async () => {
    set({ loading: true, error: null })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: tokenData } = await supabase
        .from('strava_tokens')
        .select('athlete_firstname, athlete_lastname')
        .eq('user_id', user.id)
        .maybeSingle()

      if (tokenData) {
        const name = [tokenData.athlete_firstname, tokenData.athlete_lastname]
          .filter(Boolean)
          .join(' ')
        set({ connected: true, athleteName: name || null })
      }

      const { data, error } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(200)

      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activities: StravaActivity[] = (data ?? []).map((row: any) => ({
        id: Number(row.strava_activity_id),
        name: row.name ?? '',
        type: row.type ?? 'Run',
        start_date: row.start_date ?? '',
        distance: Number(row.distance ?? 0),
        moving_time: Number(row.moving_time ?? 0),
        total_elevation_gain: Number(row.total_elevation_gain ?? 0),
        average_speed: Number(row.average_speed ?? 0),
        ...(row.average_heartrate != null && { average_heartrate: Number(row.average_heartrate) }),
        ...(row.max_heartrate != null && { max_heartrate: Number(row.max_heartrate) }),
        ...(row.calories != null && { calories: Number(row.calories) }),
      }))

      set({
        activities,
        connected: activities.length > 0 || !!tokenData,
        loading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      set({ error: message, loading: false })
    }
  },

  connectStrava: async () => {
    if (!STRAVA_CLIENT_ID) {
      set({ error: 'EXPO_PUBLIC_STRAVA_CLIENT_ID non configuré' })
      return
    }

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'vorcelab',
      path: 'auth/strava/callback',
    })

    // Log so the user can register the URI with Strava
    console.log('[Strava OAuth] redirect_uri =', redirectUri)

    const state = Math.random().toString(36).slice(2, 18)

    const stravaUrl =
      `https://www.strava.com/oauth/authorize?` +
      new URLSearchParams({
        client_id: STRAVA_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: 'read,activity:read,activity:read_all',
        state,
      }).toString()

    try {
      const result = await WebBrowser.openAuthSessionAsync(stravaUrl, redirectUri)
      if (result.type !== 'success') return

      const paramStr = result.url.includes('?') ? result.url.split('?')[1] : ''
      const params = new URLSearchParams(paramStr)
      const code = params.get('code')
      const scope = params.get('scope') ?? ''
      const returnedState = params.get('state')

      if (!code || returnedState !== state) {
        set({ error: 'OAuth Strava invalide — réessaie' })
        return
      }

      set({ loading: true, error: null })

      const { error: oauthError } = await supabase.functions.invoke(OAUTH_FUNCTION, {
        body: { code, scope },
      })
      if (oauthError) throw oauthError

      const { error: refreshError } = await supabase.functions.invoke('strava-refresh', {
        body: {},
      })
      if (refreshError) throw refreshError

      await get().loadActivities()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur OAuth Strava'
      set({ error: message, loading: false })
    }
  },

  refreshActivities: async () => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.functions.invoke('strava-refresh', { body: {} })
      if (error) throw error
      await get().loadActivities()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de sync'
      set({ error: message, loading: false })
    }
  },
}))
