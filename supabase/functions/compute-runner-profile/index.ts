import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getServiceClient } from '../_shared/auth.ts'

// verify_jwt: false — auth handled below (JWT or service role key for server-to-server)

const STRAVA_STREAMS_URL = 'https://www.strava.com/api/v3/activities'
const PERIOD_DAYS = 90
const MAX_ACTIVITIES = 30
const MIN_DIST_M = 3000

const TRAIL_TYPES = new Set([
  'Run', 'TrailRun', 'Trail Run', 'VirtualRun', 'run', 'trail', 'trailrun',
])

function isTrailActivity(type: string, sportType: string | null): boolean {
  return TRAIL_TYPES.has(type) || TRAIL_TYPES.has(sportType ?? '')
}

type BucketKey =
  | 'climb_easy' | 'climb_moderate' | 'climb_steep' | 'climb_wall'
  | 'flat'
  | 'descent_easy' | 'descent_moderate' | 'descent_steep'

const BUCKETS: { key: BucketKey; min: number; max: number; type: 'up' | 'flat' | 'down' }[] = [
  { key: 'climb_easy',       min: 3,    max: 6,    type: 'up'   },
  { key: 'climb_moderate',   min: 6,    max: 10,   type: 'up'   },
  { key: 'climb_steep',      min: 10,   max: 15,   type: 'up'   },
  { key: 'climb_wall',       min: 15,   max: 999,  type: 'up'   },
  { key: 'flat',             min: -3,   max: 3,    type: 'flat' },
  { key: 'descent_easy',     min: -8,   max: -3,   type: 'down' },
  { key: 'descent_moderate', min: -15,  max: -8,   type: 'down' },
  { key: 'descent_steep',    min: -999, max: -15,  type: 'down' },
]

function getGradeBucket(grade: number): BucketKey {
  for (const b of BUCKETS) {
    if (grade >= b.min && grade < b.max) return b.key
  }
  return grade >= 0 ? 'climb_wall' : 'descent_steep'
}

interface BucketAccum {
  timeSec: number
  dplusM: number
  hrWeightedSum: number
  hrWeightedN: number
  speedWeightedSum: number
  speedWeightedN: number
}

function emptyAccum(): BucketAccum {
  return { timeSec: 0, dplusM: 0, hrWeightedSum: 0, hrWeightedN: 0, speedWeightedSum: 0, speedWeightedN: 0 }
}

interface StreamData {
  time: { data: number[] }
  altitude?: { data: number[] }
  heartrate?: { data: number[] }
  velocity_smooth?: { data: number[] }
  grade_smooth?: { data: number[] }
}

