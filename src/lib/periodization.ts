// Périodisation (Épopée C) — SOURCE DE VÉRITÉ UNIQUE des phases d'entraînement.
// Construit un macrocycle daté à rebours depuis la date d'objectif. Déterministe.
// renfoUtils.ts doit consommer getCurrentPhase()/strengthFocusForPhase() au lieu de
// sa propre horloge (Date.now() % 4) afin d'éviter deux périodisations concurrentes.

// ── Modèle ────────────────────────────────────────────────────────────────────────

export type PhaseKind = 'base' | 'build' | 'specific' | 'taper'

export interface PlanWeek {
  /** Index 0-based depuis le début du plan. */
  index: number
  /** Lundi de la semaine (ISO yyyy-mm-dd). */
  startDate: string
  phase: PhaseKind
  /** Semaine de décharge (volume réduit). */
  deload: boolean
}

export interface Plan {
  goalDistanceM: number
  goalDate: string
  weeks: PlanWeek[]
}

const MS_WEEK = 7 * 86_400_000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── C1 — Durée d'affûtage selon la distance ────────────────────────────────────────

/** Nombre de semaines de taper selon la distance d'objectif. */
export function taperWeeks(distanceM: number): number {
  if (distanceM >= 30_000) return 3 // marathon / ultra
  if (distanceM >= 15_000) return 2 // semi
  return 1 // 5-10 km
}

// ── C1 — Construction du macrocycle ────────────────────────────────────────────────

/**
 * Construit un plan daté à rebours depuis la date d'objectif.
 * Répartition : taper (fin) · spécifique ~25 % · build ~25 % · base (le reste).
 * Décharge toutes les 4 semaines hors taper (C3).
 */
export function buildPlan(goalDate: Date, weeksAvailable: number, distanceM: number): Plan {
  const totalWeeks = Math.max(1, Math.floor(weeksAvailable))
  const taper = Math.min(taperWeeks(distanceM), totalWeeks)
  const remaining = totalWeeks - taper
  const specific = Math.round(remaining * 0.25)
  const build = Math.round(remaining * 0.25)
  const base = remaining - specific - build

  // Séquence de phases du début à la fin.
  const kinds: PhaseKind[] = [
    ...Array<PhaseKind>(base).fill('base'),
    ...Array<PhaseKind>(build).fill('build'),
    ...Array<PhaseKind>(specific).fill('specific'),
    ...Array<PhaseKind>(taper).fill('taper'),
  ]

  // Date du lundi de la première semaine = goalDate − (totalWeeks−1) semaines.
  const firstStart = new Date(goalDate.getTime() - (totalWeeks - 1) * MS_WEEK)

  const weeks: PlanWeek[] = kinds.map((phase, index) => ({
    index,
    startDate: isoDate(new Date(firstStart.getTime() + index * MS_WEEK)),
    phase,
    // Décharge toutes les 4 semaines (hors taper qui est déjà allégé).
    deload: phase !== 'taper' && index > 0 && (index + 1) % 4 === 0,
  }))

  return { goalDistanceM: distanceM, goalDate: isoDate(goalDate), weeks }
}

// ── C1 — Phase courante (consommée par renfoUtils, sessionGenerator…) ──────────────

/** Retourne la semaine de plan contenant `date`, ou null si hors plan. */
export function getCurrentPhase(plan: Plan, date: Date): PlanWeek | null {
  const t = date.getTime()
  for (const w of plan.weeks) {
    const start = new Date(w.startDate).getTime()
    if (t >= start && t < start + MS_WEEK) return w
  }
  return null
}

// ── Pont vers le renforcement (résout le risque d'intégration renfoUtils) ──────────

export type StrengthFocus = 'force' | 'volume' | 'puissance' | 'deload'

/** Focus de renforcement cohérent avec la phase course (au lieu d'un cycle autonome). */
export function strengthFocusForPhase(week: PlanWeek): StrengthFocus {
  if (week.deload || week.phase === 'taper') return 'deload'
  if (week.phase === 'base') return 'force' // force lourde en base (économie de course)
  if (week.phase === 'build') return 'volume'
  return 'puissance' // specific
}

// ── C2 — Distribution d'intensité cible (80/20) par phase ──────────────────────────

/** Part d'intensité (hors zone facile) recommandée par phase. Repère 80/20. */
export function intensityShareTarget(phase: PhaseKind): number {
  switch (phase) {
    case 'base':
      return 0.1
    case 'build':
      return 0.2
    case 'specific':
      return 0.2
    case 'taper':
      return 0.15
  }
}

// ── C4 — Affûtage : modulateur de volume J-n ────────────────────────────────────────

/** Facteur de volume pendant le taper (intensité maintenue, volume réduit). */
export function taperVolumeFactor(weeksToGoal: number): number {
  if (weeksToGoal <= 0) return 0.5
  if (weeksToGoal === 1) return 0.5
  if (weeksToGoal === 2) return 0.65
  return 1
}
