import { supabase } from './supabase'

const SUPA_URL = 'https://wanzrkdgqmcctwvnbmuv.supabase.co'

export interface Streams {
  time?: { data: number[] }
  distance?: { data: number[] }
  altitude?: { data: number[] }
  heartrate?: { data: number[] }
  velocity_smooth?: { data: number[] }
  cadence?: { data: number[] }
  latlng?: { data: [number, number][] }
  _authError?: boolean
}

export async function fetchStreams(activityId: number): Promise<Streams> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { _authError: true }
  const userId = session.user.id

  const { data: cached } = await supabase
    .from('activity_streams')
    .select('data')
    .eq('user_id', userId)
    .eq('activity_id', activityId)
    .maybeSingle()
  if (cached?.data && Object.keys(cached.data).length > 0) return cached.data as Streams

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    const r = await fetch(`${SUPA_URL}/functions/v1/strava-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ activityId, keys: 'time,distance,altitude,heartrate,velocity_smooth,cadence,latlng' }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) {
      if (r.status === 401) return { _authError: true }
      return {}
    }
    const data: Streams = await r.json()
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) return {}
    supabase.from('activity_streams').upsert({
      user_id: userId,
      activity_id: activityId,
      data,
      cached_at: new Date().toISOString(),
    }, { onConflict: 'user_id,activity_id' }).then(({ error }) => {
      if (error) console.warn('[VL] streams cache write error:', error.message)
    })
    return data
  } catch {
    return {}
  }
}
