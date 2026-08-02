// Comparaison « projection ↔ objectif saisi ».
//
// Extrait du moteur pour une raison précise : la projection affichée n'est plus
// toujours la sortie brute du moteur (la météo du jour J s'y applique désormais).
// Un verdict « Réaliste » calculé sur un temps qui n'est plus celui affiché serait
// faux ; cette fonction pure permet de le recalculer partout où le temps change,
// sans dupliquer les seuils.

export interface GoalComparison {
  goalLabel?: string
  goalCompareColor?: string
  goalCompareStr?: string
}

/** « 3h30 » / « 3h » → secondes. null si non interprétable. */
export function parseGoalTimeS(goalTime: string | null | undefined): number | null {
  if (!goalTime) return null
  const m = goalTime.match(/(\d+)[hH](\d*)/)
  if (!m) return null
  return parseInt(m[1]) * 3600 + (parseInt(m[2]) || 0) * 60
}

/**
 * Verdict sur l'objectif au regard du temps projeté. Seuils inchangés depuis le
 * moteur d'origine — cette fonction est un déplacement, pas une nouvelle règle.
 */
export function compareToGoal(estTimeS: number, goalTime: string | null | undefined): GoalComparison {
  const goalSec = parseGoalTimeS(goalTime)
  if (goalSec == null || !(goalSec > 0) || !(estTimeS > 0)) return {}

  const est = Math.round(estTimeS)
  const absDiff = Math.abs(goalSec - est)
  const diffH = Math.floor(absDiff / 3600)
  const diffM = Math.floor((absDiff % 3600) / 60)
  const diffStr = `${diffH > 0 ? diffH + 'h' : ''}${String(diffM).padStart(diffH > 0 ? 2 : 1, '0')}min`
  const ratio = est / goalSec

  if (ratio < 0.94) return { goalLabel: 'Très conservateur', goalCompareColor: 'var(--vl-text-3)', goalCompareStr: `Projection ${diffStr} plus rapide que ton objectif` }
  if (ratio < 0.97) return { goalLabel: 'Conservateur', goalCompareColor: 'var(--vl-growth)', goalCompareStr: `Projection ${diffStr} plus rapide que ton objectif` }
  if (ratio <= 1.03) return { goalLabel: 'Réaliste', goalCompareColor: 'var(--vl-growth)', goalCompareStr: 'Objectif aligné avec la projection Vorcelab' }
  if (ratio <= 1.10) return { goalLabel: 'Ambitieux', goalCompareColor: 'var(--vl-amber)', goalCompareStr: `Objectif ${diffStr} plus rapide que la projection Vorcelab` }
  return { goalLabel: 'Très ambitieux', goalCompareColor: 'var(--vl-ember)', goalCompareStr: `Objectif ${diffStr} plus rapide que la projection Vorcelab` }
}
