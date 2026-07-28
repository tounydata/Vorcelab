// Précision RÉELLE du moteur, mesurée sur les snapshots prospectifs (logique PURE).
//
// Pourquoi ce module : le moteur se calait déjà sur les COURSES de l'athlète (ancrage,
// FIC, calibration de pente), mais il n'a jamais lu ses propres ERREURS. Rien ne
// comparait une projection figée AVANT la course au résultat réel — le seul artefact
// qui aurait pu le faire, `race_calendar.last_projection`, est réécrit à chaque
// ouverture de page, et une projection recalculée APRÈS la course inclut la course
// elle-même dans son historique d'ancrage : elle converge vers le résultat et fait
// paraître l'erreur deux fois plus petite qu'elle n'était.
//
// `projection_validation_snapshots` est la seule source honnête : prédiction immuable
// (garantie par trigger SQL), figée avant le départ, résultat en écriture unique. Ce
// module transforme ces lignes en métriques d'erreur, ventilées PAR VERSION DE MOTEUR —
// afin qu'une régression comme « la version N+1 ralentit de 40 min » devienne visible
// au lieu d'être découverte à la main sur un classement.
//
// Réutilise `computeErrorMetrics` du banc historique : une SEULE définition de MAE /
// MAPE / biais / couverture dans le produit, pas deux vérités concurrentes.

import { computeErrorMetrics, type ErrorMetrics } from './engineBacktest'

/** Snapshot tel que consommé ici (sous-ensemble de `ProjectionValidationSnapshot` + résultat). */
export interface AccuracySnapshot {
  engineVersion: string
  /** Prédiction centrale figée avant la course (s). */
  predictionCentralS: number
  /** Bornes de l'intervalle : agressif = borne basse, prudent = borne haute (s). */
  predictionAggressiveS?: number | null
  predictionPrudentS?: number | null
  /** Résultat réel — temps de mouvement (s). Null tant que la course n'est pas évaluée. */
  resultMovingS?: number | null
  /** Résultat réel — temps écoulé, chrono officiel (s). */
  resultElapsedS?: number | null
  status?: string | null
  /** 'development' | 'validation' — permet d'isoler la mesure hors développement. */
  dataSplit?: string | null
}

/** Référence temporelle de comparaison. */
export type AccuracyBasis = 'moving' | 'elapsed'

export interface AccuracyGroup {
  engineVersion: string
  /** Comparé au temps de MOUVEMENT — la base sur laquelle le moteur est calibré. */
  moving: ErrorMetrics
  /** Comparé au temps ÉCOULÉ — ce que l'athlète lit sur l'horloge d'arrivée. */
  elapsed: ErrorMetrics
  /** Part des courses où le moteur a été OPTIMISTE (prédit plus rapide que le réel). */
  optimisticRate: number | null
}

export interface ProjectionAccuracyReport {
  /** Toutes versions confondues, sur le temps de mouvement. */
  overallMoving: ErrorMetrics
  /** Toutes versions confondues, sur le temps écoulé. */
  overallElapsed: ErrorMetrics
  /** Part globale de projections optimistes (null si aucune course évaluée). */
  optimisticRate: number | null
  /** Ventilation par version de moteur, la plus récente d'abord. */
  byVersion: AccuracyGroup[]
  /** Nombre de snapshots exploitables (résultat présent). */
  evaluatedCount: number
  /** Snapshots encore en attente de résultat (course à venir ou résultat non lié). */
  pendingCount: number
}

/** Vrai si le snapshot porte un résultat exploitable pour la base demandée. */
function resultFor(s: AccuracySnapshot, basis: AccuracyBasis): number | null {
  const v = basis === 'moving' ? s.resultMovingS : s.resultElapsedS
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

function isUsable(s: AccuracySnapshot): boolean {
  return (
    Number.isFinite(s.predictionCentralS) && s.predictionCentralS > 0 &&
    s.status !== 'invalidated' &&
    (resultFor(s, 'moving') != null || resultFor(s, 'elapsed') != null)
  )
}

function scoreFor(snapshots: AccuracySnapshot[], basis: AccuracyBasis) {
  const out: { predictedS: number; actualS: number; low?: number; high?: number }[] = []
  for (const s of snapshots) {
    const actual = resultFor(s, basis)
    if (actual == null) continue
    // `agressif` est la borne BASSE en temps, `prudent` la borne HAUTE.
    const low = typeof s.predictionAggressiveS === 'number' ? s.predictionAggressiveS : undefined
    const high = typeof s.predictionPrudentS === 'number' ? s.predictionPrudentS : undefined
    out.push({ predictedS: s.predictionCentralS, actualS: actual, low, high })
  }
  return out
}

/** Part des projections OPTIMISTES (prédit < réel) sur la base moving, sinon elapsed. */
function optimisticRate(snapshots: AccuracySnapshot[]): number | null {
  let n = 0
  let optimistic = 0
  for (const s of snapshots) {
    const actual = resultFor(s, 'moving') ?? resultFor(s, 'elapsed')
    if (actual == null) continue
    n += 1
    if (s.predictionCentralS < actual) optimistic += 1
  }
  return n > 0 ? optimistic / n : null
}

export interface AccuracyOptions {
  /** Ne retenir que ce `data_split` (ex. 'validation'). Absent → tout. */
  dataSplit?: string
}

/**
 * Agrège les snapshots résolus en métriques d'erreur, globales et par version de moteur.
 * Ne juge JAMAIS un snapshot invalidé, ni un snapshot sans résultat (ils sont comptés à
 * part dans `pendingCount` — une mesure honnête doit montrer ce qu'elle n'a pas mesuré).
 */
export function computeProjectionAccuracy(
  snapshots: AccuracySnapshot[],
  options: AccuracyOptions = {},
): ProjectionAccuracyReport {
  const scoped = options.dataSplit
    ? snapshots.filter((s) => s.dataSplit === options.dataSplit)
    : snapshots
  const usable = scoped.filter(isUsable)
  const pendingCount = scoped.length - usable.length

  const versions = [...new Set(usable.map((s) => s.engineVersion))].sort().reverse()
  const byVersion: AccuracyGroup[] = versions.map((engineVersion) => {
    const group = usable.filter((s) => s.engineVersion === engineVersion)
    return {
      engineVersion,
      moving: computeErrorMetrics(scoreFor(group, 'moving')),
      elapsed: computeErrorMetrics(scoreFor(group, 'elapsed')),
      optimisticRate: optimisticRate(group),
    }
  })

  return {
    overallMoving: computeErrorMetrics(scoreFor(usable, 'moving')),
    overallElapsed: computeErrorMetrics(scoreFor(usable, 'elapsed')),
    optimisticRate: optimisticRate(usable),
    byVersion,
    evaluatedCount: usable.length,
    pendingCount,
  }
}

/**
 * Verdict lisible sur un biais systématique. `meanBiasS` = prédit − réel :
 * NÉGATIF ⇒ le moteur annonce plus vite que la réalité (optimiste).
 * Prudent avec peu de courses : en dessous de `minRaces`, on ne conclut pas.
 */
export function describeBias(m: ErrorMetrics, minRaces = 3): string | null {
  if (!Number.isFinite(m.meanBiasS) || m.n < minRaces) return null
  const min = Math.round(Math.abs(m.meanBiasS) / 60)
  if (min < 1) return 'Pas de biais systématique détecté.'
  return m.meanBiasS < 0
    ? `Optimiste de ~${min} min en moyenne (annonce plus vite que le réel).`
    : `Conservateur de ~${min} min en moyenne (annonce plus lent que le réel).`
}
