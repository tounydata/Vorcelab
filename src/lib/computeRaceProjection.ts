// Pure computation wrapper around gpx-core.js and race-predictor.js algorithms.
// No DOM, no VLState, no external API calls — fully synchronous.
// Imported by RaceStrategyPage via allowJs: true in tsconfig.

// @ts-ignore — JS files typed as any via allowJs; checkJs: false keeps them unchecked
import { hav, minettiGradePenalty, buildDetailedSections } from '../../gpx-core.js'
// @ts-ignore
import { computeProgressionFactor, computeFreshnessAdjustment } from '../../race-predictor.js'

export interface GpxPoint { lat: number; lon: number; ele: number | null }

export interface Section {
  type: 'up' | 'down' | 'flat'
  startKm: number
  endKm: number
  dplus: number
  dminus: number
  dist: number
  grade: number
}

export interface ProjectionResult {
  points: GpxPoint[]
  samples: { d: number; alt: number | null }[]
  sections: Section[]
  sectionTimes: number[]
  totalDistM: number
  dplus: number
  dminus: number
  altMin: number
  altMax: number
  estTimeS: number
  timeMin: number
  timeMax: number
  confidence: 'good' | 'medium' | 'low'
  basePaceS: number
  isTrail: boolean
  goalLabel?: string
  goalCompareColor?: string
  goalCompareStr?: string
  personalAdjustments: { label: string; detail: string; color: string }[]
}

