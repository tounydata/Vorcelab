import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_ACTIVITIES_URL = 'https://www.strava.com/api/v3/athlete/activities'
const STRAVA_ACTIVITY_URL = 'https://www.strava.com/api/v3/activities'
const STRAVA_DEAUTH_URL = 'https://www.strava.com/oauth/deauthorize'

// ─── Token management ────────────────────────────────────────────────────────

export async function getValidStravaAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data: row, error } = await supabase
    .from('strava_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (error || !row) throw new Error('No Strava connection found for user')

  const nowSeconds = Math.floor(Date.now() / 1000)
  // Refresh if token expires within 5 minutes
  if ((row.expires_at as number) > nowSeconds + 300) return row.access_token as string

  return refreshStravaToken(supabase, userId, row.refresh_token as string)
}

export async function refreshStravaToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  currentRefreshToken: string
): Promise<string> {
  const clientId = Deno.env.get('STRAVA_CLIENT_ID')!
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')!

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava token refresh failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_at: number
  }

  await supabase
    .from('strava_tokens')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return data.access_token
}

export async function deauthorizeStrava(accessToken: string): Promise<void> {
  await fetch(STRAVA_DEAUTH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // Strava deauth — ignore response errors, best effort
}

// ─── Activity fetching ────────────────────────────────────────────────────────

export interface StravaRawActivity {
  id: number
  athlete: { id: number }
  name: string
  type: string
  sport_type: string
  start_date: string
  start_date_local: string
  timezone: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  average_cadence?: number
  calories?: number
  suffer_score?: number
  start_latlng?: [number, number] | []
}

export async function fetchStravaActivitiesPage(
  accessToken: string,
  page: number,
  perPage = 200,
  after?: number
): Promise<StravaRawActivity[]> {
  const url = new URL(STRAVA_ACTIVITIES_URL)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))
  if (after !== undefined) url.searchParams.set('after', String(after))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava activities fetch failed: ${res.status} ${body}`)
  }

  return res.json() as Promise<StravaRawActivity[]>
}

export async function fetchStravaActivityById(
  accessToken: string,
  activityId: number | bigint
): Promise<StravaRawActivity> {
  const res = await fetch(`${STRAVA_ACTIVITY_URL}/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Strava activity ${activityId} fetch failed: ${res.status} ${body}`)
  }

  return res.json() as Promise<StravaRawActivity>
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncOptions {
  /** If true, fetch all activities ignoring last_sync_at */
  full?: boolean
}

export async function syncStravaActivitiesForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  accessToken: string,
  options: SyncOptions = {}
): Promise<number> {
  const { data: tokenRow } = await supabase
    .from('strava_tokens')
    .select('last_sync_at, strava_athlete_id')
    .eq('user_id', userId)
    .single()

  // For incremental sync, use last_sync_at - 24h as buffer to catch updates
  let after: number | undefined
  if (!options.full && tokenRow?.last_sync_at) {
    const lastSync = new Date(tokenRow.last_sync_at as string)
    lastSync.setHours(lastSync.getHours() - 24)
    after = Math.floor(lastSync.getTime() / 1000)
  }

  let page = 1
  let synced = 0
  const athleteId = tokenRow?.strava_athlete_id as number | undefined

  // Paginate until Strava returns an empty page
  // Per Strava docs: keep paginating until you get an empty array
  while (true) {
    const activities = await fetchStravaActivitiesPage(accessToken, page, 200, after)
    if (activities.length === 0) break

    for (const act of activities) {
      await upsertStravaActivity(supabase, userId, act, athleteId)
      synced++
    }

    page++

    // Respect Strava rate limits: 100 req/15min, 1000 req/day
    // Add small delay between pages to be a good API citizen
    if (page > 1) await sleep(100)
  }

  await supabase
    .from('strava_tokens')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  return synced
}

export async function upsertStravaActivity(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  act: StravaRawActivity,
  athleteId?: number
): Promise<void> {
  const { error } = await supabase.from('strava_activities').upsert(
    {
      user_id: userId,
      strava_activity_id: act.id,
      strava_athlete_id: athleteId ?? act.athlete?.id,
      name: act.name,
      type: act.type,
      sport_type: act.sport_type,
      start_date: act.start_date,
      start_date_local: act.start_date_local,
      timezone: act.timezone,
      distance: act.distance,
      moving_time: act.moving_time,
      elapsed_time: act.elapsed_time,
      total_elevation_gain: act.total_elevation_gain,
      average_speed: act.average_speed,
      max_speed: act.max_speed,
      average_heartrate: act.average_heartrate ?? null,
      max_heartrate: act.max_heartrate ?? null,
      average_cadence: act.average_cadence ?? null,
      calories: act.calories ?? null,
      suffer_score: act.suffer_score ?? null,
      raw_data: act as unknown as Record<string, unknown>,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,strava_activity_id' }
  )

  if (error) throw new Error(`upsertStravaActivity failed: ${error.message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
