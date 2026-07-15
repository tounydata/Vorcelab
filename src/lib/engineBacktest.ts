// Banc de validation du moteur de projection — logique PURE (aucune dépendance),
// testable sous Node. Garantit l'absence de FUITE TEMPORELLE : pour chaque course
// passée, on ne fournit au moteur QUE les activités antérieures au départ, puis on
// compare la projection au résultat réel. Le moteur lui-même (buildRunnerProfile +
// computeRaceProjection) est INJECTÉ (`project`) : le banc reste découplé et testable,
// et un script d'orchestration branche le vrai moteur sur des données réelles.

export interface ActivityLite {
  start_date?: string | null
  start_date_local?: string | null
}

export interface RaceCase<A extends ActivityLite = ActivityLite> {
  /** Départ de la course (ISO). Seules les activités STRICTEMENT antérieures sont fournies. */
  raceStartISO: string
  /** Temps réel réalisé (secondes). */
  actualS: number
  distanceKm: number
  /** Dénivelé positif par km (m/km) — pour la ventilation par pente. */
  dplusPerKm?: number
  terrain?: 'road' | 'trail'
  /** Toutes les activités connues de l'athlète (le banc filtre l'anti-fuite). */
  activities: A[]
}

export interface Projection {
  predictedS: number
  /** Intervalle de confiance optionnel (s) — pour la calibration. */
  low?: number
  high?: number
}

export interface ErrorMetrics {
  n: number
  maeS: number // erreur absolue moyenne (s)
  mapePct: number // erreur absolue moyenne (%)
  meanBiasS: number // biais moyen signé (predicted - actual) ; >0 = surestime le temps
  medianAbsS: number
  p75AbsS: number
  p90AbsS: number
  /** Fraction des réels tombant dans [low, high] ; null si aucun intervalle fourni. */
  intervalCoverage: number | null
}

/** Percentile (nearest-rank) sur un tableau trié croissant. p ∈ [0,100]. */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN
  if (sortedAsc.length === 1) return sortedAsc[0]
  const rank = Math.ceil((p / 100) * sortedAsc.length)
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))
  return sortedAsc[idx]
}

interface Scored {
  predictedS: number
  actualS: number
  low?: number
  high?: number
}

export function computeErrorMetrics(scored: Scored[]): ErrorMetrics {
  const n = scored.length
  if (n === 0) {
    return { n: 0, maeS: NaN, mapePct: NaN, meanBiasS: NaN, medianAbsS: NaN, p75AbsS: NaN, p90AbsS: NaN, intervalCoverage: null }
  }
  const absErrors: number[] = []
  let sumAbs = 0
  let sumPct = 0
  let sumBias = 0
  let intervalTotal = 0
  let intervalHit = 0
  for (const s of scored) {
    const err = s.predictedS - s.actualS
    const abs = Math.abs(err)
    absErrors.push(abs)
    sumAbs += abs
    sumBias += err
    if (s.actualS > 0) sumPct += abs / s.actualS
    if (s.low != null && s.high != null) {
      intervalTotal += 1
      if (s.actualS >= s.low && s.actualS <= s.high) intervalHit += 1
    }
  }
  absErrors.sort((a, b) => a - b)
  return {
    n,
    maeS: sumAbs / n,
    mapePct: (sumPct / n) * 100,
    meanBiasS: sumBias / n,
    medianAbsS: percentile(absErrors, 50),
    p75AbsS: percentile(absErrors, 75),
    p90AbsS: percentile(absErrors, 90),
    intervalCoverage: intervalTotal > 0 ? intervalHit / intervalTotal : null,
  }
}

/** Ne garde que les activités STRICTEMENT antérieures au départ (anti-fuite). */
export function activitiesBefore<A extends ActivityLite>(activities: A[], raceStartISO: string): A[] {
  const start = Date.parse(raceStartISO)
  if (Number.isNaN(start)) return []
  return activities.filter((a) => {
    const d = Date.parse(a.start_date ?? a.start_date_local ?? '')
    return !Number.isNaN(d) && d < start
  })
}

export function distanceBucket(km: number): string {
  if (km < 15) return '<15km'
  if (km < 30) return '15–30km'
  if (km < 50) return '30–50km'
  if (km < 80) return '50–80km'
  return '80km+'
}

export function dplusBucket(dplusPerKm?: number): string {
  if (dplusPerKm == null) return 'inconnu'
  if (dplusPerKm < 10) return 'plat (<10)'
  if (dplusPerKm < 25) return 'vallonné (10–25)'
  if (dplusPerKm < 40) return 'montagneux (25–40)'
  return 'très technique (40+)'
}

export interface BacktestReport {
  overall: ErrorMetrics
  byDistance: Record<string, ErrorMetrics>
  byTerrain: Record<string, ErrorMetrics>
  byDplus: Record<string, ErrorMetrics>
}

function groupMetrics<A extends ActivityLite>(
  rows: { case: RaceCase<A>; scored: Scored }[],
  keyFn: (c: RaceCase<A>) => string,
): Record<string, ErrorMetrics> {
  const groups = new Map<string, Scored[]>()
  for (const r of rows) {
    const k = keyFn(r.case)
    const arr = groups.get(k) ?? []
    arr.push(r.scored)
    groups.set(k, arr)
  }
  const out: Record<string, ErrorMetrics> = {}
  for (const [k, v] of groups) out[k] = computeErrorMetrics(v)
  return out
}

/**
 * Exécute le backtest : pour chaque course, filtre les activités antérieures au
 * départ (aucune fuite temporelle possible), demande une projection via `project`,
 * puis agrège les métriques d'erreur globales et ventilées.
 */
export function runBacktest<A extends ActivityLite>(
  cases: RaceCase<A>[],
  project: (input: { activitiesBefore: A[]; distanceKm: number; dplusPerKm?: number; terrain?: 'road' | 'trail' }) => Projection,
): BacktestReport {
  const rows = cases.map((c) => {
    const before = activitiesBefore(c.activities, c.raceStartISO)
    const proj = project({ activitiesBefore: before, distanceKm: c.distanceKm, dplusPerKm: c.dplusPerKm, terrain: c.terrain })
    const scored: Scored = { predictedS: proj.predictedS, actualS: c.actualS, low: proj.low, high: proj.high }
    return { case: c, scored }
  })
  return {
    overall: computeErrorMetrics(rows.map((r) => r.scored)),
    byDistance: groupMetrics(rows, (c) => distanceBucket(c.distanceKm)),
    byTerrain: groupMetrics(rows, (c) => c.terrain ?? 'inconnu'),
    byDplus: groupMetrics(rows, (c) => dplusBucket(c.dplusPerKm)),
  }
}
