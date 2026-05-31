// Moteur de recommandation de séances (choix-first) — opère sur le CATALOGUE EXISTANT
// (lib/coach/workouts.ts). Vorcelab NE PRESCRIT JAMAIS : l'athlète choisit librement ;
// ce module se contente de SCORER les séances candidates et d'y apposer un BADGE
// d'information. Il ne retire ni n'impose jamais une séance. Pur, déterministe.

import type { WorkoutTemplate, Phase, WorkoutSystem } from './coach/workouts'

export interface RecommendContext {
  /** Phase du plan (lib/coach planGenerator). */
  phase?: Phase | null
  /** Ratio charge aiguë/chronique (trainingLoad). */
  acwr?: number | null
  /** Surcharge confirmée (safetyGuards.detectOverload). */
  overload?: boolean
  /** Jours depuis la dernière séance dure. */
  daysSinceHard?: number | null
  /** Systèmes de séances déjà faits récemment (semaine). */
  recentSystems?: WorkoutSystem[]
}

export type BadgeKind = 'recommended' | 'recovery' | 'caution' | 'repeat' | null

export interface Recommendation {
  workoutId: string
  score: number
  badge: BadgeKind
  /** Justification courte et non prescriptive. */
  reason: string
}

function highLoad(ctx: RecommendContext): boolean {
  return ctx.overload === true || (typeof ctx.acwr === 'number' && ctx.acwr > 1.3)
}

function recentHard(ctx: RecommendContext): boolean {
  return typeof ctx.daysSinceHard === 'number' && ctx.daysSinceHard < 2
}

function scoreOf(t: WorkoutTemplate, ctx: RecommendContext): number {
  let s = 0
  if (ctx.phase && t.phases.includes(ctx.phase)) s += 2
  if (highLoad(ctx)) {
    if (t.intensity === 'easy') s += 3
    else if (t.intensity === 'hard') s -= 3
    else s -= 1
  }
  if (recentHard(ctx)) {
    if (t.intensity === 'hard') s -= 3
    else if (t.intensity === 'moderate') s -= 1
    else s += 1
  }
  if (ctx.recentSystems?.includes(t.system)) s -= 1
  return s
}

/**
 * Annote chaque séance candidate d'un score et d'un badge. Retourne TOUJOURS toutes
 * les candidates (choix-first) — l'UI laisse l'athlète piocher ce qu'il veut.
 */
export function recommendWorkouts(
  templates: readonly WorkoutTemplate[],
  ctx: RecommendContext,
): Recommendation[] {
  const scored = templates.map((t) => ({ t, score: scoreOf(t, ctx) }))

  // Meilleure séance (première en cas d'égalité) — sauf si aucun signal ne différencie.
  let topIdx = -1
  scored.forEach((r, i) => {
    if (topIdx < 0 || r.score > scored[topIdx].score) topIdx = i
  })
  const allEqual = scored.every((r) => r.score === scored[0].score)

  return scored.map((r, i) => {
    let badge: BadgeKind = null
    let reason = ''
    if (i === topIdx && !allEqual) {
      badge = 'recommended'
      const favored = ctx.phase ? r.t.phases.includes(ctx.phase) : false
      reason = favored ? `Colle à ta phase « ${ctx.phase} »` : 'Bon équilibre pour aujourd’hui'
    } else if (highLoad(ctx) && r.t.intensity === 'easy') {
      badge = 'recovery'
      reason = 'Charge élevée — une séance facile fait du bien'
    } else if (r.t.intensity === 'hard' && (ctx.overload || recentHard(ctx))) {
      badge = 'caution'
      reason = 'Tu as forcé récemment — peut-être plutôt un autre jour'
    } else if (ctx.recentSystems?.includes(r.t.system)) {
      badge = 'repeat'
      reason = 'Déjà fait cette semaine'
    }
    return { workoutId: r.t.id, score: r.score, badge, reason }
  })
}

/** Libellés FR des badges (pour l'UI). */
export const BADGE_LABEL: Record<Exclude<BadgeKind, null>, string> = {
  recommended: '✦ Recommandée',
  recovery: 'Récup conseillée',
  caution: 'Plutôt un autre jour',
  repeat: 'Déjà faite',
}
