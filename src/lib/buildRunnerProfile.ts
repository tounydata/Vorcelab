// Builds a RunnerProfileComputed from cached activity streams.
// All stream data comes from the activity_streams DB cache via fetchStreams.
import { supabase } from './supabase'
import { fetchStreams } from './streams'
import {
  getGradeBucket,
  getBucketType,
  computeCardioCost,
  computeEfficiencyScore,
  computeClimbStatus,
  computeDescentStatus,
  computeFlatStatus,
  computeConfidenceFromCount,
  computeDriftStatus,
  computePostClimbRecoveryStatus,
  type BucketKey,
  type BucketStats,
  type RunnerProfileComputed,
} from './runnerProfile'

const RUN_TYPES = new Set(['run', 'trailrun', 'virtualrun', 'hike', 'walk'])

function isRun(a: ProfileActivity) {
  const t = (a.sport_type ?? a.type ?? '').toLowerCase()
  return RUN_TYPES.has(t)
}

interface BucketAccum {
  totalSeconds: number
  weightedSpeedSum: number
  weightedHrSum: number
  hrWeightedSeconds: number
  altGainM: number
  runIds: Set<string>
}

function newAccum(): BucketAccum {
  return { totalSeconds: 0, weightedSpeedSum: 0, weightedHrSum: 0, hrWeightedSeconds: 0, altGainM: 0, runIds: new Set() }
}

