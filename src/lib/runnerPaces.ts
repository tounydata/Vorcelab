// Dérive les allures réelles d'un coureur depuis ses données de profil.
// Priorité : records perso NUMÉRIQUES ({timeS, dist}) → sinon VO2max saisie (proxy).
// Défensif : ignore les PR non numériques (ex. format lisible "50:00") sans planter.
// Pur, réutilise paceEngine. Aucune dépendance React/réseau.

import {
  computeVdot,
  trainingPaces,
  thresholdPaceSecPerKm,
  vdotConfidence,
  type Confidence,
  type PaceZone,
  type PaceRange,
} from './paceEngine'

export interface PrEntry {
  timeS?: number | null
  dist?: number | null
}

// ── VDOT AUTO : PR dérivés des COURSES ÉTIQUETÉES (sans saisie manuelle) ─────────
// Convergence avec le Facteur d'Intensité de Course : même source (courses
// étiquetées Strava « Course » ou Vorcelab). Route/plat uniquement (le trail
// fausserait le VDOT « plat » du moteur d'allures). Aucune invention.
interface AutoActivity {
  type?: string | null
  sport_type?: string | null
  distance?: number | null
  moving_time?: number | null
  total_elevation_gain?: number | null
  is_race?: boolean | null
  /** Soit aliasé en colonne (raw_data->workout_type), soit dans raw_data. */
  workout_type?: unknown
  raw_data?: { workout_type?: unknown } | null
}

const STD_DISTANCES: { key: string; m: number }[] = [
  { key: '5k', m: 5000 }, { key: '10k', m: 10000 }, { key: '15k', m: 15000 },
  { key: 'semi', m: 21097 }, { key: 'marathon', m: 42195 },
]

function isRaceEffort(a: AutoActivity): boolean {
  if (a.is_race === true) return true // étiquette Vorcelab
  const wt = a.workout_type ?? a.raw_data?.workout_type
  return wt === 1 || wt === '1' // Strava « Course »
}

/**
 * Dérive un objet de PR depuis les courses ÉTIQUETÉES de l'athlète, pour obtenir
 * le VDOT sans aucune saisie. Bucket par distance standard (±12 %), meilleur
 * temps gardé. Route/plat seulement (D+/km < 18). `null` si rien d'exploitable.
 */
export function deriveAutoPrs(activities?: AutoActivity[] | null): Record<string, PrEntry> | null {
  if (!activities?.length) return null
  const RUN = ['Run', 'TrailRun', 'Trail Run', 'VirtualRun']
  const best: Record<string, PrEntry> = {}
  for (const a of activities) {
    if (!isRaceEffort(a)) continue
    if (!RUN.includes(a.sport_type || a.type || '')) continue
    const dist = a.distance ?? 0, time = a.moving_time ?? 0
    if (dist < 2000 || time < 300) continue
    if (((a.total_elevation_gain ?? 0) / (dist / 1000)) > 18) continue // plat uniquement
    const sd = STD_DISTANCES.find((s) => Math.abs(dist - s.m) / s.m <= 0.12)
    if (!sd) continue
    const cur = best[sd.key]
    if (!cur || dist / time > (cur.dist as number) / (cur.timeS as number)) {
      best[sd.key] = { timeS: Math.round(time), dist: Math.round(dist) }
    }
  }
  return Object.keys(best).length ? best : null
}

export interface RunnerPaces {
  vdot: number
  source: 'race_pr' | 'vo2max'
  confidence: Confidence
  paces: Record<PaceZone, PaceRange>
  thresholdSecPerKm: number
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/**
 * Dérive les allures d'entraînement. Retourne `null` si aucune donnée exploitable
 * (le composant affiche alors un état vide, jamais d'erreur).
 */
export function deriveRunnerPaces(
  prs?: Record<string, unknown> | null,
  vo2max?: number | null,
): RunnerPaces | null {
  // 1) Meilleur VDOT depuis des PR numériques exploitables.
  let best: { vdot: number; dist: number } | null = null
  if (prs && typeof prs === 'object') {
    for (const raw of Object.values(prs)) {
      const v = raw as PrEntry | null
      if (v && typeof v.timeS === 'number' && typeof v.dist === 'number' && v.timeS > 0 && v.dist >= 1000) {
        const vdot = computeVdot({ distanceM: v.dist, timeSec: v.timeS })
        if (!best || vdot > best.vdot) best = { vdot, dist: v.dist }
      }
    }
  }
  if (best) {
    return {
      vdot: round1(best.vdot),
      source: 'race_pr',
      confidence: vdotConfidence(best.dist),
      paces: trainingPaces(best.vdot),
      thresholdSecPerKm: thresholdPaceSecPerKm(best.vdot),
    }
  }

  // 2) Fallback : VO2max saisie ≈ VDOT (proxy approximatif, confiance faible).
  if (typeof vo2max === 'number' && vo2max > 0) {
    return {
      vdot: round1(vo2max),
      source: 'vo2max',
      confidence: 'low',
      paces: trainingPaces(vo2max),
      thresholdSecPerKm: thresholdPaceSecPerKm(vo2max),
    }
  }

  return null
}
