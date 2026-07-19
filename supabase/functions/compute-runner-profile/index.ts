// compute-runner-profile/index.ts
// Edge function: reads Strava streams for recent run activities,
// computes per-gradient-bucket metrics (VAM, speed, HR%), plus
// post-climb HR recovery and cardiac drift. Stores in profiles.runner_profile.

import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuth, getServiceClient } from '../_shared/auth.ts'
import { getValidStravaAccessToken } from '../_shared/strava.ts'

// ─── Types ────────────────────────────────────────────────────────────────────

type BucketKey =
  | 'steep_up'
  | 'mod_up'
  | 'mild_up'
  | 'flat'
  | 'mild_down'
  | 'mod_down'
  | 'steep_down'

type BucketType = 'up' | 'flat' | 'down'

type CardioCost = 'low' | 'medium' | 'high' | 'unknown'
type BucketStatus = 'strength' | 'ok' | 'weak' | 'unknown'
type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'
type PostClimbRecoveryStatus = 'good' | 'moderate' | 'weak' | 'unknown'
type HrDriftStatus = 'stable' | 'moderate' | 'marked' | 'unknown'
type RelanceStatus = 'strong' | 'normal' | 'limited' | 'unknown'

interface BucketAccum {
  speedSum: number
  eleGainSum: number
  timeSum: number   // seconds
  hrSum: number
  hrCount: number
  runCount: number
}

interface ClimbEvent {
  bucketKey: BucketKey
  startIdx: number
  endIdx: number
}

interface RecoveryEvent {
  hrAtClimbEnd: number
  hrAt60s: number
  hrAt120s: number | null
  speedAt60s: number
  hrDropBpmPerMin: number
  hrDropPctFcMax: number
}

interface DriftEvent {
  driftPct: number
}

interface RelanceEvent {
  bucketKey: BucketKey
  resumeSpeedKmH: number
}

interface Streams {
  time:             { data: number[] }
  altitude?:        { data: number[] }
  velocity_smooth?: { data: number[] }
  heartrate?:       { data: number[] }
  grade_smooth?:    { data: number[] }
  distance?:        { data: number[] }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_BUCKETS: Array<{
  key: BucketKey
  minGrade: number
  maxGrade: number
  type: BucketType
}> = [
  { key: 'steep_up',   minGrade: 12,        maxGrade: Infinity, type: 'up'   },
  { key: 'mod_up',     minGrade: 6,         maxGrade: 12,       type: 'up'   },
  { key: 'mild_up',    minGrade: 2,         maxGrade: 6,        type: 'up'   },
  { key: 'flat',       minGrade: -2,        maxGrade: 2,        type: 'flat' },
  { key: 'mild_down',  minGrade: -6,        maxGrade: -2,       type: 'down' },
  { key: 'mod_down',   minGrade: -12,       maxGrade: -6,       type: 'down' },
  { key: 'steep_down', minGrade: -Infinity, maxGrade: -12,      type: 'down' },
]

const STRAVA_STREAMS_URL = 'https://www.strava.com/api/v3/activities'

// ─── Pure computation helpers ─────────────────────────────────────────────────

function getGradeBucket(grade: number): BucketKey | null {
  for (const b of GRADE_BUCKETS) {
    if (b.type === 'down') {
      // Descent: boundary belongs to the steeper (more negative) bucket — > minGrade && <= maxGrade
      if (grade > b.minGrade && grade <= b.maxGrade) return b.key
    } else {
      // Ascent / flat: boundary belongs to the steeper bucket — >= minGrade && < maxGrade
      if (grade >= b.minGrade && grade < b.maxGrade) return b.key
    }
  }
  return null
}

function getBucketType(key: BucketKey): BucketType {
  return GRADE_BUCKETS.find((b) => b.key === key)?.type ?? 'flat'
}

function computeCardioCost(hrPct: number | null): CardioCost {
  if (hrPct == null) return 'unknown'
  if (hrPct < 70) return 'low'
  if (hrPct < 85) return 'medium'
  return 'high'
}

function computeEfficiencyScore(
  bucketType: BucketType,
  vamMH: number | null,
  speedKmH: number | null,
  hrPct: number | null
): number | null {
  if (hrPct == null || hrPct <= 0) return null
  const frac = hrPct / 100
  if (bucketType === 'up') return vamMH != null ? vamMH / frac : null
  return speedKmH != null ? speedKmH / frac : null
}

function computeClimbStatus(
  vamMH: number | null,
  cardioCost: CardioCost,
  minutesAnalyzed: number
): { status: BucketStatus; statusReason: string } {
  if (vamMH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  if (vamMH >= 900) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return {
        status: 'strength',
        statusReason: `Point fort efficient : VAM ${Math.round(vamMH)}m/h à ${cardioCost === 'low' ? '<70' : '70–84'}% FCmax.`,
      }
    }
    return { status: 'strength', statusReason: `Performance élevée mais coûteuse : FC moyenne élevée pour cette VAM.` }
  }
  if (vamMH >= 600) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'ok', statusReason: 'Bonne efficacité : VAM correcte avec FC contrôlée.' }
    }
    return { status: 'ok', statusReason: `Performance acceptable mais coûteuse : FC élevée pour cette VAM.` }
  }
  if (vamMH >= 500 && cardioCost === 'high') {
    return { status: 'ok', statusReason: `Performance acceptable mais coûteuse : FC élevée pour cette VAM.` }
  }
  if (cardioCost === 'high') {
    return { status: 'weak', statusReason: 'À renforcer : coût cardio élevé pour une VAM faible.' }
  }
  return { status: 'weak', statusReason: 'À renforcer : VAM faible sur ce gradient.' }
}

