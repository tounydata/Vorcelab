// Builds a RunnerProfileComputed from cached activity streams.
// All stream data comes from the activity_streams DB cache via fetchStreams.
import { supabase } from './supabase'
import { fetchStreams } from './streams'
import { fetchActivityWeather } from './weather'
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
  type DownhillFatigueProfile,
  type ConditionPenalties,
  type ConditionPenalty,
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
  totalDistanceM: number
  sampleCount: number
  cadenceSum: number
  cadenceCount: number
  runIds: Set<string>
}

function newAccum(): BucketAccum {
  return { totalSeconds: 0, weightedSpeedSum: 0, weightedHrSum: 0, hrWeightedSeconds: 0, altGainM: 0, totalDistanceM: 0, sampleCount: 0, cadenceSum: 0, cadenceCount: 0, runIds: new Set() }
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

  // (condition penalties computed after main loop)

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
    const cadenceArr = streams.cadence?.data

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

    // ── Per-sample bucket classification with 60 m sliding-window grade ──────
    // Rationale: point-by-point grade from GPS 1 Hz is extremely noisy.
    // At 10 km/h, distDelta ≈ 2.8 m; a 1 m barometric error gives 36 % grade.
    // Smoothing over 60 m eliminates this noise while preserving real terrain.

    // Build cumulative distance array (use distArr stream if available)
    const cumDistStream: number[] = new Array(n).fill(0)
    if (distArr) {
      for (let j = 0; j < n; j++) cumDistStream[j] = distArr[j]
    } else {
      for (let j = 1; j < n; j++) {
        const dt2 = time[j] - time[j - 1]
        cumDistStream[j] = cumDistStream[j - 1] + Math.max(0, velocity[j] * dt2)
      }
    }

    // Compute smoothed grade[j] = grade over next 60 m from sample j
    const GRADE_WINDOW_M = 60
    const smoothGrade: number[] = new Array(n).fill(NaN)
    for (let j = 0; j < n - 1; j++) {
      let k = j + 1
      while (k < n - 1 && cumDistStream[k] - cumDistStream[j] < GRADE_WINDOW_M) k++
      const dDist = cumDistStream[k] - cumDistStream[j]
      if (dDist >= 10) smoothGrade[j] = ((altitude[k] - altitude[j]) / dDist) * 100
    }

    // Minimum stable run: only count samples that are part of >= 8 consecutive
    // samples with the same bucket classification. Filters micro-transitions and
    // GPS spikes that slip through the 60 m window at very slow speeds.
    const MIN_RUN_SAMPLES = 8
    const rawBucketSample: (BucketKey | null)[] = new Array(n).fill(null)
    for (let j = 0; j < n - 1; j++) {
      if (!isNaN(smoothGrade[j])) rawBucketSample[j] = getGradeBucket(smoothGrade[j])
    }
    const stableBucketSample: (BucketKey | null)[] = new Array(n).fill(null)
    let runS = 0
    for (let j = 1; j <= n; j++) {
      if (j === n || rawBucketSample[j] !== rawBucketSample[j - 1]) {
        if (j - runS >= MIN_RUN_SAMPLES) {
          const bk = rawBucketSample[runS]
          if (bk !== null) for (let k = runS; k < j; k++) stableBucketSample[k] = bk
        }
        runS = j
      }
    }

    for (let j = 1; j < n; j++) {
      const bkey = stableBucketSample[j - 1]
      if (bkey === null) continue  // not in a stable terrain run

      const dt = time[j] - time[j - 1]
      if (dt <= 0 || dt > 60) continue

      const altDelta = altitude[j] - altitude[j - 1]
      const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * dt
      if (distDelta < 2.0) continue  // stronger minimum (was 1.0 m)

      // Skip physically impossible altitude jumps (barometric/GPS spike > 5 m/s vertical)
      if (Math.abs(altDelta) > dt * 5) continue

      const speedKmH = (velocity[j] ?? 0) * 3.6
      const hrPct = heartrate ? (heartrate[j] / fcMax) * 100 : null

      const acc = (bucketAccum[bkey] ??= newAccum())
      acc.totalSeconds += dt
      acc.weightedSpeedSum += speedKmH * dt
      acc.totalDistanceM += distDelta
      acc.sampleCount++
      if (hrPct != null) {
        acc.weightedHrSum += hrPct * dt
        acc.hrWeightedSeconds += dt
      }
      if (cadenceArr && cadenceArr[j] > 0) {
        acc.cadenceSum += cadenceArr[j]
        acc.cadenceCount++
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
        let climbDuration = 0   // accumulated seconds during climb phase
        let climbDplusM = 0     // accumulated D+ during climb phase

        for (let j = 1; j < n; j++) {
          const dt = time[j] - time[j - 1]
          const altDelta = altitude[j] - altitude[j - 1]
          const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * dt
          if (distDelta <= 0) continue
          const grade = (altDelta / distDelta) * 100

          if (grade >= 8) {
            climbPhase = true
            climbGradeSum += grade
            climbGradeCount++
            climbDuration += dt
            if (altDelta > 0) climbDplusM += altDelta
          } else if (climbPhase && grade < 4) {
            climbEndIdx = j
            climbPhase = false

            // Minimum thresholds: skip micro-climbs (noise, short kicks)
            if (climbDuration < 90 || climbDplusM < 20) {
              climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0
              continue
            }

            // Classify the preceding climb
            const avgClimbGrade = climbGradeCount > 0 ? climbGradeSum / climbGradeCount : 8
            const climbBucket: ClimbBucket = avgClimbGrade > 12 ? 'steep_up' : avgClimbGrade > 6 ? 'mod_up' : 'mild_up'

            // Measure recovery in [30s, 180s] window after transition
            const tStart = time[climbEndIdx]
            let w30 = climbEndIdx
            while (w30 < n - 1 && time[w30] - tStart < 30) w30++
            let w180 = climbEndIdx
            while (w180 < n - 1 && time[w180] - tStart < 180) w180++
            if (w180 <= climbEndIdx) { climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0; continue }

            const hrAtTransition = heartrate[climbEndIdx]
            const hrAt180 = heartrate[w180]
            if (hrAtTransition <= 0) { climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0; continue }

            const dtWindow = time[w180] - tStart
            if (dtWindow < 30) { climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0; continue }

            const hrDrop = hrAtTransition - hrAt180
            if (hrDrop > 0) {
              const dropPerMin = (hrDrop / (dtWindow / 60))
              const speedsInWindow: number[] = []
              const hrInWindow: number[] = []
              for (let w = w30; w <= w180; w++) {
                speedsInWindow.push(velocity[w] * 3.6)
                if (heartrate[w] > 40) hrInWindow.push(heartrate[w])
              }
              if (speedsInWindow.length === 0) { climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0; continue }
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
            climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0
          } else if (!climbPhase) {
            climbGradeSum = 0; climbGradeCount = 0; climbDuration = 0; climbDplusM = 0
          }
        }
      }

      // ── Post-descent recovery ────────────────────────────────────────────
      {
        let descentPhase = false
        let descentEndIdx = -1
        let descentGradeSum = 0
        let descentGradeCount = 0
        let descentDuration = 0   // accumulated seconds during descent phase
        let descentDminusM = 0    // accumulated D- during descent phase

        for (let j = 1; j < n; j++) {
          const dt = time[j] - time[j - 1]
          const altDelta = altitude[j] - altitude[j - 1]
          const distDelta = distArr ? distArr[j] - distArr[j - 1] : velocity[j] * dt
          if (distDelta <= 0) continue
          const grade = (altDelta / distDelta) * 100

          if (grade <= -6) {
            descentPhase = true
            descentGradeSum += grade
            descentGradeCount++
            descentDuration += dt
            if (altDelta < 0) descentDminusM += Math.abs(altDelta)
          } else if (descentPhase && grade > -2) {
            descentEndIdx = j
            descentPhase = false

            // Minimum thresholds: skip micro-descents (noise, brief steps)
            if (descentDuration < 90 || descentDminusM < 20) {
              descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0
              continue
            }

            // Classify the preceding descent
            const avgDescentGrade = descentGradeCount > 0 ? descentGradeSum / descentGradeCount : -6
            const descentBucket: DescentBucket = avgDescentGrade < -12 ? 'steep_down' : avgDescentGrade < -6 ? 'mod_down' : 'mild_down'

            // Measure recovery in [30s, 180s] window
            const tStart = time[descentEndIdx]
            let w30 = descentEndIdx
            while (w30 < n - 1 && time[w30] - tStart < 30) w30++
            let w180 = descentEndIdx
            while (w180 < n - 1 && time[w180] - tStart < 180) w180++
            if (w180 <= descentEndIdx) { descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0; continue }

            const hrAtTransition = heartrate[descentEndIdx]
            const hrAt180 = heartrate[w180]
            if (hrAtTransition <= 0) { descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0; continue }

            const dtWindow = time[w180] - tStart
            if (dtWindow < 30) { descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0; continue }

            const hrDrop = hrAtTransition - hrAt180
            if (hrDrop > 0) {
              const dropPerMin = (hrDrop / (dtWindow / 60))
              const speedsInWindow: number[] = []
              const hrInWindow: number[] = []
              for (let w = w30; w <= w180; w++) {
                speedsInWindow.push(velocity[w] * 3.6)
                if (heartrate[w] > 40) hrInWindow.push(heartrate[w])
              }
              if (speedsInWindow.length === 0) { descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0; continue }
              const resumeSpeedKmH = speedsInWindow.reduce((a, b) => a + b, 0) / speedsInWindow.length
              const avgHrPctFcMaxAfter = hrInWindow.length > 0
                ? (hrInWindow.reduce((a, b) => a + b, 0) / hrInWindow.length / fcMax) * 100
                : null
              if (dropPerMin > 0 && dropPerMin < 80) {
                const ev: RecoveryEvent = { hrDropBpmPerMin: dropPerMin, resumeSpeedKmH, avgHrPctFcMaxAfter }
                ;(descentRecoveryAccum[descentBucket] ??= []).push(ev)
              }
            }
            descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0
          } else if (!descentPhase) {
            descentGradeSum = 0; descentGradeCount = 0; descentDuration = 0; descentDminusM = 0
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

  // ── Condition penalties — last 90 days, normalized by D+/km ────────────────
  // Approach: linear regression pace ~ a + b·(D+/km) on neutral runs isolates
  // terrain effect. Each condition's penalty = mean(residual) / neutralMeanPace.
  // Wind uses activity_weather cache (populated by ActivityDetailPage visits).
  // Direction du vent ignorée (trail sinueux — approche isotrope, coeff 0.6).
  const cutoff90 = Date.now() - 90 * 24 * 3600 * 1000

  interface CondEntry { secPerKm: number; dplusPerKm: number }
  const condData: Record<'neutral' | 'heat' | 'cold' | 'night' | 'wind', CondEntry[]> = {
    neutral: [], heat: [], cold: [], night: [], wind: [],
  }

  // Batch-load wind from cache for recent activities
  const recentIds = runs
    .filter(a => new Date(a.start_date).getTime() >= cutoff90 && a.strava_activity_id)
    .map(a => Number(a.strava_activity_id))
  const windByActId: Record<number, number> = {}
  if (recentIds.length > 0) {
    const { data: weatherRows } = await supabase
      .from('activity_weather')
      .select('activity_id,wind')
      .in('activity_id', recentIds)
    for (const row of weatherRows ?? []) {
      if (row.wind != null) windByActId[row.activity_id as number] = row.wind as number
    }
  }

  for (const act of runs) {
    if (!act.average_speed || act.average_speed <= 0 || !act.moving_time) continue
    if (new Date(act.start_date).getTime() < cutoff90) continue
    const distM = act.average_speed * act.moving_time
    if (distM < 3000) continue

    // Filtre d'intensité : on ne compare que des sorties d'endurance (effort comparable).
    // Les efforts intenses (séances, courses) — souvent estivales et rapides — fausseraient
    // la mesure de l'effet condition (ex. « chaleur = plus rapide » alors que c'est l'allure).
    // Seuil à 90% FCmax pour éviter de filtrer trop agressivement les sorties chaudes
    // où la fréquence cardiaque naturelle est élevée même en effort modéré.
    const hrFrac = (typeof act.average_heartrate === 'number' && act.average_heartrate > 0 && fcMax > 0)
      ? act.average_heartrate / fcMax : null
    if (hrFrac != null && hrFrac > 0.90) continue

    const secPerKm = 1000 / act.average_speed
    const dplusPerKm = (act.total_elevation_gain ?? 0) / (distM / 1000)
    const entry: CondEntry = { secPerKm, dplusPerKm }

    const localDate = act.start_date_local ?? act.start_date
    const hour = new Date(localDate).getHours()
    const isNight = hour >= 20 || hour < 5

    const temp = typeof act.average_temp === 'number' ? act.average_temp : null
    const isHeat = temp != null && temp > 22
    const isCold = temp != null && temp < 5

    const windKmh = act.strava_activity_id != null ? (windByActId[Number(act.strava_activity_id)] ?? null) : null
    const isWindy = windKmh != null && windKmh * 0.6 > 15  // isotrope trail

    if (isNight)       condData.night.push(entry)
    else if (isWindy)  condData.wind.push(entry)
    else if (isHeat)   condData.heat.push(entry)
    else if (isCold)   condData.cold.push(entry)
    else               condData.neutral.push(entry)
  }

  // OLS regression on neutral runs: slope = how much D+/km adds to pace
  function linReg(data: CondEntry[]): { a: number; b: number } | null {
    const n = data.length
    if (n < 3) return null
    const meanX = data.reduce((s, d) => s + d.dplusPerKm, 0) / n
    const meanY = data.reduce((s, d) => s + d.secPerKm, 0) / n
    const num = data.reduce((s, d) => s + (d.dplusPerKm - meanX) * (d.secPerKm - meanY), 0)
    const den = data.reduce((s, d) => s + (d.dplusPerKm - meanX) ** 2, 0)
    if (den < 1e-9) return { a: meanY, b: 0 }
    const b = num / den
    return { a: meanY - b * meanX, b }
  }

  const neutralModel = linReg(condData.neutral)
  const neutralMeanPace = condData.neutral.length > 0
    ? condData.neutral.reduce((s, d) => s + d.secPerKm, 0) / condData.neutral.length
    : null

  // Plage de terrain (D+/km) réellement observée en conditions neutres : on ne mesure
  // une condition que sur des sorties au profil comparable (pas d'extrapolation OLS).
  const neutralDplus = condData.neutral.map(d => d.dplusPerKm).sort((a, b) => a - b)
  const dpLo = neutralDplus.length ? neutralDplus[Math.floor(neutralDplus.length * 0.05)] : 0
  const dpHi = neutralDplus.length ? neutralDplus[Math.min(neutralDplus.length - 1, Math.ceil(neutralDplus.length * 0.95))] : Infinity

  // Bornes physiologiques par condition (positif = plus lent). Chaleur / nuit / vent ne
  // peuvent pas rendre plus rapide ; le froid peut légèrement aider. Une valeur brute
  // hors de ces bornes = artefact → on clampe ET on dégrade la confiance.
  const COND_BOUNDS: Record<'heat' | 'cold' | 'night' | 'wind', { lo: number; hi: number }> = {
    heat:  { lo: 0,  hi: 25 },
    cold:  { lo: -5, hi: 15 },
    night: { lo: 0,  hi: 15 },
    wind:  { lo: 0,  hi: 15 },
  }

  function buildCondPenalty(data: CondEntry[], key: 'heat' | 'cold' | 'night' | 'wind'): ConditionPenalty | undefined {
    if (!neutralModel || !neutralMeanPace) return undefined
    // 1) terrain comparable uniquement (pas d'extrapolation)
    const inRange = data.filter(d => d.dplusPerKm >= dpLo && d.dplusPerKm <= dpHi)
    if (inRange.length < 2) return undefined
    // 2) résidus vs modèle terrain neutre
    let resid = inRange.map(d => d.secPerKm - (neutralModel.a + neutralModel.b * d.dplusPerKm))
    // 3) trim : on retire le résidu le plus extrême quand l'échantillon le permet
    if (resid.length >= 4) {
      resid = [...resid].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, resid.length - 1)
    }
    const meanResidual = resid.reduce((s, r) => s + r, 0) / resid.length
    const rawPct = (meanResidual / neutralMeanPace) * 100
    // 4) garde-fous : borne par condition + confiance dégradée si valeur aberrante
    const { lo, hi } = COND_BOUNDS[key]
    const clamped = Math.max(lo, Math.min(hi, rawPct))
    let confidence = computeConfidenceFromCount(inRange.length, { high: 5, medium: 2 })
    if (rawPct < lo || rawPct > hi) confidence = 'low'
    return {
      paceImpactPct: +clamped.toFixed(1),
      sampleCount: inRange.length,
      confidence,
    }
  }

  const conditionPenalties: ConditionPenalties = {}
  const heatP  = buildCondPenalty(condData.heat, 'heat')
  const coldP  = buildCondPenalty(condData.cold, 'cold')
  const nightP = buildCondPenalty(condData.night, 'night')
  const windP  = buildCondPenalty(condData.wind, 'wind')
  if (heatP)  conditionPenalties.heat  = heatP
  if (coldP)  conditionPenalties.cold  = coldP
  if (nightP) conditionPenalties.night = nightP
  if (windP)  conditionPenalties.wind  = windP

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

    const avgCadence = acc.cadenceCount > 0 ? acc.cadenceSum / acc.cadenceCount : null
    const cardioCost = computeCardioCost(avgHrPctFcMax)
    const efficiencyScore = computeEfficiencyScore(btype, vamMH, avgSpeedKmH, avgHrPctFcMax)
    const minutesAnalyzed = acc.totalSeconds / 60
    const runCount = acc.runIds.size
    const confidence = computeConfidenceFromCount(runCount)

    let statusResult: { status: BucketStats['status']; statusReason: string }
    if (btype === 'up') {
      statusResult = computeClimbStatus(vamMH, cardioCost, minutesAnalyzed, avgSpeedKmH, avgCadence)
    } else if (btype === 'down') {
      statusResult = computeDescentStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    } else {
      statusResult = computeFlatStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    }

    const avgGradePct = acc.totalDistanceM > 0 ? (acc.altGainM / acc.totalDistanceM) * 100 : null

    // Debug: verify bucket values in browser console
    console.log(`[VL Profile] bucket=${key}`, {
      totalSeconds: Math.round(acc.totalSeconds),
      totalDistanceM: Math.round(acc.totalDistanceM),
      altGainM: Math.round(acc.altGainM),
      avgGradePct: avgGradePct?.toFixed(1),
      avgSpeedKmH: avgSpeedKmH?.toFixed(1),
      vamMH: vamMH?.toFixed(0),
      avgHrPctFcMax: avgHrPctFcMax?.toFixed(0),
      runCount,
      sampleCount: acc.sampleCount,
      confidence,
    })

    buckets[key] = {
      avgSpeedKmH,
      vamMH,
      avgHrPctFcMax,
      totalSeconds: acc.totalSeconds,
      totalDistanceM: acc.totalDistanceM,
      altGainM: acc.altGainM,
      sampleCount: acc.sampleCount,
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

  // ── Downhill fatigue signal ───────────────────────────────────────────────
  const downhillFatigue: DownhillFatigueProfile = (() => {
    const steepDown = buckets['steep_down']
    const modDown = buckets['mod_down']
    const recSteep = postDownhillRecoveryByBucket['after_steep_down']
    const recMod = postDownhillRecoveryByBucket['after_mod_down']

    const hasDescentData =
      (steepDown && steepDown.confidence !== 'none') ||
      (modDown && modDown.confidence !== 'none')
    if (!hasDescentData) {
      return { status: 'unknown', confidence: 'none', steepDownLateRaceEfficiencyDrop: null, accumulatedDminusImpact: null }
    }

    const totalDescentEvents =
      (descentRecoveryAccum['steep_down']?.length ?? 0) +
      (descentRecoveryAccum['mod_down']?.length ?? 0)
    const confidence = computeConfidenceFromCount(totalDescentEvents, { high: 5, medium: 2 })

    const descentSpeedWeak = (steepDown?.status === 'weak') || (modDown?.status === 'weak')
    const recoveryWeak = (recSteep?.status === 'weak') || (recMod?.status === 'weak')

    const speedDropPct = recSteep?.speedDropVsNormalPct ?? recMod?.speedDropVsNormalPct ?? null

    let status: DownhillFatigueProfile['status']
    if (descentSpeedWeak && recoveryWeak) {
      status = 'high'
    } else if (descentSpeedWeak || recoveryWeak) {
      status = 'moderate'
    } else {
      status = 'low'
    }

    return { status, confidence, steepDownLateRaceEfficiencyDrop: speedDropPct, accumulatedDminusImpact: null }
  })()

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
    downhillFatigue,
    conditionPenalties: Object.keys(conditionPenalties).length > 0 ? conditionPenalties : undefined,
  }
}

export interface ProfileActivity {
  id: number | string
  strava_activity_id: number | string
  start_date: string
  start_date_local?: string | null
  moving_time: number
  total_elevation_gain?: number | null
  type?: string | null
  sport_type?: string | null
  average_heartrate?: number | null
  average_speed?: number | null
  average_temp?: number | null
}

export async function fetchActivitiesForProfile(userId: string, limit = 50): Promise<ProfileActivity[]> {
  const { data } = await supabase
    .from('strava_activities')
    .select('id,strava_activity_id,start_date,start_date_local,moving_time,total_elevation_gain,type,sport_type,average_heartrate,average_speed,average_temp:raw_data->average_temp')
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

// Batch-fetch weather for activities missing from the cache (last 90 days).
// Called before buildRunnerProfile so condition penalties have wind data.
export async function fillMissingWeather(
  userId: string,
  activities: ProfileActivity[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const cutoff90 = Date.now() - 90 * 24 * 3600 * 1000
  const recentActs = activities.filter(a => new Date(a.start_date).getTime() >= cutoff90)
  if (recentActs.length === 0) return

  const actIds = recentActs.map(a => Number(a.strava_activity_id))

  const { data: cached } = await supabase
    .from('activity_weather')
    .select('activity_id')
    .in('activity_id', actIds)

  const cachedSet = new Set((cached ?? []).map(r => r.activity_id as number))
  const missingIds = recentActs
    .filter(a => !cachedSet.has(Number(a.strava_activity_id)))
    .map(a => Number(a.strava_activity_id))

  if (missingIds.length === 0) return

  // Fetch start_latlng from raw_data for missing activities
  const { data: rows } = await supabase
    .from('strava_activities')
    .select('strava_activity_id,start_date,raw_data')
    .in('strava_activity_id', missingIds)
    .eq('user_id', userId)

  type RowInfo = { start_date: string; latlng: [number, number] }
  const rowMap = new Map<number, RowInfo>()
  for (const row of rows ?? []) {
    const raw = row.raw_data as Record<string, unknown> | null
    const ll = raw?.start_latlng as unknown
    if (Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number') {
      rowMap.set(Number(row.strava_activity_id), {
        start_date: row.start_date as string,
        latlng: ll as [number, number],
      })
    }
  }

  const BATCH = 5
  let done = 0
  for (let i = 0; i < missingIds.length; i += BATCH) {
    const batch = missingIds.slice(i, i + BATCH)
    await Promise.all(batch.map(async (actId) => {
      const info = rowMap.get(actId)
      if (!info) { done++; onProgress?.(done, missingIds.length); return }
      const [lat, lon] = info.latlng
      const w = await fetchActivityWeather(lat, lon, info.start_date)
      if (w) {
        await supabase.from('activity_weather').upsert(
          { user_id: userId, activity_id: actId, temp: w.temp, wind: w.wind, precip: w.precip, cached_at: new Date().toISOString() },
          { onConflict: 'user_id,activity_id' }
        )
      }
      done++
      onProgress?.(done, missingIds.length)
    }))
  }
}

export async function saveRunnerProfile(userId: string, rp: RunnerProfileComputed): Promise<void> {
  await supabase
    .from('profiles')
    .update({ runner_profile: rp as unknown as Record<string, unknown> })
    .eq('id', userId)
}
