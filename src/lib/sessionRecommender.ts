// Moteur de recommandation de séances (Épopée B+ — choix-first).
// Vorcelab NE PRESCRIT JAMAIS « la séance du jour » : l'athlète choisit librement.
// Ce module se contente de SCORER des séances candidates et d'y apposer un BADGE
// d'information (recommandée, récup conseillée, déjà faite…). Il ne retire ni
// n'impose jamais une séance. Pur, déterministe, sans signal appareil.

import type { PhaseKind } from './periodization'

export type SessionCategory =
  | 'recovery'
  | 'easy'
  | 'long'
  | 'tempo'
  | 'cruise'
  | 'vo2'
  | 'hill'
  | 'race_pace'

export type Hardness = 'easy' | 'quality' | 'hard'

export const CATEGORY_HARDNESS: Record<SessionCategory, Hardness> = {
  recovery: 'easy',
  easy: 'easy',
  long: 'quality',
  tempo: 'quality',
  cruise: 'quality',
  race_pace: 'quality',
  vo2: 'hard',
  hill: 'hard',
}

// Catégories mises en avant par phase (issu de la périodisation).
const PHASE_FAVORS: Record<PhaseKind, SessionCategory[]> = {
  base: ['easy', 'long', 'hill'],
  build: ['tempo', 'cruise', 'vo2'],
  specific: ['race_pace', 'cruise', 'tempo'],
  taper: ['easy', 'recovery'],
}

export interface RecommendContext {
  /** Phase du plan (periodization). */
  phase?: PhaseKind | null
  /** Ratio charge aiguë/chronique (trainingLoad). */
  acwr?: number | null
  /** Surcharge confirmée (safetyGuards.detectOverload). */
  overload?: boolean
  /** Jours depuis la dernière séance dure. */
  daysSinceHard?: number | null
  /** Catégories déjà faites récemment (semaine). */
  recentCategories?: SessionCategory[]
}

export type BadgeKind = 'recommended' | 'recovery' | 'caution' | 'repeat' | null

export interface Recommendation {
  category: SessionCategory
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

function scoreOf(cat: SessionCategory, ctx: RecommendContext): number {
  const hardness = CATEGORY_HARDNESS[cat]
  let s = 0
  if (ctx.phase && PHASE_FAVORS[ctx.phase].includes(cat)) s += 2
  if (highLoad(ctx)) {
    if (hardness === 'easy') s += 3
    else if (hardness === 'hard') s -= 3
    else s -= 1
  }
  if (recentHard(ctx)) {
    if (hardness === 'hard') s -= 3
    else if (hardness === 'quality') s -= 1
    else s += 1
  }
  if (ctx.recentCategories?.includes(cat)) s -= 1
  return s
}

/**
 * Annote chaque séance candidate d'un score et d'un badge. Retourne TOUJOURS toutes
 * les candidates (choix-first) — l'UI laisse l'athlète piocher ce qu'il veut.
 */
export function recommendSessions(
  candidates: SessionCategory[],
  ctx: RecommendContext,
): Recommendation[] {
  const scored = candidates.map((category) => ({ category, score: scoreOf(category, ctx) }))

  // Meilleure séance (première en cas d'égalité) → badge « recommandée ».
  let topIdx = -1
  scored.forEach((r, i) => {
    if (topIdx < 0 || r.score > scored[topIdx].score) topIdx = i
  })

  return scored.map((r, i) => {
    const hardness = CATEGORY_HARDNESS[r.category]
    let badge: BadgeKind = null
    let reason = ''
    if (i === topIdx) {
      badge = 'recommended'
      const favored = ctx.phase ? PHASE_FAVORS[ctx.phase].includes(r.category) : false
      reason = favored ? `Colle à ta phase « ${ctx.phase} »` : 'Bon équilibre pour aujourd’hui'
    } else if (highLoad(ctx) && hardness === 'easy') {
      badge = 'recovery'
      reason = 'Charge élevée — une séance facile fait du bien'
    } else if (hardness === 'hard' && (ctx.overload || recentHard(ctx))) {
      badge = 'caution'
      reason = 'Tu as forcé récemment — peut-être plutôt un autre jour'
    } else if (ctx.recentCategories?.includes(r.category)) {
      badge = 'repeat'
      reason = 'Déjà fait cette semaine'
    }
    return { category: r.category, score: r.score, badge, reason }
  })
}

/** Libellés FR des badges (pour l'UI). */
export const BADGE_LABEL: Record<Exclude<BadgeKind, null>, string> = {
  recommended: '✦ Recommandée',
  recovery: 'Récup conseillée',
  caution: 'Plutôt un autre jour',
  repeat: 'Déjà faite',
}
