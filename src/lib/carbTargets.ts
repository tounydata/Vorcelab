// Cibles glucidiques à l'effort, modernes et par DURÉE (+ entraînement digestif).
// Remplace la cible « par niveau » figée par la recommandation par durée :
// < 2 h → 60 g/h · 2-3 h → 75-90 · > 3 h → 90-120 (120 = intestin entraîné).
// Ratio glucose:fructose 1:0.8 au-delà de 60 g/h. 100 % déterministe, pur.
//
// Réf (2022-2024) : 90 vs 120 g/h (EndureIQ/PMC), gut-training (RunnersConnect).

export interface CarbTarget {
  /** Glucides par heure (g). */
  gPerH: number
  /** Ratio glucose:fructose recommandé. */
  ratio: '1:1' | '1:0.8'
  note: string
}

/** Cible de glucides/h selon la durée prévue et l'état d'entraînement digestif. */
export function carbTargetGperH(durationH: number, gutTrained = false): CarbTarget {
  if (durationH < 1) return { gPerH: 0, ratio: '1:1', note: '< 1 h : réserves suffisantes, eau' }
  if (durationH < 2) return { gPerH: 60, ratio: '1:1', note: '1-2 h : ~60 g/h' }
  if (durationH <= 3) {
    return gutTrained
      ? { gPerH: 90, ratio: '1:0.8', note: '2-3 h (intestin entraîné) : ~90 g/h' }
      : { gPerH: 75, ratio: '1:0.8', note: '2-3 h : ~75 g/h' }
  }
  return gutTrained
    ? { gPerH: 110, ratio: '1:0.8', note: '> 3 h (intestin entraîné) : 90-120 g/h' }
    : { gPerH: 90, ratio: '1:0.8', note: '> 3 h : ~90 g/h (entraîne l\'intestin pour viser plus)' }
}

/**
 * Progression d'entraînement digestif : on part de `startGperH` et on monte de
 * `perWeek` g/h par semaine jusqu'à la cible, sans la dépasser. Renvoie la cible
 * g/h pour chaque semaine restante avant la course (la dernière = `targetGperH`).
 */
export function gutTrainingProgression(
  weeksToRace: number,
  targetGperH: number,
  startGperH = 60,
  perWeek = 10,
): number[] {
  if (weeksToRace <= 0) return [targetGperH]
  const out: number[] = []
  for (let w = 0; w < weeksToRace; w++) {
    const g = Math.min(targetGperH, startGperH + perWeek * w)
    out.push(g)
  }
  // Garantit d'atteindre la cible à la dernière semaine.
  if (out[out.length - 1] < targetGperH) out[out.length - 1] = targetGperH
  return out
}
