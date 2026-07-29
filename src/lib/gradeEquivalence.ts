// Équivalence PLAT ↔ TERRAIN : facteur multiplicatif de coût d'un parcours résumé par
// son seul D+/km. Logique PURE, testable.
//
// À quoi ça sert : tout l'ancrage du moteur raisonne en allure « plat-équivalente »
// (allure brute ÷ facteur). Ce facteur est donc appliqué DEUX fois — pour neutraliser
// le terrain des courses passées, puis pour rendre celui de la course visée. Une erreur
// ici ne se voit pas quand les pentes se ressemblent, mais fausse tout dès que la course
// visée est plus (ou moins) accidentée que l'historique de l'athlète.
//
// Deux composantes :
//
//  1. TERME UNIFORME — approximation d'une boucle : ~moitié en montée +g, moitié en
//     descente −g, avec g ≈ (D+/km)/500. C'est le modèle historique.
//
//  2. CORRECTION DE DISPERSION — le terme 1 suppose une pente CONSTANTE. Or un vrai
//     parcours a une DISTRIBUTION de pentes, et le coût de Minetti est CONVEXE : par
//     l'inégalité de Jensen, le coût moyen d'un profil réel dépasse le coût de sa pente
//     moyenne. Le terme 1 sous-estime donc, d'autant plus que le terrain est accidenté.
//
// Calibration de la correction : écart mesuré entre l'intégration de Minetti sur des
// profils GPS RÉELS (rééchantillonnés à 50 m) et le terme uniforme, ajusté par moindres
// carrés sur **240 activités** course à pied / trail (0,6 à 82 m/km).
//
// L'ordonnée à l'origine n'est pas un artefact : une route « plate » garde des
// micro-ondulations qui coûtent déjà plus qu'une ligne mathématiquement plate — écart
// mesuré sous 2 m/km : 1,2 à 1,9 %, là où un modèle purement proportionnel ne prédirait
// que 0,1 %. L'ignorer sous-corrigeait systématiquement la route.

import { minettiGradePenalty } from './gpxCore'

/** Ordonnée à l'origine de la correction de dispersion (coût des micro-ondulations). */
export const DISPERSION_INTERCEPT = 0.00734
/** Pente de la correction de dispersion, par m/km de D+. */
export const DISPERSION_PER_DPKM = 0.00059
/** Plafond de la correction : au-delà, plus de mesure pour étayer. */
export const DISPERSION_MAX = 0.05

/** Pente moyenne équivalente (fraction) pour un D+/km donné, bornée à 45 %. */
export function equivalentGrade(dplusPerKm: number): number {
  return Math.min(0.45, Math.max(0, dplusPerKm / 500))
}

/** Correction de dispersion (fraction à ajouter), bornée. */
export function dispersionCorrection(dplusPerKm: number): number {
  return Math.min(
    DISPERSION_MAX,
    Math.max(0, DISPERSION_INTERCEPT + DISPERSION_PER_DPKM * dplusPerKm),
  )
}

/**
 * Facteur de coût terrain ÷ plat pour un parcours résumé par son D+/km.
 * `1` exactement sur un profil rigoureusement plat (aucun D+), sinon > 1.
 */
export function meanGradeFactor(dplusPerKm: number): number {
  const g = equivalentGrade(dplusPerKm)
  if (g === 0) return 1
  const uniform = 1 + 0.5 * (minettiGradePenalty(g) + minettiGradePenalty(-g))
  return uniform * (1 + dispersionCorrection(dplusPerKm))
}