export async function buildRunnerProfile(
  activities: ProfileActivity[],
  fcMax: number,
  onProgress?: (pct: number, label: string) => void,
): Promise<RunnerProfileComputed> {
  const runs = activities.filter(isRun)

  const bucketAccum: Partial<Record<BucketKey, BucketAccum>> = {}
  const driftSamples: number[] = []
  const recoveryEvents: Array<{ hrDropBpmPerMin: number; resumeSpeedKmH: number }> = []

  let totalStreamSeconds = 0
  let totalActivitySeconds = 0
  let processedCount = 0
  const analyzedMonthSet = new Set<string>()

  for (let i = 0; i < runs.length; i++) {
    const act = runs[i]
    onProgress?.(Math.round((i / runs.length) * 85), `Analyse ${i + 1}/${runs.length}…`)

    const streams = await fetchStreams(String(act.id))
    if (streams._authError || !streams.time?.data?.length) continue

    const time = streams.time.data
    const altitude = streams.altitude?.data
    const velocity = streams.velocity_smooth?.data
    const heartrate = streams.heartrate?.data
    const distArr = streams.distance?.data

    if (!altitude || !velocity || time.length < 5) continue

    const n = time.length
    const actDur = time[n - 1] - time[0]
    totalStreamSeconds += actDur
    totalActivitySeconds += act.moving_time ?? 0
    processedCount++
    // Track which calendar months are represented
    if (act.start_date) {
      analyzedMonthSet.add(act.start_date.slice(0, 7))
    }

    // ── Per-sample bucket classification ─────────────────────────────────────
    for (let j = 1; j < n; j++) {
      const dt = time[j] - time[j - 1]
      if (dt <= 0 || dt > 60) continue

      const altDelta = altitude[j] - altitude[j - 1]
      const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * dt
      if (distDelta <= 0.5) continue

      const gradePercent = (altDelta / distDelta) * 100
      const bkey = getGradeBucket(gradePercent)
      if (!bkey) continue

      const speedKmH = (velocity[j] ?? 0) * 3.6
      const hrPct = heartrate ? (heartrate[j] / fcMax) * 100 : null

      const acc = (bucketAccum[bkey] ??= newAccum())
      acc.totalSeconds += dt
      acc.weightedSpeedSum += speedKmH * dt
      if (hrPct != null) {
        acc.weightedHrSum += hrPct * dt
        acc.hrWeightedSeconds += dt
      }
      if (altDelta > 0) acc.altGainM += altDelta
      acc.runIds.add(String(act.id))
    }

    // ── Post-climb HR recovery ────────────────────────────────────────────────
    if (heartrate) {
      let climbPhase = false
      let climbEndIdx = -1

      for (let j = 1; j < n; j++) {
        const altDelta = altitude[j] - altitude[j - 1]
        const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * (time[j] - time[j - 1])
        if (distDelta <= 0) continue
        const grade = (altDelta / distDelta) * 100

        if (grade >= 8) {
          climbPhase = true
        } else if (climbPhase && grade < 4) {
          climbEndIdx = j
          climbPhase = false

          // Find HR recovery over next 120 s on flat/descent
          const hrAtEnd = heartrate[climbEndIdx]
          let windowEnd = climbEndIdx
          while (windowEnd < n - 1 && time[windowEnd] - time[climbEndIdx] < 120) windowEnd++
          if (windowEnd === climbEndIdx) continue

          const dtWindow = time[windowEnd] - time[climbEndIdx]
          const hrAtWindowEnd = heartrate[windowEnd]
          if (hrAtEnd <= 0 || dtWindow <= 10) continue

          const hrDrop = hrAtEnd - hrAtWindowEnd
          if (hrDrop > 0) {
            const dropPerMin = (hrDrop / dtWindow) * 60
            const speedsInWindow: number[] = []
            for (let w = climbEndIdx; w <= windowEnd; w++) speedsInWindow.push(velocity[w] * 3.6)
            const resumeSpeedKmH = speedsInWindow.reduce((a, b) => a + b, 0) / speedsInWindow.length
            if (dropPerMin > 0 && dropPerMin < 80) {
              recoveryEvents.push({ hrDropBpmPerMin: dropPerMin, resumeSpeedKmH })
            }
          }
        }
      }
    }

    // ── Cardiac drift (runs > 30 min) ─────────────────────────────────────────
    if (heartrate && actDur >= 1800) {
      const midT = (time[0] + time[n - 1]) / 2
      const hrH1: number[] = [], hrH2: number[] = []
      for (let j = 0; j < n; j++) {
        if (heartrate[j] > 40) {
          if (time[j] <= midT) hrH1.push(heartrate[j])
          else hrH2.push(heartrate[j])
        }
      }
      if (hrH1.length >= 10 && hrH2.length >= 10) {
        const avg1 = hrH1.reduce((a, b) => a + b, 0) / hrH1.length
        const avg2 = hrH2.reduce((a, b) => a + b, 0) / hrH2.length
        const drift = ((avg2 - avg1) / avg1) * 100
        if (drift > -5 && drift < 40) driftSamples.push(drift)
      }
    }
  }

  onProgress?.(90, 'Finalisation…')

  // ── Build bucket stats ────────────────────────────────────────────────────
  const buckets: Partial<Record<BucketKey, BucketStats>> = {}

  for (const [key, acc] of Object.entries(bucketAccum) as [BucketKey, BucketAccum][]) {
    if (acc.totalSeconds < 10) continue
    const btype = getBucketType(key)

    const avgSpeedKmH = acc.weightedSpeedSum / acc.totalSeconds
    const avgHrPctFcMax = acc.hrWeightedSeconds > 0
      ? acc.weightedHrSum / acc.hrWeightedSeconds
      : null
    const vamMH = btype === 'up' && acc.totalSeconds > 0
      ? (acc.altGainM / acc.totalSeconds) * 3600
      : null

    const cardioCost = computeCardioCost(avgHrPctFcMax)
    const efficiencyScore = computeEfficiencyScore(btype, vamMH, avgSpeedKmH, avgHrPctFcMax)
    const minutesAnalyzed = acc.totalSeconds / 60
    const runCount = acc.runIds.size
    const confidence = computeConfidenceFromCount(runCount)

    let statusResult: { status: BucketStats['status']; statusReason: string }
    if (btype === 'up') {
      statusResult = computeClimbStatus(vamMH, cardioCost, minutesAnalyzed)
    } else if (btype === 'down') {
      statusResult = computeDescentStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    } else {
      statusResult = computeFlatStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    }

    buckets[key] = {
      avgSpeedKmH,
      vamMH,
      avgHrPctFcMax,
      totalSeconds: acc.totalSeconds,
      runCount,
      confidence,
      status: statusResult.status,
      efficiencyScore,
      cardioCost,
      statusReason: statusResult.statusReason,
    }
  }

  // ── Cardiac drift ─────────────────────────────────────────────────────────
  const hrDriftPct = driftSamples.length > 0
    ? driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length
    : null
  const hrDriftStatus = computeDriftStatus(hrDriftPct)
  const hrDriftConfidence = computeConfidenceFromCount(driftSamples.length, { high: 8, medium: 3 })

  // ── Post-climb recovery ──────────────────────────────────────────────────
  let postClimbHrRecoveryBpmPerMin: number | null = null
  let postClimbResumeSpeedKmH: number | null = null
  let postClimbHrDropPctFcMax: number | null = null
  if (recoveryEvents.length > 0) {
    postClimbHrRecoveryBpmPerMin =
      recoveryEvents.reduce((s, e) => s + e.hrDropBpmPerMin, 0) / recoveryEvents.length
    postClimbResumeSpeedKmH =
      recoveryEvents.reduce((s, e) => s + e.resumeSpeedKmH, 0) / recoveryEvents.length
    postClimbHrDropPctFcMax = (postClimbHrRecoveryBpmPerMin / fcMax) * 100 * 2
  }
  const postClimbRecoveryConfidence = computeConfidenceFromCount(recoveryEvents.length, { high: 10, medium: 3 })
  const postClimbRecoveryStatus = computePostClimbRecoveryStatus(postClimbHrRecoveryBpmPerMin, postClimbHrDropPctFcMax)

  onProgress?.(100, 'Terminé')

  const analyzedMonths = Array.from(analyzedMonthSet).sort()

  return {
    _computedAt: new Date().toISOString(),
    fcMax,
    totalStreamSeconds,
    streamCoverage: totalActivitySeconds > 0 ? totalStreamSeconds / totalActivitySeconds : 0,
    analyzedMonths,
    analyzedRuns: processedCount,
    buckets,
    postClimbHrRecoveryBpmPerMin,
    postClimbHrDropPctFcMax,
    postClimbResumeSpeedKmH,
    postClimbRecoveryConfidence,
    postClimbRecoveryStatus,
    hrDriftPct,
    hrDriftConfidence,
    hrDriftStatus,
  }
}

export interface ProfileActivity {
  id: number | string
  start_date: string
  moving_time: number
  total_elevation_gain?: number | null
  type?: string | null
  sport_type?: string | null
  average_heartrate?: number | null
}

export async function fetchActivitiesForProfile(userId: string, limit = 50): Promise<ProfileActivity[]> {
  const { data } = await supabase
    .from('strava_activities')
    .select('id,start_date,moving_time,total_elevation_gain,type,sport_type,average_heartrate')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(limit)
  return (data ?? []) as ProfileActivity[]
}

export async function fetchLatestActivityDate(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('strava_activities')
    .select('start_date')
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.start_date ?? null
}

export async function saveRunnerProfile(userId: string, rp: RunnerProfileComputed): Promise<void> {
  await supabase
    .from('profiles')
    .update({ runner_profile: rp as unknown as Record<string, unknown> })
    .eq('id', userId)
}
