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
  type RecoveryBucketStats,
  type PostClimbRecoveryByBucket,
  type PostDownhillRecoveryByBucket,
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

  // Per-bucket recovery accumulators
  type ClimbBucket = 'mild_up' | 'mod_up' | 'steep_up'
  type DescentBucket = 'mild_down' | 'mod_down' | 'steep_down'
  type RecoveryEvent = { hrDropBpmPerMin: number; resumeSpeedKmH: number; avgHrPctFcMaxAfter: number | null }
  const climbRecoveryAccum: Partial<Record<ClimbBucket, RecoveryEvent[]>> = {}
  const descentRecoveryAccum: Partial<Record<DescentBucket, RecoveryEvent[]>> = {}

  let totalStreamSeconds = 0
  let totalActivitySeconds = 0
  let processedCount = 0
  const analyzedMonthSet = new Set<string>()

  for (let i = 0; i < runs.length; i++) {
    const act = runs[i]
    onProgress?.(Math.round((i / runs.length) * 85), `Analyse ${i + 1}/${runs.length}…`)

    const streams = await fetchStreams(String(act.strava_activity_id))
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

    // ── Post-climb & post-descent HR recovery (per-bucket) ───────────────────
    if (heartrate) {
      // ── Post-climb recovery ──────────────────────────────────────────────
      {
        let climbPhase = false
        let climbEndIdx = -1
        let climbGradeSum = 0
        let climbGradeCount = 0

        for (let j = 1; j < n; j++) {
          const altDelta = altitude[j] - altitude[j - 1]
          const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * (time[j] - time[j - 1])
          if (distDelta <= 0) continue
          const grade = (altDelta / distDelta) * 100

          if (grade >= 8) {
            climbPhase = true
            climbGradeSum += grade
            climbGradeCount++
          } else if (climbPhase && grade < 4) {
            climbEndIdx = j
            climbPhase = false

            // Classify the preceding climb
            const avgClimbGrade = climbGradeCount > 0 ? climbGradeSum / climbGradeCount : 8
            const climbBucket: ClimbBucket = avgClimbGrade > 12 ? 'steep_up' : avgClimbGrade > 6 ? 'mod_up' : 'mild_up'

            // Measure recovery in [30s, 180s] window after transition
            const tStart = time[climbEndIdx]
            let w30 = climbEndIdx
            while (w30 < n - 1 && time[w30] - tStart < 30) w30++
            let w180 = climbEndIdx
            while (w180 < n - 1 && time[w180] - tStart < 180) w180++
            if (w180 <= climbEndIdx) { climbGradeSum = 0; climbGradeCount = 0; continue }

            const hrAtTransition = heartrate[climbEndIdx]
            const hrAt180 = heartrate[w180]
            if (hrAtTransition <= 0) { climbGradeSum = 0; climbGradeCount = 0; continue }

            const dtWindow = time[w180] - tStart
            if (dtWindow < 30) { climbGradeSum = 0; climbGradeCount = 0; continue }

            const hrDrop = hrAtTransition - hrAt180
            if (hrDrop > 0) {
              const dropPerMin = (hrDrop / (dtWindow / 60))
              const speedsInWindow: number[] = []
              const hrInWindow: number[] = []
              for (let w = w30; w <= w180; w++) {
                speedsInWindow.push(velocity[w] * 3.6)
                if (heartrate[w] > 40) hrInWindow.push(heartrate[w])
              }
              if (speedsInWindow.length === 0) { climbGradeSum = 0; climbGradeCount = 0; continue }
              const resumeSpeedKmH = speedsInWindow.reduce((a, b) => a + b, 0) / speedsInWindow.length
              const avgHrPctFcMaxAfter = hrInWindow.length > 0
                ? (hrInWindow.reduce((a, b) => a + b, 0) / hrInWindow.length / fcMax) * 100
                : null
              if (dropPerMin > 0 && dropPerMin < 80) {
                const ev: RecoveryEvent = { hrDropBpmPerMin: dropPerMin, resumeSpeedKmH, avgHrPctFcMaxAfter }
                recoveryEvents.push({ hrDropBpmPerMin: dropPerMin, resumeSpeedKmH })
                ;(climbRecoveryAccum[climbBucket] ??= []).push(ev)
              }
            }
            climbGradeSum = 0
            climbGradeCount = 0
          } else if (!climbPhase) {
            climbGradeSum = 0
            climbGradeCount = 0
          }
        }
      }

      // ── Post-descent recovery ────────────────────────────────────────────
      {
        let descentPhase = false
        let descentEndIdx = -1
        let descentGradeSum = 0
        let descentGradeCount = 0

        for (let j = 1; j < n; j++) {
          const altDelta = altitude[j] - altitude[j - 1]
          const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * (time[j] - time[j - 1])
          if (distDelta <= 0) continue
          const grade = (altDelta / distDelta) * 100

          if (grade <= -6) {
            descentPhase = true
            descentGradeSum += grade
            descentGradeCount++
          } else if (descentPhase && grade > -2) {
            descentEndIdx = j
            descentPhase = false

            // Classify the preceding descent
            const avgDescentGrade = descentGradeCount > 0 ? descentGradeSum / descentGradeCount : -6
            const descentBucket: DescentBucket = avgDescentGrade < -12 ? 'steep_down' : avgDescentGrade < -6 ? 'mod_down' : 'mild_down'

            // Measure recovery in [30s, 180s] window
            const tStart = time[descentEndIdx]
            let w30 = descentEndIdx
            while (w30 < n - 1 && time[w30] - tStart < 30) w30++
            let w180 = descentEndIdx
            while (w180 < n - 1 && time[w180] - tStart < 180) w180++
            if (w180 <= descentEndIdx) { descentGradeSum = 0; descentGradeCount = 0; continue }

            const hrAtTransition = heartrate[descentEndIdx]
            const hrAt180 = heartrate[w180]
            if (hrAtTransition <= 0) { descentGradeSum = 0; descentGradeCount = 0; continue }

            const dtWindow = time[w180] - tStart
            if (dtWindow < 30) { descentGradeSum = 0; descentGradeCount = 0; continue }

            const hrDrop = hrAtTransition - hrAt180
            if (hrDrop > 0) {
              const dropPerMin = (hrDrop / (dtWindow / 60))
              const speedsInWindow: number[] = []
              const hrInWindow: number[] = []
              for (let w = w30; w <= w180; w++) {
                speedsInWindow.push(velocity[w] * 3.6)
                if (heartrate[w] > 40) hrInWindow.push(heartrate[w])
              }
              if (speedsInWindow.length === 0) { descentGradeSum = 0; descentGradeCount = 0; continue }
              const resumeSpeedKmH = speedsInWindow.reduce((a, b) => a + b, 0) / speedsInWindow.length
              const avgHrPctFcMaxAfter = hrInWindow.length > 0
                ? (hrInWindow.reduce((a, b) => a + b, 0) / hrInWindow.length / fcMax) * 100
                : null
              if (dropPerMin > 0 && dropPerMin < 80) {
                const ev: RecoveryEvent = { hrDropBpmPerMin: dropPerMin, resumeSpeedKmH, avgHrPctFcMaxAfter }
                ;(descentRecoveryAccum[descentBucket] ??= []).push(ev)
              }
            }
            descentGradeSum = 0
            descentGradeCount = 0
          } else if (!descentPhase) {
            descentGradeSum = 0
            descentGradeCount = 0
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

  // ── Per-bucket recovery ──────────────────────────────────────────────────
  function aggregateRecoveryBucket(events: RecoveryEvent[], normalSpeedKmH?: number | null): RecoveryBucketStats {
    const sampleCount = events.length
    const confidence = computeConfidenceFromCount(sampleCount, { high: 8, medium: 3 })
    if (sampleCount === 0) {
      return { hrDropBpmPerMin: null, resumeSpeedKmH: null, avgHrPctFcMaxAfter: null, speedDropVsNormalPct: null, status: 'unknown', confidence, sampleCount }
    }
    const hrDropBpmPerMin = events.reduce((s, e) => s + e.hrDropBpmPerMin, 0) / sampleCount
    const resumeSpeedKmH = events.reduce((s, e) => s + e.resumeSpeedKmH, 0) / sampleCount
    const hrEvts = events.filter(e => e.avgHrPctFcMaxAfter != null)
    const avgHrPctFcMaxAfter = hrEvts.length > 0 ? hrEvts.reduce((s, e) => s + e.avgHrPctFcMaxAfter!, 0) / hrEvts.length : null
    const speedDropVsNormalPct = normalSpeedKmH && normalSpeedKmH > 0
      ? ((normalSpeedKmH - resumeSpeedKmH) / normalSpeedKmH) * 100
      : null
    let status: RecoveryBucketStats['status']
    if (sampleCount < 2) {
      status = 'unknown'
    } else if (hrDropBpmPerMin >= 15 || (speedDropVsNormalPct != null && speedDropVsNormalPct <= 10)) {
      status = 'good'
    } else if (hrDropBpmPerMin >= 8) {
      status = 'moderate'
    } else if (hrDropBpmPerMin < 8 && (speedDropVsNormalPct == null || speedDropVsNormalPct > 20)) {
      status = 'weak'
    } else {
      status = 'moderate'
    }
    return { hrDropBpmPerMin, resumeSpeedKmH, avgHrPctFcMaxAfter, speedDropVsNormalPct, status, confidence, sampleCount }
  }

  const postClimbRecoveryByBucket: PostClimbRecoveryByBucket = {}
  for (const bk of ['mild_up', 'mod_up', 'steep_up'] as ClimbBucket[]) {
    const events = climbRecoveryAccum[bk]
    if (events && events.length > 0) {
      const normalSpeed = buckets[bk]?.avgSpeedKmH ?? null
      const key = `after_${bk}` as keyof PostClimbRecoveryByBucket
      postClimbRecoveryByBucket[key] = aggregateRecoveryBucket(events, normalSpeed)
    }
  }

  const postDownhillRecoveryByBucket: PostDownhillRecoveryByBucket = {}
  for (const bk of ['mild_down', 'mod_down', 'steep_down'] as DescentBucket[]) {
    const events = descentRecoveryAccum[bk]
    if (events && events.length > 0) {
      const normalSpeed = buckets[bk]?.avgSpeedKmH ?? null
      const key = `after_${bk}` as keyof PostDownhillRecoveryByBucket
      postDownhillRecoveryByBucket[key] = aggregateRecoveryBucket(events, normalSpeed)
    }
  }

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
    postClimbRecoveryByBucket,
    postDownhillRecoveryByBucket,
  }
}

export interface ProfileActivity {
  id: number | string
  strava_activity_id: number | string
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
    .select('id,strava_activity_id,start_date,moving_time,total_elevation_gain,type,sport_type,average_heartrate')
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
