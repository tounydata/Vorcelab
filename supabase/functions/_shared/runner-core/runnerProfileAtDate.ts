// Profil coureur « d'époque » — reconstruit tel qu'il aurait existé AVANT une course,
// SANS AUCUNE FUITE TEMPORELLE. Logique PURE (aucune IO, aucune dépendance Supabase),
// testable sous Vitest et déterministe.
//
// Règle anti-fuite absolue : on n'utilise QUE les activités dont `start_date < asOfDate`
// (STRICTEMENT — jamais `<=`), et dans une fenêtre glissante de `windowDays`. La course
// testée (dont le départ = asOfDate) et toute activité postérieure sont donc exclues.
//
// Le cœur de calcul (buckets par pente, VAM, coût cardio, dérive, récupération
// post-montée/descente, descente technique, couverture des streams) reproduit fidèlement
// la logique de `src/lib/buildRunnerProfile.ts` et de l'Edge Function
// `supabase/functions/compute-runner-profile/index.ts`. Contrairement à elles, il opère
// sur des streams DÉJÀ EN MÉMOIRE (fournis par l'appelant) au lieu de les chercher en
// base — d'où sa pureté. Les pénalités « conditions » (météo) ne sont pas recalculées
// ici : `computeRaceProjection` ne les consomme pas (voir docs/engine-validation.md).

import { sectionTurnDegPerKm } from './gpxCore.ts'
import {
  getBucketType,
  computeCardioCost,
  computeEfficiencyScore,
  computeClimbStatus,
  computeDescentStatus,
  computeFlatStatus,
  computeConfidenceFromCount,
  computeDriftStatus,
  computePostClimbRecoveryStatus,
  getGradeBucket,
  type BucketKey,
  type BucketStats,
  type RunnerProfileComputed,
  type RecoveryBucketStats,
  type PostClimbRecoveryByBucket,
  type PostDownhillRecoveryByBucket,
  type DownhillFatigueProfile,
  type TechnicalDescentProfile,
  type TechDescentFactor,
} from './runnerProfile.ts'

const RUN_TYPES = new Set(['run', 'trailrun', 'virtualrun', 'hike', 'walk'])

export interface ProfileActivityAtDate {
  id?: string | number
  strava_activity_id: string | number
  start_date: string
  moving_time?: number | null
  total_elevation_gain?: number | null
  type?: string | null
  sport_type?: string | null
  average_heartrate?: number | null
  average_speed?: number | null
}

/** Un stream (forme `{ data }` ou tableau direct). */
type RawStream = { data?: unknown } | unknown[] | null | undefined
export interface RawStreamSet {
  time?: RawStream
  altitude?: RawStream
  velocity_smooth?: RawStream
  heartrate?: RawStream
  distance?: RawStream
  cadence?: RawStream
  latlng?: RawStream
  [k: string]: RawStream
}

