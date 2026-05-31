// Générateur de séances (Épopée B) — fabrique des séances CHIFFRÉES à partir des
// allures du paceEngine (Épopée A). Déterministe, pures fonctions, sans signal appareil.
// Complète sessionQuality.ts qui, lui, CLASSIFIE les séances déjà courues.

import { trainingPaces, thresholdPaceSecPerKm, type PaceZone } from './paceEngine'

// ── Modèle ────────────────────────────────────────────────────────────────────────

export type WorkoutType =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'cruise'
  | 'vo2_30_30'
  | 'vo2_reps'
  | 'race_pace'
  | 'hill'
  | 'strides'

export interface Block {
  kind: 'warmup' | 'main' | 'recovery' | 'cooldown'
  label: string
  reps?: number
  durationSec?: number
  distanceM?: number
  zone?: PaceZone
  paceSecPerKm?: number
  rpe?: number
}

export interface Workout {
  type: WorkoutType
  intent: string
  blocks: Block[]
  totalMin: number
}

/** RPE indicatif par zone d'allure (échelle 1-10). */
export const ZONE_RPE: Record<PaceZone, number> = { E: 3, M: 5, T: 7, I: 9, R: 10 }

const WARMUP_MIN = 15
const COOLDOWN_MIN = 10

function totalMinutes(blocks: Block[]): number {
  const sec = blocks.reduce((acc, b) => {
    const reps = b.reps ?? 1
    return acc + (b.durationSec ?? 0) * reps
  }, 0)
  return Math.round(sec / 60)
}

function warmup(): Block {
  return { kind: 'warmup', label: 'Échauffement progressif', durationSec: WARMUP_MIN * 60, zone: 'E' }
}
function cooldown(): Block {
  return { kind: 'cooldown', label: 'Retour au calme', durationSec: COOLDOWN_MIN * 60, zone: 'E' }
}

function withFraming(type: WorkoutType, intent: string, mainBlocks: Block[]): Workout {
  const blocks = [warmup(), ...mainBlocks, cooldown()]
  return { type, intent, blocks, totalMin: totalMinutes(blocks) }
}

// ── B1 — Footing & sortie longue ──────────────────────────────────────────────────

export function easyRun(vdot: number, durationMin: number): Workout {
  const pace = trainingPaces(vdot).E
  return {
    type: 'easy',
    intent: 'Endurance fondamentale : construire la base aérobie sans fatiguer.',
    blocks: [
      {
        kind: 'main',
        label: 'Footing facile',
        durationSec: durationMin * 60,
        zone: 'E',
        paceSecPerKm: Math.round(pace.slowSecPerKm),
        rpe: ZONE_RPE.E,
      },
    ],
    totalMin: durationMin,
  }
}

// ── B2 — Seuil (continu / cruise) + plafond de volume ──────────────────────────────

/**
 * Plafond de volume au seuil : ≤ 10 % du km hebdo (Daniels T-pace).
 * Renvoie le nombre de minutes max à T-pace dans la semaine.
 */
export function thresholdWeeklyCapMin(weeklyKm: number, vdot: number): number {
  const tPaceSecPerKm = thresholdPaceSecPerKm(vdot)
  const capKm = 0.1 * weeklyKm
  return Math.round((capKm * tPaceSecPerKm) / 60)
}

export function tempoRun(vdot: number, mainMin: number): Workout {
  const t = Math.round(thresholdPaceSecPerKm(vdot))
  return withFraming('tempo', 'Repousser le seuil : tenir une allure « comfortably hard ».', [
    {
      kind: 'main',
      label: `Tempo continu ${mainMin} min`,
      durationSec: mainMin * 60,
      zone: 'T',
      paceSecPerKm: t,
      rpe: ZONE_RPE.T,
    },
  ])
}

