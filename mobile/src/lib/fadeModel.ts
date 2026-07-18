// Modèle de DURABILITÉ « longue distance » : apprend comment TU ralentis quand la course
// s'allonge (ton exposant d'endurance personnel), à partir de ta courbe de meilleures
// perfs. Complète `durability.ts` (dérive cardiaque INTRA-effort) par la fatigue INTER-
// distances. 100 % pur, testable, identique web/mobile.
//
// Science (cf. recherche) :
//   • Loi de Riegel : T2 = T1 · (D2/D1)^b. b = exposant d'endurance (« fade »).
//     b ≈ 1.06 en population ; plus bas = tu tiens mieux le long, plus haut = tu
//     t'effondres. On l'APPREND par régression log-log sur TES perfs.
//   • Au-delà du marathon (ultra), Riegel sous-estime (trop rapide) → on augmente
//     progressivement l'exposant.
//   • Durabilité = combinaison de cet exposant et de la dérive cardiaque (decoupling).

export interface FadeEffort {
  /** Distance de l'effort (m) — idéalement « équivalent plat » pour comparer les profils. */
  distM: number
  /** Temps de l'effort (s). */
  timeSec: number
}

export interface FadeModelResult {
  /** Exposant d'endurance personnel (loi de Riegel). */
  exponent: number
  /** Effort de référence retenu (le plus long fiable) pour projeter par la loi. */
  reference: FadeEffort | null
  /** Nombre d'efforts utilisés. */
  n: number
  /** Qualité de l'ajustement log-log (0..1). */
  r2: number
  /** Rapport distance max / min (étalement) — la régression exige un vrai écart. */
  spreadRatio: number
  reason: 'personal' | 'insufficient_data' | 'insufficient_spread'
}

export interface FadeModelOptions {
  /** Exposant par défaut si données insuffisantes (population : 1.06). */
  defaultExponent?: number
  /** Minimum d'efforts pour apprendre un exposant personnel (défaut 3). */
  minEfforts?: number
  /** Étalement minimal de distance (max/min) pour une régression fiable (défaut 1.6). */
  minSpreadRatio?: number
  /** Bornes de l'exposant appris (anti-aberration). */
  minExponent?: number
  maxExponent?: number
}

const DEFAULTS: Required<FadeModelOptions> = {
  defaultExponent: 1.06,
  minEfforts: 3,
  minSpreadRatio: 1.6,
  minExponent: 1.01,
  maxExponent: 1.2,
}

/** Distance marathon (m) — au-delà, on ajoute une pénalité ultra progressive. */
export const MARATHON_M = 42195

/**
 * Ajuste l'exposant d'endurance personnel par régression linéaire de `ln(T)` sur
 * `ln(D)` (pente = exposant). Exige assez d'efforts ET un étalement de distance réel,
 * sinon retourne l'exposant par défaut avec la raison. L'effort de référence retenu est
 * le PLUS LONG fiable (base la plus proche des longues distances à projeter).
 */
export function fitFadeExponent(efforts: FadeEffort[], options?: FadeModelOptions): FadeModelResult {
  const o = { ...DEFAULTS, ...(options ?? {}) }
  const pts = efforts.filter((e) => e.distM > 0 && e.timeSec > 0)
  const reference = pts.length
    ? pts.reduce((best, e) => (e.distM > best.distM ? e : best), pts[0])
    : null

  if (pts.length < o.minEfforts) {
    return { exponent: o.defaultExponent, reference, n: pts.length, r2: 0, spreadRatio: spread(pts), reason: 'insufficient_data' }
  }
  const sr = spread(pts)
  if (sr < o.minSpreadRatio) {
    return { exponent: o.defaultExponent, reference, n: pts.length, r2: 0, spreadRatio: sr, reason: 'insufficient_spread' }
  }

  const xs = pts.map((e) => Math.log(e.distM))
  const ys = pts.map((e) => Math.log(e.timeSec))
  const n = pts.length
  const xbar = mean(xs)
  const ybar = mean(ys)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - xbar) ** 2
    sxy += (xs[i] - xbar) * (ys[i] - ybar)
  }
  if (sxx <= 0) {
    return { exponent: o.defaultExponent, reference, n, r2: 0, spreadRatio: sr, reason: 'insufficient_spread' }
  }
  const slope = sxy / sxx
  const exponent = clamp(slope, o.minExponent, o.maxExponent)

  // R² pour la confiance.
  let ssTot = 0
  let ssRes = 0
  const intercept = ybar - slope * xbar
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i]
    ssRes += (ys[i] - pred) ** 2
    ssTot += (ys[i] - ybar) ** 2
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0

  return { exponent: +exponent.toFixed(4), reference, n, r2: +r2.toFixed(3), spreadRatio: +sr.toFixed(2), reason: 'personal' }
}

/**
 * Projette le temps sur `targetDistM` à partir d'un effort de référence et de l'exposant
 * personnel, avec pénalité ULTRA progressive au-delà du marathon (Riegel sous-estime les
 * ultras). Renvoie null si la référence est invalide.
 */
export function projectWithFade(
  targetDistM: number,
  reference: FadeEffort | null,
  exponent: number,
  options?: { ultraRamp?: number },
): number | null {
  if (!reference || reference.distM <= 0 || reference.timeSec <= 0 || targetDistM <= 0) return null
  const ultraRamp = options?.ultraRamp ?? 0.03
  // Au-delà du marathon, l'exposant effectif augmente doucement (fatigue non linéaire).
  const ultra = targetDistM > MARATHON_M ? ultraRamp * Math.log(targetDistM / MARATHON_M) : 0
  const bEff = exponent + ultra
  return reference.timeSec * (targetDistM / reference.distM) ** bEff
}

/**
 * Score de durabilité 0–100 : combine l'exposant d'endurance (60 %) et la dérive
 * cardiaque intra-effort (40 %). Plus l'exposant est bas et la dérive faible, plus
 * l'athlète est durable. `decouplingPct` peut être null (→ part exposant seule).
 */
export function durabilityScore(exponent: number, decouplingPct: number | null): number {
  const bTerm = clamp((1.15 - exponent) / (1.15 - 1.02), 0, 1)
  if (decouplingPct == null) return Math.round(100 * bTerm)
  const dcTerm = clamp((12 - decouplingPct) / 12, 0, 1)
  return Math.round(100 * (0.6 * bTerm + 0.4 * dcTerm))
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}
function spread(pts: FadeEffort[]): number {
  if (pts.length < 2) return 1
  const ds = pts.map((e) => e.distM)
  const min = Math.min(...ds)
  return min > 0 ? Math.max(...ds) / min : 1
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
