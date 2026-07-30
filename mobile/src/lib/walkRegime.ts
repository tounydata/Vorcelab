// Modèle de MARCHE en montée, piloté par le RÉGIME et non par la pente.
//
// ── Pourquoi ce module existe, et pourquoi la première tentative a échoué ─────────
// Une correction précédente traitait la marche comme « ce qui se passe au-delà de 20 %
// de pente ». Écrite, mesurée au banc, puis RETIRÉE : cinq secondes de gain sur vingt et
// une courses. La raison est simple — la marche ne commence pas à 20 %, elle commence
// vers 10-15 %. Le déclencheur était au mauvais endroit, donc il ne se déclenchait jamais.
//
// La pente n'est pas la cause, c'est une conséquence. Ce qui compte est le RÉGIME :
// l'athlète court, ou il marche. Ce régime se lit directement dans la cadence, et il doit
// être traité PARTOUT où il se produit, quelle que soit la pente.
//
// ── Ce qui est universel, ce qui est personnel ────────────────────────────────────
// Mesuré sur les tracés réels : le creux de cadence entre les deux régimes tombe au même
// endroit chez tous les athlètes (130 pas/min). Le SEUIL DE DÉTECTION est donc universel
// — inutile de le personnaliser.
//
// Ce qui est personnel, c'est la PART DE TEMPS passée en marche à chaque pente, et elle
// varie fortement : d'un athlète qui ne marche pratiquement jamais (0,5 % du temps dans
// la zone de transition) à un autre au régime mixte marqué (12,6 %). Leur pente de
// bascule s'étale de 7,5 % à 10,6 %.
//
// D'où ce module : il ne décide pas « à partir de quand on marche », il lit la courbe
// MESURÉE de chaque athlète et estime, pour une pente donnée, quelle part de son temps
// il y passera en marche. Le temps de la section est ensuite un mélange continu entre
// allure de course et vitesse ascensionnelle de marche — sans aucun seuil en dur.

import type { GradeBinStats } from './walkTransition'
import { GRADE_BIN_WIDTH } from './walkTransition'

/** Part de marche (0..1) estimée à une pente donnée, depuis la courbe MESURÉE.
 *
 *  Interpolation linéaire entre les CENTRES des intervalles encadrants — un intervalle
 *  « 10-15 % » décrit le comportement autour de 12,5 %, pas à 10 %. Sous le premier
 *  centre et au-dessus du dernier, la valeur est prolongée à plat plutôt qu'extrapolée :
 *  au-delà de ce qui est mesuré, on ne sait pas.
 *
 *  Seuls les intervalles ayant assez de matière (≥ 60 s) sont considérés — un intervalle
 *  à trois secondes de mesure donnerait une part de marche tirée au hasard.
 */
export function walkFractionAtGrade(bins: GradeBinStats[], gradePct: number): number | null {
  const usable = bins
    .filter((b) => b.seconds >= 60)
    .map((b) => ({ center: b.gradeMinPct + GRADE_BIN_WIDTH / 2, frac: b.walkFraction }))
    .sort((a, b) => a.center - b.center)
  if (usable.length === 0) return null
  if (!Number.isFinite(gradePct)) return null

  if (gradePct <= usable[0].center) return usable[0].frac
  const last = usable[usable.length - 1]
  if (gradePct >= last.center) return last.frac

  for (let i = 1; i < usable.length; i++) {
    const lo = usable[i - 1]
    const hi = usable[i]
    if (gradePct <= hi.center) {
      const span = hi.center - lo.center
      if (span <= 0) return hi.frac
      const t = (gradePct - lo.center) / span
      return lo.frac + (hi.frac - lo.frac) * t
    }
  }
  return last.frac
}

export interface SectionTimeInput {
  /** Distance de la section (m). */
  distanceM: number
  /** Dénivelé positif de la section (m). */
  climbM: number
  /** Allure de COURSE de l'athlète sur ce terrain (km/h). */
  runSpeedKmH: number | null
  /**
   * Temps de course de la section déjà calculé par l'appelant (s), prioritaire sur
   * `runSpeedKmH`. Le moteur, en montée, ne déduit pas le temps de course d'une simple
   * vitesse au sol : il mélange VAM et vitesse. Lui imposer de repasser par une vitesse
   * unique perdrait cette finesse — il passe donc son temps directement.
   */
  runTimeS?: number | null
  /** Vitesse ascensionnelle de MARCHE de l'athlète (m/h). */
  walkVamMH: number | null
  /** Vitesse au sol en MARCHE (km/h). Indispensable : cf. `blendedSectionTimeS`. */
  walkSpeedKmH: number | null
  /** Part de temps en marche attendue (0..1). */
  walkFraction: number
}

/**
 * Temps d'une section, mélange CONTINU entre les deux régimes.
 *
 * Aucun seuil : à 0 % de marche le temps est purement celui de la course, à 100 % celui
 * de la marche, et entre les deux il varie proportionnellement. Une section où l'athlète
 * ne marche jamais est donc strictement inchangée — c'est ce qui rend le modèle sûr à
 * activer partout.
 *
 * ── Deux contraintes en marche, et c'est la plus lente qui gagne ─────────────────
 * Un premier jet ne retenait que le dénivelé (`D+ ÷ VAM`). Un test l'a démoli : sur une
 * section à 4 % de pente, marcher à 700 m/h de dénivelé impliquerait 17 km/h au sol.
 * Absurde. En marche, l'athlète est limité À LA FOIS par sa vitesse au sol et par sa
 * vitesse ascensionnelle ; sur terrain doux c'est la première qui borne, sur terrain
 * raide la seconde. On retient donc le MAXIMUM des deux temps — jamais leur moyenne, qui
 * autoriserait de violer l'une des deux limites.
 *
 * Renvoie `null` si le régime requis n'est pas renseignable : le moteur doit alors garder
 * son chemin actuel plutôt que d'inventer une valeur.
 */
export function blendedSectionTimeS(input: SectionTimeInput): number | null {
  const w = Math.min(1, Math.max(0, input.walkFraction))
  const { distanceM, climbM, runSpeedKmH, walkVamMH } = input
  if (!(distanceM > 0)) return null

  const runTimeS = input.runTimeS != null && input.runTimeS > 0
    ? input.runTimeS
    : runSpeedKmH && runSpeedKmH > 0 ? distanceM / (runSpeedKmH / 3.6) : null

  // Marche : la plus contraignante des deux limites (cf. en-tête).
  const walkFlatS = input.walkSpeedKmH && input.walkSpeedKmH > 0
    ? distanceM / (input.walkSpeedKmH / 3.6)
    : null
  const walkClimbS = walkVamMH && walkVamMH > 0 && climbM > 0 ? (climbM / walkVamMH) * 3600 : null
  const walkTimeS = walkFlatS == null
    ? null
    : walkClimbS == null ? walkFlatS : Math.max(walkFlatS, walkClimbS)

  if (w <= 0) return runTimeS
  if (w >= 1) return walkTimeS
  if (runTimeS == null || walkTimeS == null) return null
  return runTimeS * (1 - w) + walkTimeS * w
}
