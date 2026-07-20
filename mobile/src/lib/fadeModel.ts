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
  /**
   * Provenance : identifiant (pseudonymisé) de l'activité source. Sert à compter les
   * activités DISTINCTES — trois distances extraites d'UNE SEULE sortie ne prouvent pas
   * une vraie courbe d'endurance (cf. `distinctActivityCount`). Provenance ABSENTE =
   * NON FIABLE : l'effort ne compte PAS comme activité distincte (garde-fou conservateur).
   */
  activityId?: string | number
  /**
   * Poids robuste (0..1) de qualité du record (cf. assessBestEffortQuality). Utilisé en
   * régression PONDÉRÉE : un record douteux (descente, pause, altitude incomplète) pèse
   * moins qu'un record propre, au lieu d'un filtrage binaire. Défaut 1.
   */
  weight?: number
}

/** Niveau de confiance du modèle de durabilité (garde-fou d'activation). */
export type FadeConfidence = 'none' | 'low' | 'medium' | 'high'

export interface FadeModelResult {
  /** Exposant d'endurance personnel (loi de Riegel). Défaut si confiance < medium. */
  exponent: number
  /** Effort de référence retenu (le plus long fiable) pour projeter par la loi. */
  reference: FadeEffort | null
  /** Nombre d'efforts utilisés. */
  n: number
  /** Qualité de l'ajustement log-log (0..1). */
  r2: number
  /** Rapport distance max / min (étalement) — la régression exige un vrai écart. */
  spreadRatio: number
  /** Nombre d'activités DISTINCTES ayant fourni les efforts (garde-fou anti-mono-sortie). */
  distinctActivityCount: number
  /**
   * Confiance dans l'exposant appris. Le moteur n'active la durabilité personnelle que
   * pour `medium` ou `high` — jamais sur `none`/`low` (cf. §6).
   */
  confidence: FadeConfidence
  reason:
    | 'personal'
    | 'insufficient_data'
    | 'insufficient_spread'
    | 'insufficient_activities'
    | 'low_r2'
}

export interface FadeModelOptions {
  /** Exposant par défaut si données insuffisantes (population : 1.06). */
  defaultExponent?: number
  /** Minimum d'efforts pour apprendre un exposant personnel (défaut 3). */
  minEfforts?: number
  /** Étalement minimal de distance (max/min) pour tenter une régression (défaut 1.8). */
  minSpreadRatio?: number
  /** Bornes de l'exposant appris (anti-aberration). */
  minExponent?: number
  maxExponent?: number
}

const DEFAULTS: Required<FadeModelOptions> = {
  defaultExponent: 1.06,
  minEfforts: 3,
  minSpreadRatio: 1.8,
  minExponent: 1.01,
  maxExponent: 1.2,
}

/**
 * Seuils d'activation de la durabilité personnelle (§6). Justification : une régression
 * log-log n'est crédible que si elle repose sur (a) assez de points, (b) provenant de
 * plusieurs sorties distinctes — sinon on ajuste le bruit d'une seule course —, (c) un
 * étalement de distance réel et (d) un R² élevé. Ces seuils NE sont PAS calibrés sur le
 * benchmark : ce sont des garde-fous statistiques conservateurs.
 */
export const FADE_CONFIDENCE_RULES = {
  high: { minEfforts: 4, minDistinctActivities: 3, minSpreadRatio: 3, minR2: 0.95 },
  medium: { minEfforts: 3, minDistinctActivities: 2, minSpreadRatio: 1.8, minR2: 0.9 },
} as const

/**
 * Compte les activités DISTINCTES à provenance CONNUE. La provenance absente est
 * considérée NON FIABLE (conservateur) : elle ne peut pas prouver une activité distincte,
 * donc elle ne compte pas. Trois distances sans provenance → 0 activité distincte prouvée.
 */