async function fetchStreams(accessToken: string, activityId: string | number): Promise<StreamData | null> {
  const url = `${STRAVA_STREAMS_URL}/${activityId}/streams?keys=time,altitude,heartrate,velocity_smooth,grade_smooth&key_by_type=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status === 404 || res.status === 403) return null
  if (!res.ok) throw new Error(`Stream fetch ${activityId}: ${res.status}`)
  return res.json() as Promise<StreamData>
}

function accumulateStreams(streams: StreamData, accum: Record<BucketKey, BucketAccum>): void {
  const time = streams.time.data
  const alt = streams.altitude?.data
  const hr = streams.heartrate?.data
  const vel = streams.velocity_smooth?.data
  const grade = streams.grade_smooth?.data

  if (!grade || !time || time.length < 2) return

  for (let i = 0; i < time.length - 1; i++) {
    const dt = time[i + 1] - time[i]
    if (dt <= 0 || dt > 300) continue  // skip gaps > 5min (pauses)

    const g = grade[i] ?? 0
    const bucket = getGradeBucket(g)
    const a = accum[bucket]

    a.timeSec += dt

    if (alt) {
      const dalt = (alt[i + 1] ?? alt[i]) - alt[i]
      if (dalt > 0) a.dplusM += dalt
    }

    if (hr?.[i] != null) {
      a.hrWeightedSum += hr[i] * dt
      a.hrWeightedN += dt
    }

    if (vel?.[i] != null) {
      a.speedWeightedSum += vel[i] * dt  // m/s
      a.speedWeightedN += dt
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  // ── Auth: JWT (frontend) OR service role key (server-to-server from webhook) ──
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')

  let userId: string
  let fcMax = 190

  if (token === serviceRoleKey) {
    // Server-to-server call — userId must be in request body
    let body: { userId?: string } = {}
    try { body = await req.json() } catch { /* ok if no body */ }
    if (!body.userId) {
      return new Response(JSON.stringify({ error: 'userId required for service role calls' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    userId = body.userId
  } else {
    // User JWT
    const userClient = createClient(supabaseUrl, anonKey)
    const { data: { user }, error } = await userClient.auth.getUser(token)
    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    userId = user.id
  }

  const supabase = getServiceClient()

  try {
    // Fetch profile (fc_max)
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('fc_max')
      .eq('id', userId)
      .single()
    fcMax = (profileRow?.fc_max as number | null) ?? 190

    // Fetch Strava token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('strava_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', userId)
      .single()

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: 'No Strava connection' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Refresh token if needed
    let accessToken = tokenRow.access_token as string
    const nowSec = Math.floor(Date.now() / 1000)
    if ((tokenRow.expires_at as number) <= nowSec + 300) {
      const refreshRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('STRAVA_CLIENT_ID'),
          client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
          grant_type: 'refresh_token',
          refresh_token: tokenRow.refresh_token,
        }),
      })
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json() as { access_token: string; refresh_token: string; expires_at: number }
        accessToken = refreshData.access_token
        await supabase.from('strava_tokens').update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: refreshData.expires_at,
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId)
      }
    }

    // Fetch trail activities from last PERIOD_DAYS days
    const cutoff = new Date(Date.now() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10)
    const { data: acts } = await supabase
      .from('strava_activities')
      .select('strava_activity_id,type,sport_type,distance')
      .eq('user_id', userId)
      .gte('start_date', cutoff)
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .limit(MAX_ACTIVITIES * 3)  // over-fetch, filter client-side

    const trailActs = (acts ?? []).filter(
      (a) => isTrailActivity(a.type as string, a.sport_type as string | null) && (a.distance as number) >= MIN_DIST_M
    ).slice(0, MAX_ACTIVITIES)

    // Accumulate streams across all trail activities
    const accum: Record<BucketKey, BucketAccum> = {
      climb_easy: emptyAccum(),
      climb_moderate: emptyAccum(),
      climb_steep: emptyAccum(),
      climb_wall: emptyAccum(),
      flat: emptyAccum(),
      descent_easy: emptyAccum(),
      descent_moderate: emptyAccum(),
      descent_steep: emptyAccum(),
    }

    const errors: string[] = []
    let activitiesAnalyzed = 0

    for (const act of trailActs) {
      try {
        const streams = await fetchStreams(accessToken, act.strava_activity_id as string | number)
        if (!streams) {
          errors.push(`Activity ${act.strava_activity_id}: no stream data`)
          continue
        }
        accumulateStreams(streams, accum)
        activitiesAnalyzed++
      } catch (e) {
        errors.push(`Activity ${act.strava_activity_id}: ${(e as Error).message}`)
      }
    }

    // Compute per-bucket stats
    function confidence(timeSec: number): 'high' | 'medium' | 'low' | 'none' {
      if (timeSec >= 1800) return 'high'
      if (timeSec >= 300) return 'medium'
      if (timeSec >= 60) return 'low'
      return 'none'
    }

    const bucketResults: Record<BucketKey, {
      timeSec: number; dplusM: number; vamMH: number | null;
      avgSpeedKmH: number | null; avgHrBpm: number | null; avgHrPctFcMax: number | null;
      confidence: string; status: string;
    }> = {} as never

    for (const b of BUCKETS) {
      const a = accum[b.key]
      const conf = confidence(a.timeSec)
      const hasData = conf !== 'none'

      const vamMH = b.type === 'up' && hasData && a.timeSec > 0
        ? a.dplusM / (a.timeSec / 3600)
        : null

      const avgSpeedMs = hasData && a.speedWeightedN > 0 ? a.speedWeightedSum / a.speedWeightedN : null
      const avgSpeedKmH = avgSpeedMs !== null ? avgSpeedMs * 3.6 : null

      const avgHrBpm = hasData && a.hrWeightedN > 0 ? a.hrWeightedSum / a.hrWeightedN : null
      const avgHrPctFcMax = avgHrBpm !== null ? Math.round((avgHrBpm / fcMax) * 100) : null

      let status: string
      if (!hasData) {
        status = 'unknown'
      } else if (b.type === 'up') {
        status = vamMH === null ? 'unknown' : vamMH >= 900 ? 'strength' : vamMH >= 500 ? 'ok' : 'weak'
      } else if (b.type === 'down') {
        status = avgSpeedKmH === null ? 'unknown' : avgSpeedKmH >= 14 ? 'strength' : avgSpeedKmH >= 9 ? 'ok' : 'weak'
      } else {
        status = 'ok'
      }

      bucketResults[b.key] = {
        timeSec: Math.round(a.timeSec),
        dplusM: Math.round(a.dplusM),
        vamMH: vamMH !== null ? Math.round(vamMH) : null,
        avgSpeedKmH: avgSpeedKmH !== null ? Math.round(avgSpeedKmH * 10) / 10 : null,
        avgHrBpm: avgHrBpm !== null ? Math.round(avgHrBpm) : null,
        avgHrPctFcMax,
        confidence: conf,
        status,
      }
    }

    // gradeBucketMultipliers: ratio avgClimbVam / bucketVam, capped 0.4–2.5
    const climbVams = BUCKETS.filter(b => b.type === 'up')
      .map(b => bucketResults[b.key].vamMH)
      .filter((v): v is number => v !== null)
    const avgClimbVam = climbVams.length > 0 ? climbVams.reduce((s, v) => s + v, 0) / climbVams.length : null

    const gradeBucketMultipliers: Record<BucketKey, number> = {} as never
    for (const b of BUCKETS) {
      if (b.type === 'up' && avgClimbVam !== null) {
        const bvam = bucketResults[b.key].vamMH
        if (bvam !== null && bvam > 0) {
          gradeBucketMultipliers[b.key] = Math.min(2.5, Math.max(0.4, avgClimbVam / bvam))
        } else {
          gradeBucketMultipliers[b.key] = 1
        }
      } else {
        gradeBucketMultipliers[b.key] = 1
      }
    }

    const result = {
      computedAt: new Date().toISOString(),
      periodDays: PERIOD_DAYS,
      activitiesAnalyzed,
      totalActivitiesFound: trailActs.length,
      fcMax,
      buckets: bucketResults,
      gradeBucketMultipliers,
      ...(errors.length > 0 ? { errors } : {}),
    }

    // Store in profiles
    await supabase
      .from('profiles')
      .update({
        runner_profile: result,
        runner_profile_at: result.computedAt,
      })
      .eq('id', userId)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e) {
    const msg = (e as Error).message
    console.error('compute-runner-profile error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
