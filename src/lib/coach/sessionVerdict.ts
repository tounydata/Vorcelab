// Moteur de VERDICT de séance (V1) — compile l'écart entre la consigne et le
// réalisé (allure, FC vs zone, dérive cardiaque, D+) + le ressenti (RPE), puis
// rend un verdict déterministe : trop_facile / conforme / trop_dur / manquée.
//
// 100 % déterministe, aucune IA, aucune donnée envoyée à l'extérieur.
// Pur et testable : aucune dépendance UI/réseau.

import { trainingPaces, hrFromMax, type PaceZone, type PaceRange } from '../paceEngine'
import type { WorkoutSystem, WorkoutTemplate } from './workouts'

export type SessionVerdict = 'trop_facile' | 'conforme' | 'trop_dur' | 'manquee'
export type AxisStatus = 'easier' | 'on' | 'harder' | 'unknown'
export type VerdictConfidence = 'low' | 'medium' | 'high'

/** Cible dérivée de la séance prévue (consigne). */
export interface SessionTarget {
  zone: PaceZone
  /** Allure cible (s/km). null si non calculable (VDOT manquant). */
  paceRange: PaceRange | null
  /** Plage FC cible en bpm (dérivée de %FCmax). null si FCmax inconnue. */
  hrRange: { min: number; max: number } | null
  /** Séance continue (E/M/T) → l'allure moyenne est comparable ; sinon (intervalles) non. */
  continuous: boolean
  /** Séance avec dénivelé attendu (côtes, trail). */
  expectDplus: boolean
}

/** Réalisé extrait de l'activité liée (Strava). Tout champ peut manquer. */
export interface SessionActual {
  avgPaceSecPerKm: number | null
  avgHrPctMax: number | null
  driftPct: number | null
  dplusM: number | null
  durationMin: number | null
}

/** Ressenti de l'athlète (toujours disponible, même sans activité). */
export interface SessionRpe {
  // Échelle de difficulté ressentie. 'good' = conforme aux attentes (et NON « trop
  // facile ») ; 'too_easy'/'too_hard' = extrêmes ; 'meh' = mitigé (neutre).
  // ('ok'/'bad' conservés pour les données historiques.)
  feeling: 'too_easy' | 'good' | 'meh' | 'too_hard' | 'ok' | 'bad' | null
  /** RPE 1–10 (optionnel, prioritaire sur `feeling` s'il est fourni). */
  rpe: number | null
  /** L'athlète a signalé une douleur. */
  pain: boolean
}

export interface VerdictSignal {
  axis: 'allure' | 'fc' | 'derive' | 'ressenti'
  status: AxisStatus
  label: string
}

export interface VerdictResult {
  verdict: SessionVerdict
  confidence: VerdictConfidence
  signals: VerdictSignal[]
  /** Phrase courte et explicite (FR) pour l'athlète. */
  summary: string
}

// ── Dérivation de la cible depuis la séance prévue ───────────────────────────

const SYSTEM_ZONE: Record<WorkoutSystem, PaceZone> = {
  recovery: 'E', endurance: 'E', long: 'E',
  tempo: 'T', threshold: 'T', race_pace: 'M',
  vo2max: 'I', hills: 'I', speed: 'R', descent: 'E',
  strength: 'E', race: 'M',
}
// Séances « continues » : l'allure moyenne de l'activité est comparable à la cible.
const CONTINUOUS_SYSTEMS: WorkoutSystem[] = ['recovery', 'endurance', 'long', 'tempo', 'threshold', 'race_pace']
// Plage %FCmax indicative par zone (Daniels / zones FC usuelles).
const ZONE_HR_PCT: Record<PaceZone, { min: number; max: number }> = {
  E: { min: 0.65, max: 0.78 }, M: { min: 0.78, max: 0.86 }, T: { min: 0.84, max: 0.91 },
  I: { min: 0.91, max: 0.97 }, R: { min: 0.90, max: 1.0 },
}

export function deriveSessionTarget(
  template: Pick<WorkoutTemplate, 'system' | 'climbing'>,
  vdot: number | null | undefined,
  fcMax: number | null | undefined,
): SessionTarget {
  const zone = SYSTEM_ZONE[template.system]
  const paceRange = vdot && vdot > 0 ? trainingPaces(vdot)[zone] : null
  const pct = ZONE_HR_PCT[zone]
  const hrRange = fcMax && fcMax > 0
    ? { min: hrFromMax(fcMax, pct.min), max: hrFromMax(fcMax, pct.max) }
    : null
  return {
    zone,
    paceRange,
    hrRange,
    continuous: CONTINUOUS_SYSTEMS.includes(template.system),
    expectDplus: !!template.climbing,
  }
}

// ── Compilation des signaux ──────────────────────────────────────────────────

/** Tolérance d'allure (s/km) autour de la plage cible avant de juger trop dur/facile. */
const PACE_PAD = 12

function paceAxis(target: SessionTarget, actual: SessionActual): VerdictSignal {
  const p = actual.avgPaceSecPerKm
  if (!target.continuous || target.paceRange == null || p == null) {
    return { axis: 'allure', status: 'unknown', label: 'Allure non comparable' }
  }
  const { fastSecPerKm: fast, slowSecPerKm: slow } = target.paceRange
  if (p < fast - PACE_PAD) return { axis: 'allure', status: 'harder', label: 'Plus rapide que la cible' }
  if (p > slow + PACE_PAD) return { axis: 'allure', status: 'easier', label: 'Plus lent que la cible' }
  return { axis: 'allure', status: 'on', label: 'Allure dans la cible' }
}