function countDistinctActivities(pts: FadeEffort[]): number {
  const seen = new Set<string>()
  for (const e of pts) if (e.activityId != null) seen.add(`id:${e.activityId}`)
  return seen.size
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
  const distinctActivityCount = countDistinctActivities(pts)

  const base = { reference, distinctActivityCount }

  if (pts.length < o.minEfforts) {
    return { ...base, exponent: o.defaultExponent, n: pts.length, r2: 0, spreadRatio: spread(pts), confidence: 'none', reason: 'insufficient_data' }
  }
  const sr = spread(pts)
  if (sr < o.minSpreadRatio) {
    return { ...base, exponent: o.defaultExponent, n: pts.length, r2: 0, spreadRatio: +sr.toFixed(2), confidence: 'none', reason: 'insufficient_spread' }
  }

  // Régression log-log PONDÉRÉE (§8) : chaque effort pèse selon sa qualité (weight ∈ [0,1],
  // défaut 1). Un record douteux (descente, pause, altitude incomplète) pèse moins qu'un
  // record propre — dépondération robuste plutôt que filtrage binaire.
  const xs = pts.map((e) => Math.log(e.distM))
  const ys = pts.map((e) => Math.log(e.timeSec))
  const ws = pts.map((e) => (typeof e.weight === 'number' ? clamp(e.weight, 0, 1) : 1))
  const n = pts.length
  const wsum = ws.reduce((s, w) => s + w, 0)
  if (wsum <= 0) {
    return { ...base, exponent: o.defaultExponent, n, r2: 0, spreadRatio: +sr.toFixed(2), confidence: 'none', reason: 'low_r2' }
  }
  const xbar = ws.reduce((s, w, i) => s + w * xs[i], 0) / wsum
  const ybar = ws.reduce((s, w, i) => s + w * ys[i], 0) / wsum
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += ws[i] * (xs[i] - xbar) ** 2
    sxy += ws[i] * (xs[i] - xbar) * (ys[i] - ybar)
  }
  if (sxx <= 0) {
    return { ...base, exponent: o.defaultExponent, n, r2: 0, spreadRatio: +sr.toFixed(2), confidence: 'none', reason: 'insufficient_spread' }
  }
  const slope = sxy / sxx
  const fittedExponent = +clamp(slope, o.minExponent, o.maxExponent).toFixed(4)

  // R² PONDÉRÉ : garde-fou de qualité de la régression.
  let ssTot = 0
  let ssRes = 0
  const intercept = ybar - slope * xbar
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i]
    ssRes += ws[i] * (ys[i] - pred) ** 2
    ssTot += ws[i] * (ys[i] - ybar) ** 2
  }
  const r2 = +(ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0).toFixed(3)
  const srRounded = +sr.toFixed(2)

  // Confiance : deux paliers (high/medium) ; sinon on n'active PAS la durabilité perso.
  // On utilise le nombre d'efforts EFFECTIF (somme des poids de qualité) : trois records
  // tous douteux (poids 0.3) ne pèsent QUE ~0.9 effort → n'atteignent aucun palier, même si
  // leur courbe est bien ajustée (§8/§19.4 : dépondération robuste, pas seulement filtrage).
  const effectiveN = wsum
  const H = FADE_CONFIDENCE_RULES.high
  const M = FADE_CONFIDENCE_RULES.medium
  let confidence: FadeConfidence
  if (effectiveN >= H.minEfforts && distinctActivityCount >= H.minDistinctActivities && sr >= H.minSpreadRatio && r2 >= H.minR2) {
    confidence = 'high'
  } else if (effectiveN >= M.minEfforts && distinctActivityCount >= M.minDistinctActivities && sr >= M.minSpreadRatio && r2 >= M.minR2) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  if (confidence === 'high' || confidence === 'medium') {
    return { ...base, exponent: fittedExponent, n, r2, spreadRatio: srRounded, confidence, reason: 'personal' }
  }

  // Confiance insuffisante → exposant par défaut, aucune activation personnelle.
  // On expose la vraie raison dominante pour l'explicabilité/diagnostic.
  const reason: FadeModelResult['reason'] =
    effectiveN < M.minEfforts ? 'insufficient_data'
    : r2 < M.minR2 ? 'low_r2'
    : distinctActivityCount < M.minDistinctActivities ? 'insufficient_activities'
    : 'insufficient_spread'
  return { ...base, exponent: o.defaultExponent, n, r2, spreadRatio: srRounded, confidence, reason }
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
function spread(pts: FadeEffort[]): number {
  if (pts.length < 2) return 1
  const ds = pts.map((e) => e.distM)
  const min = Math.min(...ds)
  return min > 0 ? Math.max(...ds) / min : 1
}
function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
