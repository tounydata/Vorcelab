// src/lib/racePredictor.ts
// Port TypeScript 1-pour-1 des fonctions pures de prédiction de race-predictor.js.
// Logique identique — annotations de types uniquement.
// Dépendances : computeTrainingLoad (réutilise le port TS existant, fidèle au
// legacy) ; isRun et FC_MAX_DEFAULT sont définis localement avec les MÊMES
// valeurs que le legacy (formatters.js / app-state.js) pour garantir l'égalité
// stricte de comportement.

import { computeTrainingLoad, type ActivityForLoad } from './trainingLoad'

// Identique à app-state.js (legacy) — pas la valeur 185 utilisée ailleurs en TS.
const FC_MAX_DEFAULT = 205

// Identique à formatters.js (legacy).
function isRun(t: string | null | undefined): boolean {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(t ?? '')
}

export interface RaceActivity {
  sport_type?: string | null
  type?: string | null
  average_heartrate?: number
  average_speed?: number
  distance?: number
  moving_time?: number
  start_date?: string
}

export interface FreshnessAdjustment {
  multiplier: number
  label: string | null
  loadStatus?: string
}

// ─── FRAÎCHEUR ────────────────────────────────────────────────────────────────
// Multiplicateur sur le temps de course basé sur la charge récente.
// Seuils alignés sur Gabbett 2016 (cohérents avec getLoadStatus de training-load.js).
// Plafonnés à ±4% — prudent, l'effet réel peut dépasser mais on ne surprédit pas.
// CONTINU (interpolation entre les seuils) : le ratio ACWR dérive chaque jour même
// sans activité — des paliers feraient sauter la projection de ±2-4% d'un coup en
// franchissant un seuil (= ±12-24 min sur un ultra, « sans rien faire »).

/** Interpolation linéaire du multiplicateur selon le ratio ACWR (clampé 0.99–1.04). */
export function freshnessMultiplier(r: number): number {
  if (r <= 0.80) return 0.99
  if (r <= 0.95) return 0.99 + ((r - 0.80) / 0.15) * 0.01 // 0.99 → 1.00
  if (r <= 1.15) return 1                                  // zone neutre
  if (r <= 1.30) return 1 + ((r - 1.15) / 0.15) * 0.02     // 1.00 → 1.02
  if (r <= 1.50) return 1.02 + ((r - 1.30) / 0.20) * 0.02  // 1.02 → 1.04
  return 1.04
}

export function computeFreshnessAdjustment(activities: RaceActivity[], fcMax: number, asOfMs?: number): FreshnessAdjustment {
  // `asOfMs` = horloge historique injectable (banc) : l'ACWR / la fraîcheur se
  // mesurent alors sur les jours précédant la COURSE, pas l'exécution du script.
  const load = computeTrainingLoad(activities as unknown as ActivityForLoad[], fcMax || FC_MAX_DEFAULT, asOfMs)
  if (load.ratio === null || load.count42 < 3)
    return { multiplier: 1, label: null }

  const r = load.ratio
  const multiplier = +freshnessMultiplier(r).toFixed(4)
  if (r > 1.50) return { multiplier, label: 'surcharge', loadStatus: 'overload' }
  if (r > 1.15) return { multiplier, label: 'fatigue', loadStatus: 'elevated' }
  if (r < 0.95 && multiplier < 1) return { multiplier, label: 'fraîcheur', loadStatus: 'recovery' }
  return { multiplier, label: null, loadStatus: 'stable' }
}

// ─── PROGRESSION ──────────────────────────────────────────────────────────────
// Facteur de progression depuis sessions Z3+ — version pure (pas de VLState).
export function computeProgressionFactor(activities: RaceActivity[], fcMax: number, trailOnly = false): number {
  const maxHR = fcMax || FC_MAX_DEFAULT
  const z3min = Math.round(maxHR * 0.80)
  const TRAIL = ['TrailRun', 'Trail Run']

  const sessions = (activities || []).filter(a => {
    if (!isRun(a.sport_type || a.type)) return false
    if (trailOnly && !TRAIL.includes(a.sport_type || a.type || '')) return false
    return (a.average_heartrate ?? 0) > z3min && (a.distance ?? 0) > 3000
  }).sort((a, b) => new Date(a.start_date ?? 0).getTime() - new Date(b.start_date ?? 0).getTime())

  if (sessions.length < 4 && trailOnly)
    return computeProgressionFactor(activities, fcMax, false)
  if (sessions.length < 4) return 1

  const half = Math.floor(sessions.length / 2)
  const early = sessions.slice(0, half)
  const recent = sessions.slice(-half)
  // Pondération par moving_time : une sortie de 2h Z3+ pèse 8× plus qu'une de 15min
  const weightedAvg = (arr: RaceActivity[]) => {
    const totalTime = arr.reduce((s, a) => s + (a.moving_time || 0), 0)
    return totalTime > 0
      ? arr.reduce((s, a) => s + (a.average_speed ?? 0) * (a.moving_time || 0), 0) / totalTime
      : 0
  }
  const avgE = weightedAvg(early)
  const avgR = weightedAvg(recent)
  return avgE > 0 ? Math.min(1.10, Math.max(0.90, avgR / avgE)) : 1
}