export interface BuildProfileAtDateInput {
  activities: ProfileActivityAtDate[]
  /** Streams par identifiant d'activité Strava (clé = String(strava_activity_id)). */
  activityStreams: Record<string, RawStreamSet>
  fcMax: number
  /** Départ de la course : borne stricte supérieure (exclusive). */
  asOfDate: string
  /** Fenêtre glissante (jours) précédant `asOfDate`. Défaut : 56 (comme l'Edge Function). */
  windowDays?: number
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
function numArray(s: RawStream): number[] {
  const arr = Array.isArray(s) ? s : s && typeof s === 'object' && Array.isArray((s as { data?: unknown }).data) ? (s as { data: unknown[] }).data : []
  return arr.map((v) => num(v) ?? NaN)
}
function pairArray(s: RawStream): [number, number][] {
  const arr = Array.isArray(s) ? s : s && typeof s === 'object' && Array.isArray((s as { data?: unknown }).data) ? (s as { data: unknown[] }).data : []
  const out: [number, number][] = []
  for (const v of arr) {
    if (Array.isArray(v) && v.length >= 2) { const a = num(v[0]); const b = num(v[1]); out.push([a ?? NaN, b ?? NaN]) }
    else out.push([NaN, NaN])
  }
  return out
}

function isRun(a: ProfileActivityAtDate): boolean {
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

type ClimbBucket = 'mild_up' | 'mod_up' | 'steep_up'
type DescentBucket = 'mild_down' | 'mod_down' | 'steep_down'
type RecoveryEvent = { hrDropBpmPerMin: number; resumeSpeedKmH: number; avgHrPctFcMaxAfter: number | null }

/**
 * Sélectionne les activités STRICTEMENT antérieures à `asOfDate` (anti-fuite),
 * dans la fenêtre `windowDays`. Aucune activité au départ (même seconde) ni
 * postérieure ne peut passer.
 */
export function activitiesInWindowBefore(
  activities: ProfileActivityAtDate[],
  asOfDate: string,
  windowDays: number,
): ProfileActivityAtDate[] {
  const asOf = Date.parse(asOfDate)
  if (Number.isNaN(asOf)) return []
  const lo = asOf - windowDays * 86_400_000
  return activities.filter((a) => {
    const d = Date.parse(a.start_date)
    return !Number.isNaN(d) && d < asOf && d >= lo
  })
}

/**
 * Construit le profil coureur « à la date » à partir de streams en mémoire.
 * Anti-fuite garanti par `activitiesInWindowBefore`. Retourne un `RunnerProfileComputed`
 * directement consommable par `computeRaceProjection` (via `profile.runner_profile`).
 */
export function buildRunnerProfileAtDate(input: BuildProfileAtDateInput): RunnerProfileComputed {
  const { activityStreams, fcMax, asOfDate } = input
  const windowDays = input.windowDays ?? 56
  const runs = activitiesInWindowBefore(input.activities, asOfDate, windowDays).filter(isRun)

  const bucketAccum: Partial<Record<BucketKey, BucketAccum>> = {}
  const driftSamples: number[] = []
  const recoveryEvents: Array<{ hrDropBpmPerMin: number; resumeSpeedKmH: number }> = []
  const climbRecoveryAccum: Partial<Record<ClimbBucket, RecoveryEvent[]>> = {}
  const descentRecoveryAccum: Partial<Record<DescentBucket, RecoveryEvent[]>> = {}
  const descentTechAccum: Record<DescentBucket, { sin: number; speed: number; dist: number }[]> = { mild_down: [], mod_down: [], steep_down: [] }

  let totalStreamSeconds = 0
  let totalActivitySeconds = 0
  let processedCount = 0
  const analyzedMonthSet = new Set<string>()

  for (const act of runs) {
    const raw = activityStreams[String(act.strava_activity_id)]
    if (!raw) continue
    const time = numArray(raw.time)
    if (time.length < 5) continue
    const altitude = numArray(raw.altitude)
    const velocity = numArray(raw.velocity_smooth)
    const heartrate = raw.heartrate != null ? numArray(raw.heartrate) : undefined
    const distArr = raw.distance != null ? numArray(raw.distance) : undefined
    const cadenceArr = raw.cadence != null ? numArray(raw.cadence) : undefined
    const latlng = raw.latlng != null ? pairArray(raw.latlng) : undefined

    if (altitude.length === 0 || velocity.length === 0) continue

    const n = time.length
    const actDur = time[n - 1] - time[0]
    if (!Number.isFinite(actDur) || actDur <= 0) continue
    totalStreamSeconds += actDur
    totalActivitySeconds += act.moving_time ?? 0
    processedCount++
    if (act.start_date) analyzedMonthSet.add(act.start_date.slice(0, 7))

    // Distance cumulée (stream distance si dispo, sinon intégration vitesse).
    const cumDistStream: number[] = new Array(n).fill(0)
    if (distArr && distArr.length >= n) {
      for (let j = 0; j < n; j++) cumDistStream[j] = distArr[j]
    } else {
      for (let j = 1; j < n; j++) {
        const dt2 = time[j] - time[j - 1]
        cumDistStream[j] = cumDistStream[j - 1] + Math.max(0, (velocity[j] || 0) * dt2)
      }
    }

    // Pente lissée sur 60 m (anti-bruit GPS/baro).
    const GRADE_WINDOW_M = 60
    const smoothGrade: number[] = new Array(n).fill(NaN)
    for (let j = 0; j < n - 1; j++) {
      let k = j + 1
      while (k < n - 1 && cumDistStream[k] - cumDistStream[j] < GRADE_WINDOW_M) k++
      const dDist = cumDistStream[k] - cumDistStream[j]
      if (dDist >= 10) smoothGrade[j] = ((altitude[k] - altitude[j]) / dDist) * 100
    }

    // Runs stables : ≥ 8 échantillons consécutifs de même classe de pente.
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
      if (bkey === null) continue
      const dt = time[j] - time[j - 1]
      if (dt <= 0 || dt > 60) continue
      const altDelta = altitude[j] - altitude[j - 1]
      const distDelta = distArr ? distArr[j] - distArr[j - 1] : (velocity[j] || 0) * dt
      if (!(distDelta >= 2.0)) continue
      if (Math.abs(altDelta) > dt * 5) continue
      const speedKmH = (velocity[j] ?? 0) * 3.6
      const hrPct = heartrate && Number.isFinite(heartrate[j]) ? (heartrate[j] / fcMax) * 100 : null
      const acc = (bucketAccum[bkey] ??= newAccum())
      acc.totalSeconds += dt
      acc.weightedSpeedSum += speedKmH * dt
      acc.totalDistanceM += distDelta
      acc.sampleCount++
      if (hrPct != null) { acc.weightedHrSum += hrPct * dt; acc.hrWeightedSeconds += dt }
      if (cadenceArr && cadenceArr[j] > 0) { acc.cadenceSum += cadenceArr[j]; acc.cadenceCount++ }
      if (altDelta > 0) acc.altGainM += altDelta
      acc.runIds.add(String(act.id ?? act.strava_activity_id))
    }

    // Descentes : sinuosité + vitesse (apprentissage facteur technique).
    if (latlng && latlng.length === n) {
      const streamPts = latlng.map(([lat, lon]) => ({ lat, lon }))
      let r0 = 0
      for (let j = 1; j <= n; j++) {
        if (j === n || stableBucketSample[j] !== stableBucketSample[r0]) {
          const bk = stableBucketSample[r0]
          if (bk === 'mild_down' || bk === 'mod_down' || bk === 'steep_down') {
            const dist = cumDistStream[j - 1] - cumDistStream[r0]
            const dur = time[j - 1] - time[r0]
            if (dist >= 150 && dur > 5) {
              const sin = sectionTurnDegPerKm(streamPts, cumDistStream, cumDistStream[r0] / 1000, cumDistStream[j - 1] / 1000)
              descentTechAccum[bk].push({ sin, speed: dist / dur, dist })
            }
          }
          r0 = j
        }
      }
    }

    if (heartrate) {
      processRecovery(n, time, altitude, velocity, heartrate, distArr, fcMax, 'climb', climbRecoveryAccum, recoveryEvents)
      processRecovery(n, time, altitude, velocity, heartrate, distArr, fcMax, 'descent', descentRecoveryAccum, recoveryEvents)
    }

    // Dérive cardiaque (runs > 30 min).
    if (heartrate && actDur >= 1800) {
      const midT = (time[0] + time[n - 1]) / 2
      const hrH1: number[] = [], hrH2: number[] = []
      for (let j = 0; j < n; j++) {
        if (heartrate[j] > 40) { if (time[j] <= midT) hrH1.push(heartrate[j]); else hrH2.push(heartrate[j]) }
      }
      if (hrH1.length >= 10 && hrH2.length >= 10) {
        const avg1 = hrH1.reduce((a, b) => a + b, 0) / hrH1.length
        const avg2 = hrH2.reduce((a, b) => a + b, 0) / hrH2.length
        const drift = ((avg2 - avg1) / avg1) * 100
        if (drift > -5 && drift < 40) driftSamples.push(drift)
      }
    }
  }

  // ── Facteur descente technique (lacets) ────────────────────────────────────
  const SIN_STRAIGHT = 120, SIN_TWISTY = 250
  function deriveTechFactor(rs: { sin: number; speed: number; dist: number }[]): TechDescentFactor | undefined {
    const straight = rs.filter((r) => r.sin < SIN_STRAIGHT)
    const twisty = rs.filter((r) => r.sin >= SIN_TWISTY)
    if (straight.length < 2 || twisty.length < 2) return undefined
    const wMean = (a: typeof rs) => a.reduce((s, r) => s + r.speed * r.dist, 0) / a.reduce((s, r) => s + r.dist, 0)
    const vStraight = wMean(straight), vTwisty = wMean(twisty)
    if (!(vStraight > 0) || !(vTwisty > 0)) return undefined
    return {
      factor: +Math.max(1, Math.min(1.5, vStraight / vTwisty)).toFixed(3),
      confidence: computeConfidenceFromCount(twisty.length, { high: 4, medium: 2 }),
      sampleCount: twisty.length,
    }
  }
  const techDescent: TechnicalDescentProfile = { byBucket: {} }
  for (const bk of ['mild_down', 'mod_down', 'steep_down'] as const) {
    const f = deriveTechFactor(descentTechAccum[bk])
    if (f) techDescent.byBucket[bk] = f
  }
  const globalTech = deriveTechFactor([...descentTechAccum.mild_down, ...descentTechAccum.mod_down, ...descentTechAccum.steep_down])
  if (globalTech) techDescent.global = globalTech
  const hasTech = globalTech != null || Object.keys(techDescent.byBucket).length > 0

  // ── Buckets ────────────────────────────────────────────────────────────────
  const buckets: Partial<Record<BucketKey, BucketStats>> = {}
  for (const [key, acc] of Object.entries(bucketAccum) as [BucketKey, BucketAccum][]) {
    if (acc.totalSeconds < 10) continue
    const btype = getBucketType(key)
    const avgSpeedKmH = acc.weightedSpeedSum / acc.totalSeconds
    const avgHrPctFcMax = acc.hrWeightedSeconds > 0 ? acc.weightedHrSum / acc.hrWeightedSeconds : null
    const vamMH = btype === 'up' && acc.totalSeconds > 0 ? (acc.altGainM / acc.totalSeconds) * 3600 : null
    const avgCadence = acc.cadenceCount > 0 ? acc.cadenceSum / acc.cadenceCount : null
    const cardioCost = computeCardioCost(avgHrPctFcMax)
    const efficiencyScore = computeEfficiencyScore(btype, vamMH, avgSpeedKmH, avgHrPctFcMax)
    const minutesAnalyzed = acc.totalSeconds / 60
    const runCount = acc.runIds.size
    const confidence = computeConfidenceFromCount(runCount)
    let statusResult: { status: BucketStats['status']; statusReason: string }
    if (btype === 'up') statusResult = computeClimbStatus(vamMH, cardioCost, minutesAnalyzed, avgSpeedKmH, avgCadence)
    else if (btype === 'down') statusResult = computeDescentStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    else statusResult = computeFlatStatus(avgSpeedKmH, cardioCost, minutesAnalyzed)
    buckets[key] = {
      avgSpeedKmH, vamMH, avgHrPctFcMax,
      totalSeconds: acc.totalSeconds, totalDistanceM: acc.totalDistanceM, altGainM: acc.altGainM,
      sampleCount: acc.sampleCount, runCount, confidence, status: statusResult.status,
      efficiencyScore, cardioCost, statusReason: statusResult.statusReason,
    }
  }

  // ── Dérive cardiaque agrégée ───────────────────────────────────────────────
  const hrDriftPct = driftSamples.length > 0 ? driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length : null
  const hrDriftStatus = computeDriftStatus(hrDriftPct)
  const hrDriftConfidence = computeConfidenceFromCount(driftSamples.length, { high: 8, medium: 3 })

  // ── Récupération post-montée globale ───────────────────────────────────────
  let postClimbHrRecoveryBpmPerMin: number | null = null
  let postClimbResumeSpeedKmH: number | null = null
  let postClimbHrDropPctFcMax: number | null = null
  if (recoveryEvents.length > 0) {
    postClimbHrRecoveryBpmPerMin = recoveryEvents.reduce((s, e) => s + e.hrDropBpmPerMin, 0) / recoveryEvents.length
    postClimbResumeSpeedKmH = recoveryEvents.reduce((s, e) => s + e.resumeSpeedKmH, 0) / recoveryEvents.length
    postClimbHrDropPctFcMax = (postClimbHrRecoveryBpmPerMin / fcMax) * 100 * 2
  }
  const postClimbRecoveryConfidence = computeConfidenceFromCount(recoveryEvents.length, { high: 10, medium: 3 })
  const postClimbRecoveryStatus = computePostClimbRecoveryStatus(postClimbHrRecoveryBpmPerMin, postClimbHrDropPctFcMax)

  // ── Récupération par bucket ────────────────────────────────────────────────
  function aggregateRecoveryBucket(events: RecoveryEvent[], normalSpeedKmH?: number | null): RecoveryBucketStats {
    const sampleCount = events.length
    const confidence = computeConfidenceFromCount(sampleCount, { high: 8, medium: 3 })
    if (sampleCount === 0) return { hrDropBpmPerMin: null, resumeSpeedKmH: null, avgHrPctFcMaxAfter: null, speedDropVsNormalPct: null, status: 'unknown', confidence, sampleCount }
    const hrDropBpmPerMin = events.reduce((s, e) => s + e.hrDropBpmPerMin, 0) / sampleCount
    const resumeSpeedKmH = events.reduce((s, e) => s + e.resumeSpeedKmH, 0) / sampleCount
    const hrEvts = events.filter((e) => e.avgHrPctFcMaxAfter != null)
    const avgHrPctFcMaxAfter = hrEvts.length > 0 ? hrEvts.reduce((s, e) => s + e.avgHrPctFcMaxAfter!, 0) / hrEvts.length : null
    const speedDropVsNormalPct = normalSpeedKmH && normalSpeedKmH > 0 ? ((normalSpeedKmH - resumeSpeedKmH) / normalSpeedKmH) * 100 : null
    let status: RecoveryBucketStats['status']
    if (sampleCount < 2) status = 'unknown'
    else if (hrDropBpmPerMin >= 15 || (speedDropVsNormalPct != null && speedDropVsNormalPct <= 10)) status = 'good'
    else if (hrDropBpmPerMin >= 8) status = 'moderate'
    else if (hrDropBpmPerMin < 8 && (speedDropVsNormalPct == null || speedDropVsNormalPct > 20)) status = 'weak'
    else status = 'moderate'
    return { hrDropBpmPerMin, resumeSpeedKmH, avgHrPctFcMaxAfter, speedDropVsNormalPct, status, confidence, sampleCount }
  }
  const postClimbRecoveryByBucket: PostClimbRecoveryByBucket = {}
  for (const bk of ['mild_up', 'mod_up', 'steep_up'] as ClimbBucket[]) {
    const events = climbRecoveryAccum[bk]
    if (events && events.length > 0) postClimbRecoveryByBucket[`after_${bk}` as keyof PostClimbRecoveryByBucket] = aggregateRecoveryBucket(events, buckets[bk]?.avgSpeedKmH ?? null)
  }
  const postDownhillRecoveryByBucket: PostDownhillRecoveryByBucket = {}
  for (const bk of ['mild_down', 'mod_down', 'steep_down'] as DescentBucket[]) {
    const events = descentRecoveryAccum[bk]
    if (events && events.length > 0) postDownhillRecoveryByBucket[`after_${bk}` as keyof PostDownhillRecoveryByBucket] = aggregateRecoveryBucket(events, buckets[bk]?.avgSpeedKmH ?? null)
  }

  // ── Fatigue en descente ────────────────────────────────────────────────────
  const downhillFatigue: DownhillFatigueProfile = (() => {
    const steepDown = buckets['steep_down'], modDown = buckets['mod_down']
    const recSteep = postDownhillRecoveryByBucket['after_steep_down'], recMod = postDownhillRecoveryByBucket['after_mod_down']
    const hasDescentData = (steepDown && steepDown.confidence !== 'none') || (modDown && modDown.confidence !== 'none')
    if (!hasDescentData) return { status: 'unknown', confidence: 'none', steepDownLateRaceEfficiencyDrop: null, accumulatedDminusImpact: null }
    const totalDescentEvents = (descentRecoveryAccum['steep_down']?.length ?? 0) + (descentRecoveryAccum['mod_down']?.length ?? 0)
    const confidence = computeConfidenceFromCount(totalDescentEvents, { high: 5, medium: 2 })
    const descentSpeedWeak = steepDown?.status === 'weak' || modDown?.status === 'weak'
    const recoveryWeak = recSteep?.status === 'weak' || recMod?.status === 'weak'
    const speedDropPct = recSteep?.speedDropVsNormalPct ?? recMod?.speedDropVsNormalPct ?? null
    let status: DownhillFatigueProfile['status']
    if (descentSpeedWeak && recoveryWeak) status = 'high'
    else if (descentSpeedWeak || recoveryWeak) status = 'moderate'
    else status = 'low'
    return { status, confidence, steepDownLateRaceEfficiencyDrop: speedDropPct, accumulatedDminusImpact: null }
  })()

  const analyzedMonths = Array.from(analyzedMonthSet).sort()

  return {
    _computedAt: new Date(asOfDate).toISOString(),
    fcMax,
    totalStreamSeconds,
    streamCoverage: totalActivitySeconds > 0 ? Math.min(1, totalStreamSeconds / totalActivitySeconds) : 0,
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
    conditionPenalties: undefined,
    technicalDescent: hasTech ? techDescent : undefined,
  }
}

// Détection montée/descente + fenêtre de récupération [30s,180s] — port fidèle de
// buildRunnerProfile. `mode` factorise les deux passes (montée/descente) identiques
// au signe de pente près.
function processRecovery(
  n: number,
  time: number[],
  altitude: number[],
  velocity: number[],
  heartrate: number[],
  distArr: number[] | undefined,
  fcMax: number,
  mode: 'climb' | 'descent',
  accum: Partial<Record<ClimbBucket | DescentBucket, RecoveryEvent[]>>,
  climbRecoveryEvents: Array<{ hrDropBpmPerMin: number; resumeSpeedKmH: number }>,
): void {
  let phase = false
  let endIdx = -1
  let gradeSum = 0
  let gradeCount = 0
  let duration = 0
  let elevM = 0
  const reset = () => { gradeSum = 0; gradeCount = 0; duration = 0; elevM = 0 }

  for (let j = 1; j < n; j++) {
    const dt = time[j] - time[j - 1]
    const altDelta = altitude[j] - altitude[j - 1]
    const distDelta = distArr ? distArr[j] - distArr[j - 1] : (velocity[j] || 0) * dt
    if (distDelta <= 0) continue
    const grade = (altDelta / distDelta) * 100

    const inPhase = mode === 'climb' ? grade >= 8 : grade <= -6
    const exitPhase = mode === 'climb' ? grade < 4 : grade > -2

    if (inPhase) {
      phase = true; gradeSum += grade; gradeCount++; duration += dt
      if (mode === 'climb' ? altDelta > 0 : altDelta < 0) elevM += Math.abs(altDelta)
    } else if (phase && exitPhase) {
      endIdx = j; phase = false
      if (duration < 90 || elevM < 20) { reset(); continue }
      const avgGrade = gradeCount > 0 ? gradeSum / gradeCount : (mode === 'climb' ? 8 : -6)
      const bucket: ClimbBucket | DescentBucket = mode === 'climb'
        ? (avgGrade > 12 ? 'steep_up' : avgGrade > 6 ? 'mod_up' : 'mild_up')
        : (avgGrade < -12 ? 'steep_down' : avgGrade < -6 ? 'mod_down' : 'mild_down')
      const tStart = time[endIdx]
      let w30 = endIdx; while (w30 < n - 1 && time[w30] - tStart < 30) w30++
      let w180 = endIdx; while (w180 < n - 1 && time[w180] - tStart < 180) w180++
      if (w180 <= endIdx) { reset(); continue }
      const hrAtTransition = heartrate[endIdx]
      const hrAt180 = heartrate[w180]
      if (!(hrAtTransition > 0)) { reset(); continue }
      const dtWindow = time[w180] - tStart
      if (dtWindow < 30) { reset(); continue }
      const hrDrop = hrAtTransition - hrAt180
      if (hrDrop > 0) {
        const dropPerMin = hrDrop / (dtWindow / 60)
        const speedsInWindow: number[] = []
        const hrInWindow: number[] = []
        for (let w = w30; w <= w180; w++) { speedsInWindow.push((velocity[w] || 0) * 3.6); if (heartrate[w] > 40) hrInWindow.push(heartrate[w]) }
        if (speedsInWindow.length === 0) { reset(); continue }
        const resumeSpeedKmH = speedsInWindow.reduce((a, b) => a + b, 0) / speedsInWindow.length
        const avgHrPctFcMaxAfter = hrInWindow.length > 0 ? (hrInWindow.reduce((a, b) => a + b, 0) / hrInWindow.length / fcMax) * 100 : null
        if (dropPerMin > 0 && dropPerMin < 80) {
          const ev: RecoveryEvent = { hrDropBpmPerMin: dropPerMin, resumeSpeedKmH, avgHrPctFcMaxAfter }
          if (mode === 'climb') climbRecoveryEvents.push({ hrDropBpmPerMin: dropPerMin, resumeSpeedKmH })
          ;(accum[bucket] ??= []).push(ev)
        }
      }
      reset()
    } else if (!phase) {
      reset()
    }
  }
}
