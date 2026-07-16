// Versionnement du moteur de projection + explicabilité.
//
// Objectif (roadmap) : chaque projection doit pouvoir être reliée à la version du
// moteur et du profil qui l'ont produite, à la part de chaque source (historique,
// VAM, pente, terrain, météo, charge, repli générique), à un niveau de confiance,
// et à un intervalle bas/central/haut — afin de comparer les versions du moteur et
// de rester honnête (les replis génériques sont marqués à confiance faible).
//
// Logique PURE (aucune dépendance) → testable et réutilisable web/mobile.

/** Version du moteur de projection. À incrémenter à chaque changement de formule
 *  ou de coefficient susceptible de modifier une projection. */
export const ENGINE_VERSION = '2026.07-3'

export type ProjectionSource =
  | 'history' // historique réel d'allures/courses
  | 'past_races' // résultats de courses passées
  | 'vam' // vitesse ascensionnelle mesurée
  | 'gradient' // ajustement de pente
  | 'terrain' // type de terrain (route/trail/technicité)
  | 'weather' // conditions météo
  | 'load' // charge d'entraînement
  | 'fallback' // repli générique (aucune donnée) → confiance faible

export type Confidence = 'high' | 'medium' | 'low'

export interface ProjectionSourceContribution {
  source: ProjectionSource
  /** Poids relatif (>= 0) de cette source dans la projection. Normalisé à la sortie. */
  weight: number
  detail?: string
}

export interface VersionedProjection {
  engineVersion: string
  profileVersion: string | null
  computedAt: string // ISO 8601
  confidence: Confidence
  lowS: number
  centralS: number
  highS: number
  usedFallback: boolean
  /** Part (0..1) de chaque source — somme = 1 (sauf si aucune contribution). */
  explanations: ProjectionSourceContribution[]
  /** Rempli a posteriori pour le banc de validation (comparaison au réel). */
  actualResultS?: number | null
}

const HISTORY_SOURCES: ReadonlySet<ProjectionSource> = new Set(['history', 'past_races'])

/** Confiance dérivée des contributions : repli dominant → faible ; historique réel
 *  dominant → élevée ; sinon moyenne. Bornes documentées et testées. */
export function deriveConfidence(contribs: ProjectionSourceContribution[]): Confidence {
  const total = contribs.reduce((s, c) => s + Math.max(0, c.weight), 0)
  if (total <= 0) return 'low'
  const share = (pred: (c: ProjectionSourceContribution) => boolean) =>
    contribs.filter(pred).reduce((s, c) => s + Math.max(0, c.weight), 0) / total
  if (share((c) => c.source === 'fallback') >= 0.5) return 'low'
  if (share((c) => HISTORY_SOURCES.has(c.source)) >= 0.5) return 'high'
  return 'medium'
}

/** Normalise les poids en parts (0..1) sommant à 1 (poids négatifs ramenés à 0). */
export function normalizeContributions(
  contribs: ProjectionSourceContribution[],
): ProjectionSourceContribution[] {
  const total = contribs.reduce((s, c) => s + Math.max(0, c.weight), 0)
  if (total <= 0) return contribs.map((c) => ({ ...c, weight: 0 }))
  return contribs.map((c) => ({ ...c, weight: Math.max(0, c.weight) / total }))
}

/**
 * Estampille une projection brute avec la version du moteur/profil, la confiance,
 * le drapeau de repli et l'explicabilité normalisée. `lowS <= centralS <= highS`
 * est réordonné par sécurité.
 */
export function stampProjection(input: {
  profileVersion?: string | null
  lowS: number
  centralS: number
  highS: number
  explanations: ProjectionSourceContribution[]
  now?: Date
}): VersionedProjection {
  const [lowS, centralS, highS] = [input.lowS, input.centralS, input.highS].sort((a, b) => a - b)
  const explanations = normalizeContributions(input.explanations)
  const usedFallback = explanations.some((c) => c.source === 'fallback' && c.weight > 0)
  return {
    engineVersion: ENGINE_VERSION,
    profileVersion: input.profileVersion ?? null,
    computedAt: (input.now ?? new Date()).toISOString(),
    confidence: deriveConfidence(input.explanations),
    lowS,
    centralS,
    highS,
    usedFallback,
    explanations,
    actualResultS: null,
  }
}
