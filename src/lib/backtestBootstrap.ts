// Intervalles de confiance par BOOTSTRAP CLUSTERISÉ (§17) — logique PURE, déterministe.
//
// Plusieurs courses appartiennent au même athlète (ou au même événement) : un bootstrap
// naïf ligne-par-ligne sous-estimerait la variance (corrélation intra-athlète). On
// rééchantillonne donc les CLUSTERS (athlète) avec remise, pas les lignes. Seed fixe →
// résultats reproductibles.

import { percentile } from './engineBacktest'

/** RNG déterministe mulberry32 (seed → séquence reproductible). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BootstrapPoint {
  predictedS: number
  actualS: number
  low?: number | null
  high?: number | null
  /** Identifiant de cluster (athlète ou événement) — l'unité de rééchantillonnage. */
  clusterId: string
}

export interface BootstrapCI {
  point: number
  lo: number
  hi: number
}

export interface ClusteredBootstrapResult {
  n: number
  clusters: number
  iterations: number
  seed: number
  /** Niveau de confiance (ex. 0.95). */
  level: number
  mapePct: BootstrapCI
  maeS: BootstrapCI
  biasS: BootstrapCI
  /** Couverture d'intervalle (null si aucune ligne ne porte [low,high]). */
  coverage: BootstrapCI | null
}

interface Stats {
  mapePct: number
  maeS: number
  biasS: number
  coverage: number | null
}

function statsOf(points: BootstrapPoint[]): Stats {
  const n = points.length
  if (n === 0) return { mapePct: NaN, maeS: NaN, biasS: NaN, coverage: null }
  let sumAbs = 0, sumPct = 0, sumBias = 0, intTot = 0, intHit = 0
  for (const p of points) {
    const err = p.predictedS - p.actualS
    sumAbs += Math.abs(err)
    sumBias += err
    if (p.actualS > 0) sumPct += Math.abs(err) / p.actualS
    if (p.low != null && p.high != null) {
      intTot++
      if (p.actualS >= p.low && p.actualS <= p.high) intHit++
    }
  }
  return {
    mapePct: (sumPct / n) * 100,
    maeS: sumAbs / n,
    biasS: sumBias / n,
    coverage: intTot > 0 ? intHit / intTot : null,
  }
}

// L'estimation ponctuelle est la statistique OBSERVÉE sur l'échantillon complet (non biaisée),
// pas la médiane des rééchantillons ; le bootstrap ne fournit que les bornes de l'IC.
function ci(values: number[], level: number, observed: number): BootstrapCI {
  const sorted = [...values].sort((a, b) => a - b)
  const alpha = (1 - level) / 2
  return {
    point: observed,
    lo: percentile(sorted, alpha * 100),
    hi: percentile(sorted, (1 - alpha) * 100),
  }
}

export interface ClusteredBootstrapOptions {
  iterations?: number
  seed?: number
  level?: number
}

/**
 * Bootstrap clusterisé : à chaque itération, on tire `nClusters` clusters AVEC REMISE,
 * on met en commun leurs lignes, et on calcule MAPE/MAE/biais/couverture. L'IC est le
 * couple de percentiles (2.5 %, 97.5 % par défaut) de la distribution bootstrap.
 * Déterministe pour un `seed` donné.
 */
export function clusteredBootstrap(
  points: BootstrapPoint[],
  opts: ClusteredBootstrapOptions = {},
): ClusteredBootstrapResult {
  const iterations = opts.iterations ?? 2000
  const seed = opts.seed ?? 42
  const level = opts.level ?? 0.95

  // Regroupe par cluster.
  const byCluster = new Map<string, BootstrapPoint[]>()
  for (const p of points) {
    const arr = byCluster.get(p.clusterId) ?? []
    arr.push(p)
    byCluster.set(p.clusterId, arr)
  }
  const clusterKeys = [...byCluster.keys()].sort()
  const K = clusterKeys.length

  const base = statsOf(points)
  const hasCoverage = base.coverage != null

  if (K === 0) {
    const empty: BootstrapCI = { point: NaN, lo: NaN, hi: NaN }
    return { n: 0, clusters: 0, iterations, seed, level, mapePct: empty, maeS: empty, biasS: empty, coverage: null }
  }

  const rng = mulberry32(seed)
  const mape: number[] = [], mae: number[] = [], bias: number[] = [], cov: number[] = []

  for (let it = 0; it < iterations; it++) {
    const resampled: BootstrapPoint[] = []
    for (let k = 0; k < K; k++) {
      const idx = Math.min(K - 1, Math.floor(rng() * K))
      const cluster = byCluster.get(clusterKeys[idx])!
      for (const p of cluster) resampled.push(p)
    }
    const s = statsOf(resampled)
    if (Number.isFinite(s.mapePct)) mape.push(s.mapePct)
    if (Number.isFinite(s.maeS)) mae.push(s.maeS)
    if (Number.isFinite(s.biasS)) bias.push(s.biasS)
    if (s.coverage != null) cov.push(s.coverage)
  }

  return {
    n: points.length,
    clusters: K,
    iterations,
    seed,
    level,
    mapePct: ci(mape, level, base.mapePct),
    maeS: ci(mae, level, base.maeS),
    biasS: ci(bias, level, base.biasS),
    coverage: hasCoverage && cov.length > 0 ? ci(cov, level, base.coverage as number) : null,
  }
}