function hrAxis(target: SessionTarget, actual: SessionActual): VerdictSignal {
  const pct = actual.avgHrPctMax
  if (target.hrRange == null || pct == null) {
    return { axis: 'fc', status: 'unknown', label: 'FC non disponible' }
  }
  const z = ZONE_HR_PCT[target.zone]
  if (pct > z.max + 0.03) return { axis: 'fc', status: 'harder', label: 'FC au-dessus de la zone' }
  if (pct < z.min - 0.03) return { axis: 'fc', status: 'easier', label: 'FC sous la zone' }
  return { axis: 'fc', status: 'on', label: 'FC dans la zone' }
}

function driftAxis(actual: SessionActual): VerdictSignal {
  const d = actual.driftPct
  if (d == null) return { axis: 'derive', status: 'unknown', label: 'Dérive non mesurée' }
  if (d > 10) return { axis: 'derive', status: 'harder', label: 'Dérive cardiaque marquée' }
  if (d <= 5) return { axis: 'derive', status: 'on', label: 'Dérive cardiaque stable' }
  return { axis: 'derive', status: 'on', label: 'Dérive cardiaque modérée' }
}

function rpeAxis(rpe: SessionRpe): VerdictSignal {
  // RPE explicite prioritaire ; sinon le ressenti emoji.
  if (rpe.rpe != null) {
    if (rpe.rpe >= 8) return { axis: 'ressenti', status: 'harder', label: `Ressenti dur (RPE ${rpe.rpe})` }
    if (rpe.rpe <= 3) return { axis: 'ressenti', status: 'easier', label: `Ressenti facile (RPE ${rpe.rpe})` }
    return { axis: 'ressenti', status: 'on', label: `Ressenti correct (RPE ${rpe.rpe})` }
  }
  // « Bien » = conforme aux attentes (status 'on'), PAS « trop facile » : un footing
  // facile vécu confortablement est exactement ce qu'on vise. Seuls les extrêmes
  // explicites déplacent l'axe ressenti.
  if (rpe.feeling === 'too_easy') return { axis: 'ressenti', status: 'easier', label: 'Ressenti : trop facile' }
  if (rpe.feeling === 'too_hard' || rpe.feeling === 'bad') return { axis: 'ressenti', status: 'harder', label: 'Ressenti : trop dur' }
  if (rpe.feeling === 'good') return { axis: 'ressenti', status: 'on', label: 'Ressenti : bien' }
  if (rpe.feeling === 'meh' || rpe.feeling === 'ok') return { axis: 'ressenti', status: 'on', label: 'Ressenti : bof' }
  return { axis: 'ressenti', status: 'unknown', label: 'Pas de ressenti' }
}

export function compileSessionSignals(
  target: SessionTarget,
  actual: SessionActual,
  rpe: SessionRpe,
): VerdictSignal[] {
  return [paceAxis(target, actual), hrAxis(target, actual), driftAxis(actual), rpeAxis(rpe)]
}

// ── Verdict ──────────────────────────────────────────────────────────────────

// Poids de chaque axe dans le score de difficulté (+ = trop dur, − = trop facile).
const AXIS_WEIGHT: Record<VerdictSignal['axis'], number> = {
  ressenti: 1.0, fc: 1.05, derive: 0.7, allure: 0.8,
}

/**
 * Verdict déterministe. `hasActivity = false` + aucun ressenti → séance manquée.
 * Sinon, score = Σ poids·signe(status) ; bornes symétriques → verdict.
 */
export function computeSessionVerdict(
  target: SessionTarget,
  actual: SessionActual,
  rpe: SessionRpe,
  hasActivity: boolean,
): VerdictResult {
  const signals = compileSessionSignals(target, actual, rpe)
  const known = signals.filter((s) => s.status !== 'unknown')

  if (!hasActivity && rpe.feeling == null && rpe.rpe == null) {
    return {
      verdict: 'manquee',
      confidence: 'low',
      signals,
      summary: 'Séance non réalisée ou sans retour — on la considère comme manquée.',
    }
  }

  let score = 0
  for (const s of signals) {
    const sign = s.status === 'harder' ? 1 : s.status === 'easier' ? -1 : 0
    score += sign * AXIS_WEIGHT[s.axis]
  }

  let verdict: SessionVerdict
  if (score >= 1.0) verdict = 'trop_dur'
  else if (score <= -1.0) verdict = 'trop_facile'
  else verdict = 'conforme'

  // La douleur ne baisse jamais en « trop facile » : on reste prudent.
  if (rpe.pain && verdict === 'trop_facile') verdict = 'conforme'

  // Confiance : activité + FC + ressenti = haute ; ressenti seul = basse.
  const hasHr = actual.avgHrPctMax != null
  let confidence: VerdictConfidence = 'low'
  if (hasActivity && hasHr && known.length >= 3) confidence = 'high'
  else if (hasActivity && known.length >= 2) confidence = 'medium'

  return { verdict, confidence, signals, summary: summarize(verdict, confidence, hasActivity) }
}

function summarize(v: SessionVerdict, c: VerdictConfidence, hasActivity: boolean): string {
  const base: Record<SessionVerdict, string> = {
    trop_dur: 'Séance plus dure que prévu — on lèvera le pied sur la prochaine qualité.',
    conforme: 'Séance conforme à la consigne — on poursuit la progression prévue.',
    trop_facile: 'Séance très facile — on pourra progresser un peu au prochain bloc.',
    manquee: 'Séance manquée — on recale sans empiler.',
  }
  const src = hasActivity ? '' : ' (estimé sur ton ressenti seul)'
  const conf = c === 'low' ? ' À confirmer.' : ''
  return base[v] + src + conf
}
