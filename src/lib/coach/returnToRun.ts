// Retour à la course après coupure/blessure — protocole walk-run GRADUÉ et
// piloté par critères (douleur), jamais par le calendrier seul. Reprend la
// distance avant la vitesse, terrain plat d'abord. 100 % déterministe, pur.
//
// Réf : return-to-running guidelines (Running Physio, OSU Wexner, scoping review
// bone-stress 2024) — prérequis 30 min de marche sans douleur ; progression
// gated par règle douleur (≤ 2/10, pas d'aggravation le lendemain).

export interface RtrStep {
  /** Index de palier (1 = départ). */
  index: number
  /** Secondes de course par cycle. */
  runSec: number
  /** Secondes de marche par cycle. */
  walkSec: number
  /** Nombre de cycles. */
  cycles: number
  /** Durée totale indicative (min). */
  totalMin: number
  label: string
  /** Course continue atteinte. */
  continuous: boolean
}

// Échelle graduée : course ↑, marche ↓, jusqu'au continu. Volume ~20-30 min.
const LADDER: Array<{ runSec: number; walkSec: number; cycles: number }> = [
  { runSec: 60, walkSec: 120, cycles: 8 },   // 1' / 2' × 8  (24 min)
  { runSec: 120, walkSec: 120, cycles: 6 },  // 2' / 2' × 6  (24 min)
  { runSec: 180, walkSec: 90, cycles: 6 },   // 3' / 1'30 × 6 (27 min)
  { runSec: 240, walkSec: 60, cycles: 5 },   // 4' / 1' × 5  (25 min)
  { runSec: 360, walkSec: 60, cycles: 4 },   // 6' / 1' × 4  (28 min)
  { runSec: 540, walkSec: 60, cycles: 3 },   // 9' / 1' × 3  (30 min)
  { runSec: 840, walkSec: 60, cycles: 2 },   // 14' / 1' × 2 (30 min)
  { runSec: 1500, walkSec: 0, cycles: 1 },   // 25' continu
]

function toStep(i: number): RtrStep {
  const s = LADDER[i]
  const totalSec = (s.runSec + s.walkSec) * s.cycles
  const continuous = s.walkSec === 0
  const r = s.runSec >= 60 ? `${Math.round(s.runSec / 60)}'` : `${s.runSec}s`
  const w = s.walkSec >= 60 ? `${Math.round(s.walkSec / 60)}'` : `${s.walkSec}s`
  return {
    index: i + 1,
    runSec: s.runSec, walkSec: s.walkSec, cycles: s.cycles,
    totalMin: Math.round(totalSec / 60),
    continuous,
    label: continuous ? `${r} en continu` : `${r} course / ${w} marche × ${s.cycles}`,
  }
}

/** Protocole complet (tous les paliers). */
export function returnToRunLadder(): RtrStep[] {
  return LADDER.map((_, i) => toStep(i))
}

export interface RtrState {
  /** Palier courant (1-based). */
  step: number
  /** Nb de séances réussies (douleur ok) sur le palier courant. */
  cleanSessions: number
}

export interface RtrFeedback {
  /** Douleur 0-10 pendant/après. */
  pain: number
  /** Douleur aggravée le lendemain matin. */
  worseNextDay: boolean
}

const PAIN_OK = 2          // ≤ 2/10 toléré
const SESSIONS_TO_ADVANCE = 2 // 2 séances « propres » avant de monter d'un palier

/**
 * Décision déterministe, gated par la douleur :
 * - douleur > 2/10 ou aggravation le lendemain → on RECULE d'un palier (min 1).
 * - sinon on compte la séance ; après 2 séances propres → palier suivant.
 * Jamais piloté par le calendrier seul.
 */
export function nextReturnToRunStep(state: RtrState, fb: RtrFeedback): { state: RtrState; advanced: boolean; regressed: boolean; done: boolean } {
  const maxStep = LADDER.length
  if (fb.pain > PAIN_OK || fb.worseNextDay) {
    const step = Math.max(1, state.step - 1)
    return { state: { step, cleanSessions: 0 }, advanced: false, regressed: step < state.step, done: false }
  }
  const clean = state.cleanSessions + 1
  if (clean >= SESSIONS_TO_ADVANCE && state.step < maxStep) {
    return { state: { step: state.step + 1, cleanSessions: 0 }, advanced: true, regressed: false, done: false }
  }
  const done = state.step >= maxStep && clean >= SESSIONS_TO_ADVANCE
  return { state: { step: state.step, cleanSessions: clean }, advanced: false, regressed: false, done }
}

/** Le palier courant (séance à proposer). */
export function returnToRunStep(step: number): RtrStep {
  const i = Math.min(Math.max(step, 1), LADDER.length) - 1
  return toStep(i)
}
