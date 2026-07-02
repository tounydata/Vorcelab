// Port exact de fetchStreams (activity-analysis.js)
import { supabase, SUPA_URL } from './supabase'


export interface StreamData {
  heartrate?: { data: number[] }
  time?: { data: number[] }
  distance?: { data: number[] }
  altitude?: { data: number[] }
  velocity_smooth?: { data: number[] }
  cadence?: { data: number[] }
  latlng?: { data: [number, number][] }
  _authError?: boolean
}

export async function fetchStreams(activityId: number | string): Promise<StreamData> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { _authError: true }
  const userId = session.user?.id

  // Cache-first: read from DB if available
  if (userId) {
    const { data: cached } = await supabase
      .from('activity_streams')
      .select('data')
      .eq('user_id', userId)
      .eq('activity_id', activityId)
      .maybeSingle()
    if (cached?.data && Object.keys(cached.data).length > 0) {
      return cached.data as StreamData
    }
  }

  // Fallback: fetch from Strava via edge function (token stays server-side)
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ activityId, keys: 'time,distance,altitude,heartrate,velocity_smooth,cadence,latlng' }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) {
      console.warn('[VL] fetchStreams HTTP', r.status, r.statusText)
      if (r.status === 401) return { _authError: true }
      return {}
    }
    const data = await r.json()
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      console.warn('[VL] fetchStreams: réponse vide pour activité', activityId)
      return data ?? {}
    }
    // Store in DB cache (fire-and-forget, never blocks caller)
    if (userId) {
      supabase.from('activity_streams').upsert({
        user_id: userId,
        activity_id: activityId,
        data,
        cached_at: new Date().toISOString(),
      }, { onConflict: 'user_id,activity_id' }).then(({ error }) => {
        if (error) console.warn('[VL] fetchStreams cache write error:', error.message)
      })
    }
    return data as StreamData
  } catch (e) {
    console.warn('[VL] fetchStreams exception:', e)
    return {}
  }
}