export function cruiseIntervals(vdot: number, reps: number, repMin: number, recoverySec = 60): Workout {
  const t = Math.round(thresholdPaceSecPerKm(vdot))
  return withFraming('cruise', 'Volume au seuil fractionné : plus de temps à T-pace, fatigue moindre.', [
    {
      kind: 'main',
      label: `${reps} × ${repMin} min @ seuil`,
      reps,
      durationSec: repMin * 60,
      zone: 'T',
      paceSecPerKm: t,
      rpe: ZONE_RPE.T,
    },
    {
      kind: 'recovery',
      label: 'Récupération trot',
      reps: reps - 1,
      durationSec: recoverySec,
      zone: 'E',
    },
  ])
}

// ── B1/B2 — VO2max ─────────────────────────────────────────────────────────────────

export function vo2_30_30(vdot: number, reps: number): Workout {
  const i = Math.round(trainingPaces(vdot).I.fastSecPerKm)
  return withFraming('vo2_30_30', 'Puissance aérobie : accumuler du temps proche de VO2max.', [
    { kind: 'main', label: `${reps} × 30 s @ ~VMA`, reps, durationSec: 30, zone: 'I', paceSecPerKm: i, rpe: ZONE_RPE.I },
    { kind: 'recovery', label: '30 s récup active', reps, durationSec: 30, zone: 'E' },
  ])
}

// ── B3 — Côte (paramétrage par objectif, pilotage RPE/FC, pas allure) ──────────────

export type HillGoal = 'force' | 'puissance_aerobie' | 'seuil'

export interface HillSpec {
  goal: HillGoal
  gradeMinPct: number
  gradeMaxPct: number
  repSec: number
  reps: number
  recoveryRatio: number // récup = repSec × ratio
  rpe: number
  note: string
}

const HILL_SPECS: Record<HillGoal, Omit<HillSpec, 'goal' | 'reps'>> = {
  force: { gradeMinPct: 8, gradeMaxPct: 15, repSec: 12, recoveryRatio: 8, rpe: 9, note: 'Quasi-maximal, récup complète (descente marchée).' },
  puissance_aerobie: { gradeMinPct: 4, gradeMaxPct: 8, repSec: 120, recoveryRatio: 1, rpe: 9, note: 'Effort ~5 km, récup descente trot.' },
  seuil: { gradeMinPct: 3, gradeMaxPct: 6, repSec: 240, recoveryRatio: 0.5, rpe: 7, note: 'Endurance de force, RPE seuil.' },
}

/** Paramètres d'une séance de côte selon l'objectif. Pilotage RPE/FC (la pente fausse l'allure). */
export function hillSpec(goal: HillGoal, reps: number): HillSpec {
  return { goal, reps, ...HILL_SPECS[goal] }
}

export function hillSession(goal: HillGoal, reps: number): Workout {
  const s = hillSpec(goal, reps)
  return withFraming('hill', `Côte (${goal}) — force spécifique sans traumatisme d'impact.`, [
    {
      kind: 'main',
      label: `${reps} × ${s.repSec}s en côte ${s.gradeMinPct}-${s.gradeMaxPct}% — ${s.note}`,
      reps,
      durationSec: s.repSec,
      rpe: s.rpe,
    },
    {
      kind: 'recovery',
      label: 'Récupération (descente)',
      reps,
      durationSec: Math.round(s.repSec * s.recoveryRatio),
      zone: 'E',
    },
  ])
}

// ── B4 — Strides (hors quota d'intensité 80/20) ────────────────────────────────────

/** Lignes droites / strides : neuromusculaire, NE comptent PAS comme séance dure. */
export function strides(reps = 6): Block {
  return {
    kind: 'main',
    label: `${reps} × 20 s lignes droites (récup marchée complète)`,
    reps,
    durationSec: 20,
    zone: 'R',
    rpe: 6,
  }
}

/** Marqueur : les strides sont exclus du quota d'intensité 80/20. */
export const STRIDES_COUNT_AS_INTENSITY = false