function computeDescentStatus(
  speedKmH: number | null,
  cardioCost: CardioCost,
  minutesAnalyzed: number
): { status: BucketStatus; statusReason: string } {
  if (speedKmH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  const cautionNote = cardioCost === 'high'
    ? ' FC en descente peut refléter la fatigue des montées précédentes.'
    : ''
  if (speedKmH >= 14) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'strength', statusReason: `Point fort : bonne vitesse en descente avec FC contrôlée.` }
    }
    return { status: 'strength', statusReason: `Bonne vitesse en descente.${cautionNote}` }
  }
  if (speedKmH >= 9) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'ok', statusReason: 'Descente correcte avec FC maîtrisée.' }
    }
    return { status: 'ok', statusReason: `Descente correcte.${cautionNote}` }
  }
  if (cardioCost === 'high') {
    return { status: 'weak', statusReason: `À renforcer : descente lente avec FC élevée.${cautionNote}` }
  }
  return { status: 'weak', statusReason: 'À renforcer : vitesse faible en descente.' }
}

function computeFlatStatus(
  speedKmH: number | null,
  cardioCost: CardioCost,
  minutesAnalyzed: number
): { status: BucketStatus; statusReason: string } {
  if (speedKmH == null) {
    return { status: 'unknown', statusReason: `Peu de données : ${Math.round(minutesAnalyzed)} min analysées.` }
  }
  if (speedKmH >= 12) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'strength', statusReason: `Point fort : bonne vitesse sur plat avec FC contrôlée.` }
    }
    return { status: 'strength', statusReason: 'Performance élevée sur plat mais coûteuse cardio.' }
  }
  if (speedKmH >= 8) {
    if (cardioCost === 'low' || cardioCost === 'medium') {
      return { status: 'ok', statusReason: 'Bonne efficacité sur plat avec FC maîtrisée.' }
    }
    return { status: 'ok', statusReason: 'Performance acceptable sur plat mais coûteuse cardio.' }
  }
  if (cardioCost === 'high') {
    return { status: 'weak', statusReason: 'À renforcer : coût cardio élevé pour une vitesse faible sur plat.' }
  }
  return { status: 'weak', statusReason: 'À renforcer : vitesse faible sur plat.' }
}

