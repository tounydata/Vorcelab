// Orientation d'entraînement (cf. knowledge-base §10.2). Biaise l'EMPHASE du
// plan — volume + nombre/intensité des séances qualité — sans toucher à la
// périodisation ni à la sécurité (ACWR, interférence, taper).

export type CoachMotivation = 'plaisir' | 'mix' | 'performance'

export interface MotivationBias {
  /** Multiplicateur du volume hebdo cible. */
  volumeScale: number
  /** Séances qualité max par semaine. */
  maxQualityPerWeek: number
  /** Autorise les séances très dures (VO2max / fractionné court). */
  allowHardIntensity: boolean
  label: string
  note: string
}

export const MOTIVATION_LABELS: Record<CoachMotivation, string> = {
  plaisir: 'Plaisir',
  mix: 'Équilibre',
  performance: 'Performance',
}

export function motivationBias(m: CoachMotivation | null | undefined): MotivationBias {
  switch (m) {
    case 'plaisir':
      return {
        volumeScale: 0.82, maxQualityPerWeek: 1, allowHardIntensity: false,
        label: 'Plaisir',
        note: "Volume allégé, surtout de l'aérobie facile et de la variété, peu de séances dures — on protège l'envie de revenir.",
      }
    case 'performance':
      return {
        volumeScale: 1.06, maxQualityPerWeek: 2, allowHardIntensity: true,
        label: 'Performance',
        note: 'Volume plein, 2 séances qualité par semaine (seuil + VO2max/spécifique), distribution polarisée 80/20.',
      }
    case 'mix':
    default:
      return {
        volumeScale: 1.0, maxQualityPerWeek: 2, allowHardIntensity: true,
        label: 'Équilibre',
        note: 'Compromis volume / intensité — polarisé souple, 1 à 2 qualités selon la phase.',
      }
  }
}
