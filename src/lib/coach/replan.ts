// src/lib/coach/replan.ts
// Replanification RÉACTIVE — ajuste la SEMAINE COURANTE du plan selon la charge
// RÉELLE mesurée (PMC/ACWR), pas selon le calendrier théorique. 100 % déterministe.
//
// Pourquoi réactif et basé sur la charge MESURÉE (et pas sur le journal de séances) :
// un signal tiré du journal serait fragile (beaucoup de séances ne sont pas loggées)
// → faux positifs « tu as manqué ta semaine » qui détruisent la confiance. On ne
// déclenche donc QUE sur des grandeurs mesurées du PMC (charge aiguë/chronique, forme).
//
// Deux déclencheurs, chacun adossé à la littérature :
//  • SURCHARGE — ACWR (charge aiguë:chronique) > 1.5 : zone de risque blessure
//    (Gabbett 2016). L'ACWR couplé est critiqué (Impellizzeri 2020) → on l'utilise
//    comme SIGNAL, jamais comme dogme, et uniquement franchement au-delà du seuil.
//    Action : semaine d'allègement (on retire l'intensité, on baisse le volume —
//    « réduire la charge » du deload, Mujika).
//  • REPRISE — forme très fraîche par effondrement de la charge (TSB ≫ 0, zone
//    « désentraînement ») : le coureur s'est BEAUCOUP moins entraîné que prévu →
//    on évite de le renvoyer d'emblée dans l'intensité (le travail dur porte le
//    plus de risque). Reprise progressive (garde-fou ~+10 %/sem).
//
// Jamais touché : l'AFFÛTAGE (taper) et la SEMAINE DE COURSE — déjà à charge basse
// et protégés par le générateur ; on ne perturbe pas la surcompensation finale.

import type { PlanWeek, PlannedSession } from './planGenerator'

export type ReplanTrigger = 'surcharge' | 'reprise'

export interface ReplanSignals {
  /** ACWR = charge aiguë / charge chronique (ATL/CTL). `null` si en calibrage. */
  acwrRatio: number | null
  /** TSB = CTL − ATL (forme). `null` si indisponible. */
  tsb: number | null
}

export interface ReplanResult {
  /** Les semaines, avec la semaine courante éventuellement ajustée. */
  weeks: PlanWeek[]
  trigger: ReplanTrigger | null
  /** Phrase explicative (splash + bandeau). `null` si aucun ajustement. */
  reason: string | null
  /** Étiquette courte pour l'en-tête de semaine. `null` si aucun ajustement. */
  badge: string | null
}

// Seuils (assumés, défendables) :
const ACWR_OVERLOAD = 1.5 // > zone de risque (Gabbett)
const TSB_DETRAINED = 25 // zone « désentraînement » du PMC (forme anormalement haute)

/** Une séance « dure » (intensité haute) hors course et hors sortie longue. */
function isHardQuality(s: PlannedSession): boolean {
  return s.intensity === 'hard' && s.system !== 'race' && s.system !== 'long'
}

/** Hiérarchie de dureté pour retirer LA séance la plus exigeante en premier. */
function hardnessRank(s: PlannedSession): number {
  if (s.system === 'race') return 100
  if (s.intensity === 'hard') return 3
  if (s.intensity === 'moderate') return 2
  if (s.system === 'long') return 1.5
  return 1
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/** Allègement réactif (surcharge) : on retire l'intensité dure et on baisse le volume. */
function deloadWeek(week: PlanWeek): PlanWeek {
  const sessions = week.sessions
    .filter((s) => !isHardQuality(s)) // on retire les séances dures
    .map((s) => ({ ...s, targetDurationMin: Math.round((s.targetDurationMin * 0.8) / 5) * 5 }))
  return {
    ...week,
    isRecovery: true,
    volumeHours: round1(week.volumeHours * 0.6),
    focus: 'Semaine d\'allègement réactif — ta charge aiguë est élevée, on récupère pour éviter le surmenage.',
    sessions,
  }
}

/** Reprise progressive : on retire LA séance la plus dure et on tempère le volume. */
function reentryWeek(week: PlanWeek): PlanWeek {
  let sessions = week.sessions
  // Retire la séance la plus exigeante (hors course) s'il y en a une dure.
  const hardest = [...week.sessions].sort((a, b) => hardnessRank(b) - hardnessRank(a))[0]
  if (hardest && hardest.intensity === 'hard' && hardest.system !== 'race') {
    sessions = week.sessions.filter((s) => s !== hardest)
  }
  return {
    ...week,
    volumeHours: round1(week.volumeHours * 0.85),
    focus: 'Reprise progressive — ta charge a baissé, on remonte en douceur pour éviter le pic de charge au retour.',
    sessions,
  }
}

/**
 * Applique la replanification réactive à la SEMAINE COURANTE (`weeks[0]`).
 * Retourne le plan inchangé (trigger `null`) si rien à ajuster ou si la semaine
 * courante est un affûtage / une course (jamais perturbés).
 */
export function applyReplan(weeks: PlanWeek[], signals: ReplanSignals): ReplanResult {
  const none: ReplanResult = { weeks, trigger: null, reason: null, badge: null }
  const week0 = weeks[0]
  if (!week0) return none
  // L'affûtage et la course sont sacro-saints (charge déjà basse, surcompensation).
  if (week0.phase === 'taper' || week0.phase === 'race') return none
  // Déjà une semaine de décharge planifiée → l'allègement réactif n'apporte rien.
  if (week0.isRecovery && signals.acwrRatio != null && signals.acwrRatio > ACWR_OVERLOAD) {
    return {
      weeks,
      trigger: 'surcharge',
      reason: `Ta charge aiguë est élevée (ACWR ${signals.acwrRatio.toFixed(2)}) — et tu es déjà en semaine de décharge. Reste prudent, ne rajoute pas d'intensité cette semaine.`,
      badge: 'Charge élevée',
    }
  }

  // 1) SURCHARGE (priorité) — ACWR franchement au-delà du seuil de risque.
  if (signals.acwrRatio != null && signals.acwrRatio > ACWR_OVERLOAD) {
    const adjusted = [deloadWeek(week0), ...weeks.slice(1)]
    return {
      weeks: adjusted,
      trigger: 'surcharge',
      reason: `Ta charge aiguë est élevée (ACWR ${signals.acwrRatio.toFixed(2)}, zone de risque). Je transforme ta semaine en allègement : je retire les séances dures et je réduis le volume pour éviter le surmenage.`,
      badge: 'Décharge réactive',
    }
  }

  // 2) REPRISE — forme anormalement fraîche par chute de la charge (désentraînement).
  if (signals.tsb != null && signals.tsb > TSB_DETRAINED) {
    const adjusted = [reentryWeek(week0), ...weeks.slice(1)]
    return {
      weeks: adjusted,
      trigger: 'reprise',
      reason: 'Ta charge a nettement baissé ces derniers temps. Je reprends en douceur : une séance dure en moins cette semaine, pour remonter sans pic de charge (et sans blessure) au retour.',
      badge: 'Reprise progressive',
    }
  }

  return none
}