function confidenceFromSeconds(totalSec: number, runCount: number): ConfidenceLevel {
  // high: ≥10 min from ≥3 runs; medium: ≥5 min from ≥1 run; low: any data; none: no data
  if (totalSec >= 600 && runCount >= 3) return 'high'
  if (totalSec >= 300 && runCount >= 1) return 'medium'
  if (totalSec > 0) return 'low'
  return 'none'
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function avgOf(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

// ─── Stream fetching ──────────────────────────────────────────────────────────

async function fetchStreams(
  accessToken: string,
  activityId: number | bigint
): Promise<{ streams: Streams | null; rateLimited: boolean }> {
  const keys = 'time,altitude,velocity_smooth,heartrate,grade_smooth,distance,cadence,latlng'
  const res = await fetch(
    `${STRAVA_STREAMS_URL}/${activityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  // 429 = quota Strava dépassé → on arrête d'appeler Strava et on se contente du cache (§4).
  if (res.status === 429) return { streams: null, rateLimited: true }
  if (!res.ok) return { streams: null, rateLimited: false }
  return { streams: (await res.json()) as Streams, rateLimited: false }
}

// ─── Main stream processing ───────────────────────────────────────────────────

interface StreamResult {
  bucketAccums: Map<BucketKey, BucketAccum>
  climbEvents: ClimbEvent[]
  recoveryEvents: RecoveryEvent[]
  relanceEvents: RelanceEvent[]
  driftEvents: DriftEvent[]
  totalStreamSeconds: number
}

function processStreams(
  streams: Streams,
  fcMax: number,
  movingTime: number
): StreamResult {
  const time = streams.time?.data ?? []
  const altitude = streams.altitude?.data
  const velocity = streams.velocity_smooth?.data
  const heartrate = streams.heartrate?.data
  const grade = streams.grade_smooth?.data

  const n = time.length
  if (n < 2) {
    return {
      bucketAccums: new Map(),
      climbEvents: [],
      recoveryEvents: [],
      relanceEvents: [],
      driftEvents: [],
      totalStreamSeconds: 0,
    }
  }

  const bucketAccums = new Map<BucketKey, BucketAccum>()
  for (const b of GRADE_BUCKETS) {
    bucketAccums.set(b.key, { speedSum: 0, eleGainSum: 0, timeSum: 0, hrSum: 0, hrCount: 0, runCount: 0 })
  }

  // ── 1. Main accumulation pass ─────────────────────────────────────────────

  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1]
    if (dt <= 0 || dt > 60) continue // skip gaps > 60s or negative

    const g = grade ? grade[i] : null
    if (g == null) continue

    const bucketKey = getGradeBucket(g)
    if (!bucketKey) continue

    const acc = bucketAccums.get(bucketKey)!
    acc.timeSum += dt

    const v = velocity ? velocity[i] : null
    if (v != null && v >= 0) acc.speedSum += v * dt

    const alt0 = altitude ? altitude[i - 1] : null
    const alt1 = altitude ? altitude[i] : null
    if (alt0 != null && alt1 != null && alt1 > alt0) {
      acc.eleGainSum += alt1 - alt0
    }

    const hr = heartrate ? heartrate[i] : null
    if (hr != null && hr > 0 && fcMax > 0) {
      acc.hrSum += hr * dt   // time-weighted: sum(hr * dt) / sum(dt) = true avg
      acc.hrCount += dt
    }
  }

  // Mark runCount=1 per bucket that has data (will be aggregated per-activity)
  for (const [, acc] of bucketAccums) {
    if (acc.timeSum > 0) acc.runCount = 1
  }

  // ── 2. Significant climb detection (for post-climb recovery + relance) ────

  const climbEvents: ClimbEvent[] = []
  let inClimb = false
  let climbStart = 0
  let climbDPlus = 0

  for (let i = 1; i < n; i++) {
    const dt = time[i] - time[i - 1]
    if (dt <= 0 || dt > 60) continue

    const g = grade ? grade[i] : null
    const hasHr = heartrate ? heartrate[i] != null : false

    if (g != null && g >= 6 && hasHr) {
      if (!inClimb) {
        inClimb = true
        climbStart = i
        climbDPlus = 0
      }
      const alt0 = altitude ? altitude[i - 1] : null
      const alt1 = altitude ? altitude[i] : null
      if (alt0 != null && alt1 != null && alt1 > alt0) climbDPlus += alt1 - alt0
    } else {
      if (inClimb) {
        const climbDuration = time[i - 1] - time[climbStart]
        const bucketKey = getGradeBucket(grade ? grade[Math.floor((climbStart + i) / 2)] ?? 0 : 0)
        if (climbDuration >= 120 && climbDPlus >= 30 && bucketKey) {
          climbEvents.push({ bucketKey, startIdx: climbStart, endIdx: i - 1 })
        }
        inClimb = false
        climbDPlus = 0
      }
    }
  }
  // Close open climb at end
  if (inClimb && n > 1) {
    const climbDuration = time[n - 1] - time[climbStart]
    const bucketKey = getGradeBucket(grade ? grade[Math.floor((climbStart + n) / 2)] ?? 0 : 0)
    if (climbDuration >= 120 && climbDPlus >= 30 && bucketKey) {
      climbEvents.push({ bucketKey, startIdx: climbStart, endIdx: n - 1 })
    }
  }

  // ── 3. Post-climb recovery events ─────────────────────────────────────────

  const recoveryEvents: RecoveryEvent[] = []
  const relanceEvents: RelanceEvent[] = []

  if (heartrate) {
    for (const climb of climbEvents) {
      const endIdx = climb.endIdx
      const endTime = time[endIdx]

      // HR at climb end: avg of last 10s
      const last10sHrs: number[] = []
      for (let i = endIdx; i >= 0; i--) {
        if (endTime - time[i] > 10) break
        const hr = heartrate[i]
        if (hr != null && hr > 0) last10sHrs.push(hr)
      }
      if (last10sHrs.length === 0) continue
      const hrAtClimbEnd = last10sHrs.reduce((s, v) => s + v, 0) / last10sHrs.length

      // Find the start of recovery window (first index after climb end)
      let recStart = endIdx + 1
      if (recStart >= n) continue

      // Check for gap >30s
      if (time[recStart] - endTime > 30) continue

      // Recovery windows: 0–60s and 60–120s
      const first60sHrs: number[] = []
      const first60sSpeeds: number[] = []
      const next60sHrs: number[] = []

      for (let i = recStart; i < n; i++) {
        const elapsed = time[i] - endTime
        if (elapsed > 120) break
        const hr = heartrate[i]
        const v = velocity ? velocity[i] : null
        if (elapsed <= 60) {
          if (hr != null && hr > 0) first60sHrs.push(hr)
          if (v != null && v >= 0) first60sSpeeds.push(v * 3.6) // km/h
        } else {
          if (hr != null && hr > 0) next60sHrs.push(hr)
        }
      }

      if (first60sHrs.length === 0) continue

      const hrAt60s = first60sHrs.reduce((s, v) => s + v, 0) / first60sHrs.length
      const hrAt120s = next60sHrs.length > 0
        ? next60sHrs.reduce((s, v) => s + v, 0) / next60sHrs.length
        : null
      const speedAt60s = first60sSpeeds.length > 0
        ? first60sSpeeds.reduce((s, v) => s + v, 0) / first60sSpeeds.length
        : 0

      const hrDropBpmPerMin = (hrAtClimbEnd - hrAt60s) // per 60s, spec says "per minute"
      const hrDropPctFcMax = fcMax > 0 ? ((hrAtClimbEnd - hrAt60s) / fcMax) * 100 : 0

      recoveryEvents.push({
        hrAtClimbEnd,
        hrAt60s,
        hrAt120s,
        speedAt60s,
        hrDropBpmPerMin,
        hrDropPctFcMax,
      })

      // Relance event: measure flat/descent speed in 60s after climb
      if (first60sSpeeds.length > 0) {
        relanceEvents.push({
          bucketKey: climb.bucketKey,
          resumeSpeedKmH: speedAt60s,
        })
      }
    }
  }

  // ── 4. Cardiac drift (for long activities: movingTime ≥ 2400s) ───────────

  const driftEvents: DriftEvent[] = []

  if (movingTime >= 2400 && heartrate && velocity) {
    const halfTime = time[0] + (time[n - 1] - time[0]) / 2

    // Find midpoint index
    let midIdx = 1
    for (let i = 1; i < n; i++) {
      if (time[i] >= halfTime) { midIdx = i; break }
    }

    // Check for gap >5min in the middle (±5 indices around midpoint)
    const gapStart = Math.max(1, midIdx - 5)
    const gapEnd = Math.min(n - 1, midIdx + 5)
    let hasGap = false
    for (let i = gapStart; i <= gapEnd; i++) {
      if (time[i] - time[i - 1] > 300) { hasGap = true; break }
    }

    if (!hasGap) {
      // Compute time-weighted efficiency for each half
      let speedSumH1 = 0, hrSumH1 = 0, timeSumH1 = 0
      let speedSumH2 = 0, hrSumH2 = 0, timeSumH2 = 0
      let validH1 = 0, validH2 = 0

      for (let i = 1; i < n; i++) {
        const dt = time[i] - time[i - 1]
        if (dt <= 0 || dt > 60) continue
        const v = velocity[i]
        const hr = heartrate[i]
        if (v == null || hr == null || v < 0 || hr <= 0 || fcMax <= 0) continue

        const isH1 = time[i] < halfTime
        if (isH1) {
          speedSumH1 += v * 3.6 * dt
          hrSumH1 += (hr / fcMax) * dt
          timeSumH1 += dt
          validH1++
        } else {
          speedSumH2 += v * 3.6 * dt
          hrSumH2 += (hr / fcMax) * dt
          timeSumH2 += dt
          validH2++
        }
      }

      if (validH1 >= 10 && validH2 >= 10 && timeSumH1 > 0 && timeSumH2 > 0) {
        const avgSpeedH1 = speedSumH1 / timeSumH1
        const avgHrFracH1 = hrSumH1 / timeSumH1
        const avgSpeedH2 = speedSumH2 / timeSumH2
        const avgHrFracH2 = hrSumH2 / timeSumH2

        if (avgHrFracH1 > 0 && avgHrFracH2 > 0) {
          const effH1 = avgSpeedH1 / avgHrFracH1
          const effH2 = avgSpeedH2 / avgHrFracH2
          if (effH1 > 0) {
            const driftPct = ((effH1 - effH2) / effH1) * 100
            driftEvents.push({ driftPct })
          }
        }
      }
    }
  }

  const totalStreamSeconds = Array.from(bucketAccums.values()).reduce((s, a) => s + a.timeSum, 0)

  return { bucketAccums, climbEvents, recoveryEvents, relanceEvents, driftEvents, totalStreamSeconds }
}

// ─── Aggregate results across activities ──────────────────────────────────────

function aggregateBuckets(
  allBucketMaps: Map<BucketKey, BucketAccum>[],
  fcMax: number
) {
  const merged = new Map<BucketKey, BucketAccum>()
  for (const b of GRADE_BUCKETS) {
    merged.set(b.key, { speedSum: 0, eleGainSum: 0, timeSum: 0, hrSum: 0, hrCount: 0, runCount: 0 })
  }

  for (const map of allBucketMaps) {
    for (const [key, acc] of map) {
      const m = merged.get(key)!
      m.speedSum   += acc.speedSum
      m.eleGainSum += acc.eleGainSum
      m.timeSum    += acc.timeSum
      m.hrSum      += acc.hrSum
      m.hrCount    += acc.hrCount
      m.runCount   += acc.runCount
    }
  }

  const result: Record<string, unknown> = {}

  for (const [key, acc] of merged) {
    const btype = getBucketType(key)
    const minutesAnalyzed = acc.timeSum / 60

    const avgSpeedKmH = acc.timeSum > 0 ? (acc.speedSum / acc.timeSum) * 3.6 : null
    const vamMH = (btype === 'up' && acc.timeSum > 0 && acc.eleGainSum > 0)
      ? (acc.eleGainSum / acc.timeSum) * 3600
      : null

    const hrPct = acc.hrCount > 0
      ? (acc.hrSum / acc.hrCount / fcMax) * 100
      : null

    const cardioCost: CardioCost = (() => {
      if (hrPct == null) return 'unknown'
      if (hrPct < 70) return 'low'
      if (hrPct < 85) return 'medium'
      return 'high'
    })()

    const efficiencyScore = (() => {
      if (hrPct == null || hrPct <= 0) return null
      const frac = hrPct / 100
      if (btype === 'up') return vamMH != null ? +(vamMH / frac).toFixed(1) : null
      return avgSpeedKmH != null ? +(avgSpeedKmH / frac).toFixed(2) : null
    })()

    const { status, statusReason } = (() => {
      if (btype === 'up') return computeClimbStatus(vamMH, cardioCost, minutesAnalyzed)
      if (btype === 'down') return computeDescentStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
      return computeFlatStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    })()

    const confidence: ConfidenceLevel = (() => {
      if (acc.timeSum >= 600 && acc.runCount >= 3) return 'high'
      if (acc.timeSum >= 300 && acc.runCount >= 1) return 'medium'
      if (acc.timeSum > 0) return 'low'
      return 'none'
    })()

    result[key] = {
      avgSpeedKmH: avgSpeedKmH != null ? +avgSpeedKmH.toFixed(2) : null,
      vamMH:        vamMH != null ? +vamMH.toFixed(0) : null,
      avgHrPctFcMax: hrPct != null ? +hrPct.toFixed(1) : null,
      totalSeconds: Math.round(acc.timeSum),
      runCount:     acc.runCount,
      confidence,
      status,
      efficiencyScore,
      cardioCost,
      statusReason,
    }
  }

  return result
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req)

  const origin = req.headers.get('origin')
  const cors = getCorsHeaders(origin)

  try {
    const user = await requireAuth(req)
    const supabase = getServiceClient()

    // Load user profile (for fcMax) AND the EXISTING runner_profile. This function
    // still computes only the recent 56-day buckets / recovery / drift (legacy scope);
    // the engine 2026.07-7 additionally reads bestEfforts / criticalSpeed / bestClimb /
    // schemaVersion produced by the shared TS builder. We must therefore NEVER drop those
    // fields when persisting a partial recompute (§3) — see the merge below.
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('fc_max,runner_profile')
      .eq('id', user.id)
      .single()

    const existingProfile =
      ((profileRow as { runner_profile?: Record<string, unknown> } | null)?.runner_profile) ?? null

    const fcMax: number = (profileRow as { fc_max?: number } | null)?.fc_max ?? 190

    // Load recent run activities — fenêtre 56 j (profil détaillé récent : buckets / récup /
    // dérive). §5 : on n'impose PLUS .limit(30) — toutes les sorties de la fenêtre comptent.
    // Le cache-first (cf. plus bas) rend cela bon marché (aucun appel Strava pour les streams
    // déjà en cache). Garde-fou : cap large anti-boucle non bornée.
    const HARD_CAP = 200
    const since56d = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString()
    const { data: activities } = await supabase
      .from('strava_activities')
      .select('strava_activity_id,moving_time,type,sport_type,total_elevation_gain,distance')
      .eq('user_id', user.id)
      .in('sport_type', ['Run', 'TrailRun', 'Trail Run', 'Running'])
      .gte('start_date', since56d)
      .order('start_date', { ascending: false })
      .limit(HARD_CAP)

    if (!activities || activities.length === 0) {
      return new Response(JSON.stringify({ error: 'No run activities found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Get Strava access token
    let accessToken: string
    try {
      accessToken = await getValidStravaAccessToken(supabase, user.id)
    } catch {
      return new Response(JSON.stringify({ error: 'No Strava connection' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // Fetch streams and process each activity
    const allBucketMaps: Map<BucketKey, BucketAccum>[] = []
    const allRecoveryEvents: RecoveryEvent[] = []
    const allRelanceEvents: RelanceEvent[] = []
    const allDriftEvents: DriftEvent[] = []
    let totalActivitySeconds = 0
    let totalStreamSecondsAll = 0

    // ── Cache-first (§4) : on lit d'abord activity_streams (cache Supabase déjà quasi
    // complet), et on n'appelle Strava QUE pour les streams manquants. On met alors en
    // cache le nouveau stream. On respecte le quota : au premier 429, on cesse d'appeler
    // Strava et on se contente du cache. On ne supprime JAMAIS un ancien stream.
    const actList = activities as Array<{
      strava_activity_id: number
      moving_time: number
      type: string
      sport_type: string | null
      total_elevation_gain: number
      distance: number
    }>

    // 1) Charger en un coup tous les streams déjà en cache pour ces activités.
    const wantedIds = actList.map((a) => a.strava_activity_id)
    const cacheById = new Map<number, Streams>()
    if (wantedIds.length > 0) {
      const { data: cachedRows } = await supabase
        .from('activity_streams')
        .select('activity_id,data')
        .eq('user_id', user.id)
        .in('activity_id', wantedIds)
      for (const row of (cachedRows ?? []) as Array<{ activity_id: number; data: Streams }>) {
        if (row.data) cacheById.set(Number(row.activity_id), row.data)
      }
    }

    // 2) Diagnostics de cache (§4).
    const diag = {
      streams_requested: actList.length,
      streams_loaded_from_cache: 0,
      streams_fetched_from_strava: 0,
      streams_missing: 0,
    }
    let stravaRateLimited = false

    for (const act of actList) {
      totalActivitySeconds += act.moving_time ?? 0

      let streams: Streams | null = cacheById.get(Number(act.strava_activity_id)) ?? null
      if (streams) {
        diag.streams_loaded_from_cache++
      } else if (!stravaRateLimited) {
        // Manquant → Strava (une seule fois), puis mise en cache.
        const fetched = await fetchStreams(accessToken, act.strava_activity_id)
        if (fetched.rateLimited) {
          stravaRateLimited = true
          diag.streams_missing++
          continue
        }
        streams = fetched.streams
        if (streams && streams.time?.data?.length) {
          diag.streams_fetched_from_strava++
          supabase
            .from('activity_streams')
            .upsert(
              { user_id: user.id, activity_id: act.strava_activity_id, data: streams as unknown as Record<string, unknown>, cached_at: new Date().toISOString() },
              { onConflict: 'user_id,activity_id' },
            )
            .then(({ error }: { error: { message: string } | null }) => {
              if (error) console.error('stream cache write error:', error.message)
            })
        }
      } else {
        // Quota Strava atteint : on saute les manquants sans appeler Strava.
        diag.streams_missing++
        continue
      }

      if (!streams || !streams.time?.data?.length) { diag.streams_missing++; continue }

      const result = processStreams(streams, fcMax, act.moving_time ?? 0)

      allBucketMaps.push(result.bucketAccums)
      allRecoveryEvents.push(...result.recoveryEvents)
      allRelanceEvents.push(...result.relanceEvents)
      allDriftEvents.push(...result.driftEvents)
      totalStreamSecondsAll += result.totalStreamSeconds
    }

    const streamCacheHitRate = diag.streams_requested > 0
      ? +(diag.streams_loaded_from_cache / diag.streams_requested).toFixed(3)
      : 0

    // ── Aggregate buckets ─────────────────────────────────────────────────────

    const buckets = aggregateBuckets(allBucketMaps, fcMax)

    // ── Relance status per bucket ─────────────────────────────────────────────

    // Group relance events by bucket and compute relance status
    const relanceByBucket = new Map<BucketKey, number[]>()
    for (const ev of allRelanceEvents) {
      const arr = relanceByBucket.get(ev.bucketKey) ?? []
      arr.push(ev.resumeSpeedKmH)
      relanceByBucket.set(ev.bucketKey, arr)
    }

    for (const [bkey, speeds] of relanceByBucket) {
      if (speeds.length < 2) continue
      const bucket = buckets[bkey] as Record<string, unknown>
      if (!bucket) continue

      // Compare to the flat bucket's normal speed
      const flatBucket = buckets['flat'] as { avgSpeedKmH: number | null } | undefined
      const refSpeed = flatBucket?.avgSpeedKmH
      const avgResume = speeds.reduce((s, v) => s + v, 0) / speeds.length

      let relanceStatus: RelanceStatus = 'unknown'
      if (refSpeed != null && refSpeed > 0) {
        const ratio = avgResume / refSpeed
        if (ratio >= 0.9) relanceStatus = 'strong'
        else if (ratio >= 0.7) relanceStatus = 'normal'
        else relanceStatus = 'limited'
      }
      bucket.relanceStatus = relanceStatus
    }

    // ── Post-climb recovery aggregate ─────────────────────────────────────────

    let postClimbHrRecoveryBpmPerMin: number | null = null
    let postClimbHrDropPctFcMax: number | null = null
    let postClimbResumeSpeedKmH: number | null = null
    let postClimbRecoveryConfidence: ConfidenceLevel = 'none'
    let postClimbRecoveryStatus: PostClimbRecoveryStatus = 'unknown'

    if (allRecoveryEvents.length > 0) {
      const drops = allRecoveryEvents.map((e) => e.hrDropBpmPerMin)
      const pcts = allRecoveryEvents.map((e) => e.hrDropPctFcMax)
      const resumeSpeeds = allRecoveryEvents.map((e) => e.speedAt60s)

      postClimbHrRecoveryBpmPerMin = medianOf(drops)
      postClimbHrDropPctFcMax = medianOf(pcts)
      postClimbResumeSpeedKmH = medianOf(resumeSpeeds)

      const n = allRecoveryEvents.length
      postClimbRecoveryConfidence = n >= 5 ? 'high' : n >= 2 ? 'medium' : 'low'

      const bpm = postClimbHrRecoveryBpmPerMin ?? 0
      const pct = postClimbHrDropPctFcMax ?? 0
      if (bpm >= 20 || pct >= 10) postClimbRecoveryStatus = 'good'
      else if ((bpm >= 10 && bpm < 20) || (pct >= 5 && pct < 10)) postClimbRecoveryStatus = 'moderate'
      else postClimbRecoveryStatus = 'weak'
    }

    // ── Cardiac drift aggregate ───────────────────────────────────────────────

    let hrDriftPct: number | null = null
    let hrDriftConfidence: ConfidenceLevel = 'none'
    let hrDriftStatus: HrDriftStatus = 'unknown'

    if (allDriftEvents.length > 0) {
      hrDriftPct = medianOf(allDriftEvents.map((e) => e.driftPct))
      const nd = allDriftEvents.length
      hrDriftConfidence = nd >= 5 ? 'high' : nd >= 2 ? 'medium' : 'low'

      const dp = hrDriftPct ?? 0
      if (dp <= 5) hrDriftStatus = 'stable'
      else if (dp <= 10) hrDriftStatus = 'moderate'
      else hrDriftStatus = 'marked'
    }

    // ── Stream coverage ───────────────────────────────────────────────────────

    const streamCoverage = totalActivitySeconds > 0
      ? Math.min(1, totalStreamSecondsAll / totalActivitySeconds)
      : 0

    // ── Build final profile ───────────────────────────────────────────────────

    const computedAt = new Date().toISOString()
    const computedFields = {
      computedAt,
      periodDays: 56,
      activitiesAnalyzed: activities.length,
      fcMax,
      totalStreamSeconds: Math.round(totalStreamSecondsAll),
      streamCoverage: +streamCoverage.toFixed(3),
      buckets,
      postClimbHrRecoveryBpmPerMin: postClimbHrRecoveryBpmPerMin != null ? +postClimbHrRecoveryBpmPerMin.toFixed(1) : null,
      postClimbHrDropPctFcMax: postClimbHrDropPctFcMax != null ? +postClimbHrDropPctFcMax.toFixed(1) : null,
      postClimbResumeSpeedKmH: postClimbResumeSpeedKmH != null ? +postClimbResumeSpeedKmH.toFixed(2) : null,
      postClimbRecoveryConfidence,
      postClimbRecoveryStatus,
      hrDriftPct: hrDriftPct != null ? +hrDriftPct.toFixed(1) : null,
      hrDriftConfidence,
      hrDriftStatus,
      // Diagnostics de cache (§4) — provenance des streams de ce recalcul.
      streamDiagnostics: {
        streams_requested: diag.streams_requested,
        streams_loaded_from_cache: diag.streams_loaded_from_cache,
        streams_fetched_from_strava: diag.streams_fetched_from_strava,
        streams_missing: diag.streams_missing,
        stream_cache_hit_rate: streamCacheHitRate,
        strava_rate_limited: stravaRateLimited,
      },
    }

    // ── Non-destructive persistence (§3) ──────────────────────────────────────
    // This legacy function does NOT (yet) produce the engine-critical fields
    // (bestEfforts / criticalSpeed / bestClimb) nor the schema header. Overwriting the
    // whole profile would silently strip those fields and break durability/diagnostics
    // for anyone whose profile was previously built by the shared TS builder. We MERGE:
    // freshly recomputed recent fields win; every other field the existing profile
    // carried (records, schema header, …) is preserved untouched.
    const PRESERVE_KEYS = [
      'schemaVersion', 'asOfAt', 'historyDays', 'detailedProfileDays',
      'bestEfforts', 'criticalSpeed', 'bestClimb',
      'postClimbRecoveryByBucket', 'postDownhillRecoveryByBucket',
      'downhillFatigue', 'conditionPenalties', 'technicalDescent', 'analyzedMonths',
    ]
    const preserved: Record<string, unknown> = {}
    if (existingProfile) {
      for (const k of PRESERVE_KEYS) {
        if (k in existingProfile) preserved[k] = existingProfile[k]
      }
    }
    const runnerProfile: Record<string, unknown> = { ...preserved, ...computedFields }

    // Persist to profiles table. NOTE: runner_profile_at reflects this partial recompute;
    // the shared TS builder is still authoritative for the engine-critical fields.
    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        runner_profile: runnerProfile,
        runner_profile_at: computedAt,
        updated_at: computedAt,
      })

    return new Response(
      JSON.stringify({
        ok: true,
        profile: runnerProfile,
        preserved_fields: Object.keys(preserved),
        stream_diagnostics: runnerProfile.streamDiagnostics,
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const status = msg === 'Unauthorized' ? 401 : 500
    if (status === 500) console.error('compute-runner-profile error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
