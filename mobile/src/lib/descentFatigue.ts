// FATIGUE DE DESCENTE, apprise coureur par coureur.
//
// ── Pourquoi ce module ne pouvait pas être un coefficient global ──────────────────
// Mesurée sur l'ensemble des athlètes, la perte de vitesse en descente après 1000 m de
// D− encaissé n'est que de 5 % — contre 18 % en montée. On pourrait en conclure que la
// descente ne fatigue presque pas, et poser un petit coefficient unique pour tout le monde.
//
// Ce serait une erreur de lecture, et elle a été signalée par un athlète : « des fois les
// quadriceps sont morts et je n'arrivais plus à descendre fort ». Les deux affirmations
// sont vraies en même temps, et c'est justement le problème d'une moyenne — elle mélange
// celui qui déroule et celui qui casse, et produit un chiffre que ni l'un ni l'autre ne vit.
// La tenue en descente est probablement ce qui sépare le plus deux coureurs par ailleurs
// comparables : elle dépend de la qualité excentrique des quadriceps, qui s'entraîne
// spécifiquement et ne se déduit d'aucune autre donnée.
//
// D'où ce module : il ne pose AUCUNE valeur par défaut. Il lit la courbe mesurée de
// l'athlète — sa vitesse en descente selon le D− déjà encaissé, à pente comparable — et
// n'agit que si cette courbe existe et tient debout. Sans elle, il rend 1 (aucun effet) et
// le moteur garde son comportement d'avant.
//
// ── Deux garde-fous, et pourquoi ils ne sont pas négociables ─────────────────────
// 1. PENTE CONTRÔLÉE. La mesure amont ne retient que les descentes de 8 à 20 %. Comparer
//    le début et la fin d'une sortie sans ce garde-fou mesurerait le TERRAIN (on finit
//    souvent par une pente douce) et non la fatigue. La pente moyenne de chaque tranche
//    reste publiée pour permettre d'invalider la comparaison.
// 2. AUCUNE EXTRAPOLATION. Le ralentissement est plafonné à la dernière valeur RÉELLEMENT
//    mesurée. Au-delà du D− couvert par l'historique, on ne sait pas — et prolonger une
//    tendance là où il n'y a plus de donnée est exactement la façon dont un modèle se met
//    à inventer. Même discipline que pour la fatigue de montée.
//
// 100 % pur (aucune IO) → testable, identique web / mobile / banc / Edge Function.

import type { DescentFatigueBin } from './walkTransition'
import { FATIGUE_BIN_M } from './walkTransition'

/** Secondes minimales dans une tranche pour qu'elle pèse : sous ce seuil, le rapport de
 *  vitesse est du bruit. Aligné sur le seuil utilisé par la mesure elle-même. */
export const DESCENT_FATIGUE_MIN_BIN_SECONDS = 300

/** Tranches distinctes exigées pour qu'une COURBE existe : une seule ne décrit rien, et
 *  il en faut au moins deux pour observer une évolution. */
export const DESCENT_FATIGUE_MIN_BINS = 2

/** Ralentissement maximal admis, quelle que soit la mesure. Un facteur au-delà signale
 *  presque toujours un artefact (changement de terrain, marche, arrêt mal filtré) plutôt
 *  qu'une perte de vitesse réelle — on refuse de le propager dans une projection. */
export const DESCENT_FATIGUE_MAX_FACTOR = 1.35

/**
 * Facteur multiplicatif de TEMPS en descente, pour un D− déjà encaissé donné.
 *
 * `1` = aucune perte. `1,12` = les descentes prennent 12 % de temps en plus. Jamais
 * inférieur à 1 : un athlète mesuré plus rapide en fin de course qu'à jambes fraîches
 * décrit une gestion d'allure (parti prudemment), pas un gain de fraîcheur — l'accélérer
 * sur cette base reviendrait à projeter qu'il ira plus vite parce qu'il est plus fatigué.
 *
 * Renvoie `1` — et non `null` — quand la courbe manque ou est trop maigre : l'appelant
 * peut multiplier sans condition, et l'absence de donnée ne peut jamais accélérer personne.
 */
export function descentFatigueFactor(
  bins: DescentFatigueBin[] | undefined,
  cumulativeLossM: number,
): number {
  if (!bins || bins.length === 0) return 1
  if (!Number.isFinite(cumulativeLossM) || cumulativeLossM <= 0) return 1

  const usable = bins
    .filter((b) => b.seconds >= DESCENT_FATIGUE_MIN_BIN_SECONDS && b.speedRatioToFresh != null)
    .sort((a, b) => a.cumulativeLossMinM - b.cumulativeLossMinM)
  if (usable.length < DESCENT_FATIGUE_MIN_BINS) return 1

  // Au-delà du D− couvert par l'historique : on tient la dernière valeur mesurée, sans
  // prolonger la pente. Cf. en-tête, garde-fou 2.
  const last = usable[usable.length - 1]
  const lastCenter = last.cumulativeLossMinM + FATIGUE_BIN_M / 2
  const target = Math.min(cumulativeLossM, lastCenter)

  const ratio = interpolateRatio(usable, target)
  if (ratio == null || !(ratio > 0)) return 1

  // Un rapport de VITESSE devient un rapport de TEMPS par inversion.
  const factor = 1 / ratio
  return Math.min(DESCENT_FATIGUE_MAX_FACTOR, Math.max(1, factor))
}

/** Interpolation linéaire entre les CENTRES des tranches — une tranche « 0-250 m »
 *  décrit le comportement autour de 125 m de D− encaissé, pas à 0. */
function interpolateRatio(usable: DescentFatigueBin[], target: number): number | null {
  const pts = usable.map((b) => ({
    center: b.cumulativeLossMinM + FATIGUE_BIN_M / 2,
    ratio: b.speedRatioToFresh as number,
  }))
  if (target <= pts[0].center) return pts[0].ratio
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1]
    const hi = pts[i]
    if (target <= hi.center) {
      const span = hi.center - lo.center
      if (span <= 0) return hi.ratio
      const t = (target - lo.center) / span
      return lo.ratio + (hi.ratio - lo.ratio) * t
    }
  }
  return pts[pts.length - 1].ratio
}

/**
 * La courbe de descente de cet athlète est-elle exploitable par le moteur ?
 *
 * Exposé séparément pour que l'interface puisse dire « mesuré » ou « pas encore assez de
 * données » sans avoir à deviner depuis un facteur à 1 — lequel est ambigu : il signifie
 * aussi bien « pas de donnée » que « cet athlète ne perd rien en descente ».
 */
export function hasUsableDescentFatigue(bins: DescentFatigueBin[] | undefined): boolean {
  if (!bins) return false
  const n = bins.filter(
    (b) => b.seconds >= DESCENT_FATIGUE_MIN_BIN_SECONDS && b.speedRatioToFresh != null,
  ).length
  return n >= DESCENT_FATIGUE_MIN_BINS
}
