import type { ProjectionResult } from './computeRaceProjection'
import type { WeatherImpact } from './raceWeather'
import { compareToGoal } from './raceGoalCompare'

// ── La météo entre dans la CIBLE ──────────────────────────────────────────────
// Historiquement, l'impact météo était calculé puis affiché À CÔTÉ du temps cible :
// le grand chiffre ignorait la chaleur, et seul un encart plus bas mentionnait une
// « cible ajustée ». Le coureur partait donc avec en tête le seul nombre qui ne
// tenait pas compte du jour J.
//
// Constaté sur le Trail du Jura Alsacien (02/08/2026, départ 8h15, plein soleil) :
// cible 3h42 affichée en grand, résultat 4h16. Le scénario prudent — le seul qui
// intégrait la chaleur — tombait à 3'45 du temps réel.
//
// Cette fonction applique le facteur météo à TOUS les temps de la projection, pas
// seulement au total : les heures de passage, le plan nutrition et le plan
// d'assistance en découlent et doivent rester cohérents entre eux. Une cible
// rallongée avec des fanions de passage inchangés serait un plan qui se contredit.
//
// Elle reste HORS du moteur, volontairement : le snapshot de validation et le banc
// historique doivent continuer à mesurer la sortie BRUTE, sans prévision météo —
// sinon les chiffres d'erreur publiés ne seraient plus comparables d'une version à
// l'autre.

/**
 * Applique l'impact météo à une projection. Renvoie la projection INCHANGÉE (même
 * référence) quand il n'y a rien à appliquer — pas de recalcul, pas de re-rendu.
 */
export function applyWeatherToProjection(
  projection: ProjectionResult | null,
  weather: WeatherImpact | null | undefined,
  /**
   * Objectif saisi, pour recalculer le verdict sur le temps réellement affiché.
   * Paramètre OBLIGATOIRE (quitte à passer `null`) : l'oublier laisserait un
   * « Réaliste » calculé sur l'ancien temps sous une cible qui a changé.
   */
  goalTime: string | null,
): ProjectionResult | null {
  if (!projection) return null
  // Déjà appliquée : ne jamais recompter (la fonction peut être appelée dans deux
  // chemins qui se rejoignent — page stratégie et hook partagé du dashboard).
  if (projection.weatherAppliedPct != null && projection.weatherAppliedPct !== 0) return projection

  const factor = weather?.factor
  if (factor == null || !Number.isFinite(factor) || factor <= 1) return projection

  const estTimeS = projection.estTimeS * factor
  // Recalculé sur le temps affiché, et RÉÉCRIT même quand il n'y a pas d'objectif :
  // un spread d'objet vide laisserait en place le verdict de l'ancien temps.
  const goal = compareToGoal(estTimeS, goalTime)

  return {
    ...projection,
    estTimeS,
    timeMin: projection.timeMin * factor,
    timeMax: projection.timeMax * factor,
    // Les heures de passage sont dérivées des temps de section : sans ça, un plan
    // annoncé à 4h16 afficherait encore le fanion du sommet à l'heure des 3h42.
    sectionTimes: projection.sectionTimes.map((t) => t * factor),
    weatherAppliedPct: weather!.totalPct,
    // Le verdict sur l'objectif porte sur le temps AFFICHÉ, pas sur celui d'avant.
    goalLabel: goal.goalLabel,
    goalCompareColor: goal.goalCompareColor,
    goalCompareStr: goal.goalCompareStr,
  }
}