export function computeRaceProjection(
  points: GpxPoint[],
  activities: Record<string, unknown>[],
  profile: Record<string, unknown>,
  race: { type?: string | null; goal_time?: string | null } | null
): ProjectionResult {
  // ── 1. Cumulative distances & elevation stats ──────────────────────────────
  const cumDist = [0]
  let dplus = 0, dminus = 0
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + hav(points[i - 1], points[i]))
    if (points[i].ele != null && points[i - 1].ele != null) {
      const diff = (points[i].ele as number) - (points[i - 1].ele as number)
      if (diff > 0) dplus += diff
      else dminus += Math.abs(diff)
    }
  }
  const totalDistM = cumDist[cumDist.length - 1]

  const eles = points.map((p) => p.ele).filter((e): e is number => e != null)
  const altMin = eles.length ? Math.min(...eles) : 0
  const altMax = eles.length ? Math.max(...eles) : 0

  // ── 2. Altitude samples every 100m (for chart) ────────────────────────────
  const samples: { d: number; alt: number | null }[] = []
  let target = 0
  for (let i = 0; i < points.length; i++) {
    if (cumDist[i] >= target) {
      samples.push({ d: +(cumDist[i] / 1000).toFixed(2), alt: points[i].ele != null ? Math.round(points[i].ele as number) : null })
      target += 100
    }
  }
  samples.push({ d: +(totalDistM / 1000).toFixed(2), alt: eles.length ? Math.round(eles[eles.length - 1]) : null })

  // ── 3. 500m segments ──────────────────────────────────────────────────────
  interface KmSec { km: number; startKm: number; dist: number; dplus: number; dminus: number; grade: number; altEnd: number | null }
  const kmSecs: KmSec[] = []
  let segTarget = 500, prevIdx = 0

  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= segTarget || i === cumDist.length - 1) {
      let sdp = 0, sdm = 0
      for (let j = prevIdx + 1; j <= i; j++) {
        if (points[j].ele != null && points[j - 1].ele != null) {
          const diff = (points[j].ele as number) - (points[j - 1].ele as number)
          if (diff > 0) sdp += diff
          else sdm += Math.abs(diff)
        }
      }
      const segDist = cumDist[i] - cumDist[prevIdx]
      const elevChange = (points[i].ele != null && points[prevIdx].ele != null)
        ? (points[i].ele as number) - (points[prevIdx].ele as number) : 0
      const grade = segDist > 0 ? (elevChange / segDist) * 100 : 0
      kmSecs.push({
        km: +(cumDist[i] / 1000).toFixed(2),
        startKm: +(cumDist[prevIdx] / 1000).toFixed(2),
        dist: segDist,
        dplus: Math.round(sdp),
        dminus: Math.round(sdm),
        grade: +grade.toFixed(1),
        altEnd: points[i].ele != null ? Math.round(points[i].ele as number) : null,
      })
      prevIdx = i
      segTarget = cumDist[i] + 500
    }
  }

  // ── 4. Sections (buildDetailedSections from gpx-core.js) ──────────────────
  const sections: Section[] = (buildDetailedSections(kmSecs) as Section[])

  // ── 5. isTrail from race type or D+/km heuristic ──────────────────────────
  const raceType = race?.type
  let isTrail: boolean
  if (raceType) {
    isTrail = ['Trail', 'TrailRun', 'trail'].includes(raceType)
  } else {
    isTrail = totalDistM > 0 && (dplus / (totalDistM / 1000)) > 20
  }

  // ── 6. Base pace ──────────────────────────────────────────────────────────
  const FC_MAX = (profile.fc_max as number | undefined) ?? 205
  const TRAIL_TYPES = ['TrailRun', 'Trail Run']
  const progressionFactor = computeProgressionFactor(activities, FC_MAX, isTrail)

  function computeBasePaceS(): number {
    const raceDpKm = dplus / (totalDistM / 1000)
    const now = Date.now()
    const cutoff60 = now - 60 * 24 * 3600_000

    if (isTrail) {
      const trailRuns = activities
        .filter((a: Record<string, unknown>) => {
          const t = (a.type || a.sport_type) as string
          return (t === 'TrailRun' || TRAIL_TYPES.includes(t)) && (a.distance as number) > 5000 && (a.average_speed as number) > 0
        })
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => new Date(b.start_date as string).getTime() - new Date(a.start_date as string).getTime())
        .slice(0, 20)

      if (trailRuns.length >= 1) {
        const top = trailRuns.slice(0, 10)
        const scored = top.map((a: Record<string, unknown>) => {
          const aDpKm = ((a.total_elevation_gain as number) || 0) / ((a.distance as number) / 1000)
          const similarity = 1 - Math.min(1, Math.abs(aDpKm - raceDpKm) / (raceDpKm + 1))
          const recency = new Date(a.start_date as string).getTime() >= cutoff60 ? 2 : 1
          return { paceS: 1000 / (a.average_speed as number), weight: (0.4 + 0.6 * similarity) * recency }
        })
        const totalW = scored.reduce((s: number, x: { weight: number }) => s + x.weight, 0)
        return scored.reduce((s: number, x: { paceS: number; weight: number }) => s + x.paceS * x.weight, 0) / totalW / progressionFactor
      }
      return 420 // 7:00/km fallback
    }

    // Road: use PRs if available
    const prs = profile.prs as Record<string, { timeS: number; dist: number }> | undefined
    if (prs) {
      const candidates = ['semi', '10k', '15k', 'marathon', '5k'].filter((k) => prs[k]?.timeS && prs[k]?.dist)
      if (candidates.length) {
        const pr = prs[candidates[0]]
        return (pr.timeS / pr.dist * 1000) / progressionFactor
      }
    }
    return 320 // 5:20/km fallback for road
  }

  const basePaceS = computeBasePaceS()

  // ── 7. Section times (Minetti grade penalty, no terrain for Phase 1) ───────
  const sectionTimes: number[] = []
  let estTimeS = 0
  const _vam = (profile.vam_avg as number | undefined) ?? 0
  const _cu = (profile.coeff_uphill as number | undefined) ?? 0
  const _cd = (profile.coeff_downhill as number | undefined) ?? 0
  const _cf = (profile.coeff_flat as number | undefined) ?? 0

  for (const s of sections) {
    const g = s.grade / 100
    let pente: number
    if (s.type === 'up' && _vam > 0 && g > 0.01) {
      pente = Math.max(0, (3_600_000 * g / _vam) / basePaceS - 1)
    } else if (s.type === 'up' && _cu > 0) {
      pente = minettiGradePenalty(g) * _cu
    } else if (s.type === 'down' && _cd > 0) {
      pente = minettiGradePenalty(g) * _cd
    } else if (s.type === 'flat' && _cf > 0) {
      pente = minettiGradePenalty(g) * _cf
    } else {
      pente = minettiGradePenalty(g)
    }
    const t = basePaceS * (1 + pente) * s.dist / 1000
    sectionTimes.push(t)
    estTimeS += t
  }

  // ── 8. Freshness adjustment ────────────────────────────────────────────────
  const personalAdjustments: { label: string; detail: string; color: string }[] = []
  const freshness = computeFreshnessAdjustment(activities, FC_MAX)
  if (freshness.multiplier !== 1 && freshness.label) {
    estTimeS *= freshness.multiplier
    personalAdjustments.push({
      label: `Charge : ${freshness.label}`,
      detail: `${freshness.multiplier > 1 ? '+' : ''}${((freshness.multiplier - 1) * 100).toFixed(0)}%`,
      color: freshness.multiplier > 1 ? 'var(--vl-ember)' : 'var(--vl-growth)',
    })
  }

  // Scale section times to match final estTimeS
  const rawSum = sectionTimes.reduce((s, t) => s + t, 0)
  const sf = rawSum > 0 ? estTimeS / rawSum : 1
  const scaledTimes = sectionTimes.map((t) => Math.round(t * sf))

  // ── 9. Confidence ─────────────────────────────────────────────────────────
  const isRunType = (t: string) => ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(t)
  const cutoff90 = Date.now() - 90 * 24 * 3600_000
  const recentRuns = activities.filter((a: Record<string, unknown>) =>
    isRunType((a.type || a.sport_type) as string) && new Date(a.start_date as string).getTime() >= cutoff90 && (a.distance as number) > 0
  )
  const trailCount = activities.filter((a: Record<string, unknown>) =>
    TRAIL_TYPES.includes((a.type || a.sport_type) as string) && (a.distance as number) > 5000
  ).length
  const recentCount = recentRuns.length
  const hasHR = activities.some((a: Record<string, unknown>) => (a.average_heartrate as number) > 0)

  let confScore = 0
  if (isTrail) { if (trailCount >= 5) confScore += 2; else if (trailCount >= 2) confScore += 1 }
  else { if (recentCount >= 3) confScore += 2; else if (recentCount >= 1) confScore += 1 }
  if (recentCount >= 3) confScore += 1
  if (hasHR) confScore += 1
  if (totalDistM > 5000 && sections.length >= 5) confScore += 1
  confScore = Math.max(0, confScore)
  const confidence: 'good' | 'medium' | 'low' = confScore >= 7 ? 'good' : confScore >= 4 ? 'medium' : 'low'

  // ── 10. Range ─────────────────────────────────────────────────────────────
  const rf = confidence === 'good' ? { min: 0.96, max: 1.08 } : confidence === 'medium' ? { min: 0.95, max: 1.15 } : { min: 0.97, max: 1.25 }
  const timeMin = estTimeS * rf.min
  const timeMax = estTimeS * rf.max

  // ── 11. Goal comparison ───────────────────────────────────────────────────
  let goalLabel: string | undefined
  let goalCompareColor: string | undefined
  let goalCompareStr: string | undefined

  if (race?.goal_time) {
    const m = race.goal_time.match(/(\d+)[hH](\d*)/)
    if (m) {
      const goalSec = parseInt(m[1]) * 3600 + (parseInt(m[2]) || 0) * 60
      const absDiff = Math.abs(goalSec - Math.round(estTimeS))
      const diffH = Math.floor(absDiff / 3600)
      const diffM = Math.floor((absDiff % 3600) / 60)
      const diffStr = `${diffH > 0 ? diffH + 'h' : ''}${String(diffM).padStart(diffH > 0 ? 2 : 1, '0')}min`
      const ratio = Math.round(estTimeS) / goalSec
      if (ratio < 0.94) { goalLabel = 'Très conservateur'; goalCompareColor = 'var(--vl-text-3)'; goalCompareStr = `Projection ${diffStr} plus rapide que ton objectif` }
      else if (ratio < 0.97) { goalLabel = 'Conservateur'; goalCompareColor = 'var(--vl-growth)'; goalCompareStr = `Projection ${diffStr} plus rapide que ton objectif` }
      else if (ratio <= 1.03) { goalLabel = 'Réaliste'; goalCompareColor = 'var(--vl-growth)'; goalCompareStr = 'Objectif aligné avec la projection Vorcelab' }
      else if (ratio <= 1.10) { goalLabel = 'Ambitieux'; goalCompareColor = 'var(--vl-amber)'; goalCompareStr = `Objectif ${diffStr} plus rapide que la projection Vorcelab` }
      else { goalLabel = 'Très ambitieux'; goalCompareColor = 'var(--vl-ember)'; goalCompareStr = `Objectif ${diffStr} plus rapide que la projection Vorcelab` }
    }
  }

  return {
    points,
    samples,
    sections,
    sectionTimes: scaledTimes,
    totalDistM,
    dplus,
    dminus,
    altMin,
    altMax,
    estTimeS,
    timeMin,
    timeMax,
    confidence,
    basePaceS,
    isTrail,
    goalLabel,
    goalCompareColor,
    goalCompareStr,
    personalAdjustments,
  }
}
