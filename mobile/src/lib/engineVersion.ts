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
 *  ou de coefficient susceptible de modifier une projection.
 *  2026.07-5 : fenêtre moteur unique de six mois (ENGINE_HISTORY_DAYS=183) en
 *  remplacement du `.limit(150)` arbitraire — l'ensemble d'activités alimentant le
 *  moteur change → la projection affichée peut changer. (Coefficients centraux
 *  inchangés ; calibration de pente extraite à l'identique.)
 *  2026.07-6 : le FIC, l'ancrage et la calibration de pente n'acceptent plus qu'une
 *  COMPÉTITION CONFIRMÉE (isEligiblePersonalCalibrationRace) — un footing/échauffement
 *  étiqueté « course » par erreur, ou un effort « à confirmer », ne cale plus la
 *  projection. La charge générale (fraîcheur) reste multisport, explicitement.
 *  (Coefficients centraux inchangés.)
 *  2026.07-7 : DURABILITÉ personnelle activée — le fade d'endurance utilise l'exposant
 *  appris sur la courbe de meilleures perfs (records auto détectés depuis les streams,
 *  désormais calculés par le profil). Gain mesuré au banc sur le trail long
 *  (MAPE 8.8→8.2 %) sans régression route. Les records auto NE pilotent PAS l'allure
 *  (le banc a montré que ça dégrade) — ils servent la durabilité et l'affichage.
 *  2026.07-8 : (1) CALIBRATION DE DURÉE personnelle — l'ancrage ne ramène plus la
 *  projection à la MOYENNE pondérée de l'allure plat-équivalente des courses (qui
 *  écrasait l'axe durée : allure d'un format court appliquée à un format long), mais
 *  à une régression log-log `allure ~ durée` extrapolée à la durée visée. Exposant
 *  personnel borné [0 ; 0,15], ralentissement seul, composé avec la calibration de
 *  pente par la contrainte LA PLUS LENTE (jamais le produit — mêmes courses sources).
 *  (2) Le D+ OFFICIEL déclaré recale désormais le profil GPX lissé en production
 *  (`targetElevationGainM`) : un GPX d'organisateur sous-estime couramment le D+ du
 *  règlement, et le moteur projetait un parcours plus plat que le vrai.
 *  Les deux corrections RALENTISSENT les projections longues/verticales.
 *  2026.07-9 : correctif de la SUR-correction introduite en -8, sur preuve terrain
 *  (classement réel d'une course : la projection -8 tombait au 85e centile pour un
 *  athlète médian).
 *  (1) IDENTIFIABILITÉ de la calibration de durée : elle exige désormais ≥ 4 courses
 *  (au lieu de 3 — à 3 points pour 2 paramètres, un seul effort long atypique dicte
 *  toute la pente) et une colinéarité |r(ln durée, D+/km)| ≤ 0,5. Quand durée et pente
 *  varient ensemble sur les courses de l'athlète, aucune régression à une variable ne
 *  peut les séparer : le moteur s'abstient au lieu d'attribuer par défaut à la durée.
 *  L'extrapolation de durée est en outre plafonnée à 1,25 × la plus longue course.
 *  (2) Facteur de pente : correction de DISPERSION (inégalité de Jensen). L'ancien
 *  calcul supposait une pente uniforme ; le coût de Minetti étant convexe, il
 *  sous-estimait le coût d'un profil réel — d'autant plus que le terrain est raide
 *  (+0,9 % à 3 m/km, +4,6 % à 47 m/km, mesuré en intégrant Minetti sur des profils GPS
 *  réels pas à 50 m). Appliquée des DEUX côtés (courses passées et course visée).
 *  2026.07-10 : la correction de dispersion est RECALIBRÉE sur 240 activités réelles
 *  (au lieu de 5 profils d'un seul athlète, qui donnaient 29 % de trop) et gagne une
 *  ORDONNÉE À L'ORIGINE : une route « plate » garde des micro-ondulations qui coûtent
 *  déjà 1,2-1,9 %, là où un modèle proportionnel ne prédisait que 0,1 % — la route était
 *  donc systématiquement sous-corrigée. Le facteur d'équivalence plat/terrain est
 *  extrait en module PUR (`gradeEquivalence.ts`), testé contre les facteurs mesurés par
 *  intégration de Minetti sur profils GPS réels (écart < 2 % de 3 à 47 m/km).
 *  2026.07-11 : DÉTECTION AUTOMATIQUE des compétitions. Une activité ne comptait comme
 *  course que si l'athlète avait coché « course » sur Strava — or presque personne ne le
 *  fait : un athlète arrivé avec quatre ans d'historique et 427 sorties avait ZÉRO course
 *  étiquetée, alors qu'il y avait un marathon et deux semis dedans. Sans ancrage, le
 *  moteur retombait sur des allures génériques. Le détecteur combine titre personnalisé
 *  (un titre auto Strava n'est jamais une course : 2 cas sur 18), nom d'événement ou
 *  classement, absence de motif de séance, temps d'arrêt ≤ 3 % et FC dans le top 15 %
 *  PERSONNEL — rang, et non %FCmax, car `fc_max` est saisi à la main et souvent faux.
 *  Calibré sur les compétitions déjà étiquetées de la base. PRÉCISION avant rappel : une
 *  fausse course entre dans l'ancrage et y déplace durablement les projections.
 *  2026.07-12 : FATIGUE DE MONTÉE recalibrée sur mesure. Le banc avait éliminé deux
 *  autres pistes pour l'optimisme des courses verticales : l'altimétrie (donner le D+
 *  exact ne gagne que 22 s sur une erreur de 41 min) et le découpage des pentes (une
 *  correction au-delà de 20 % n'a rien changé — les sections si raides n'existent
 *  quasiment pas, 48 m de D+ par km PARCOURU faisant une pente moyenne de 4,8 %).
 *  Restait la fatigue, et elle est désormais mesurée : sur 67 h de montées réelles à
 *  PENTE CONTRÔLÉE (bande 10-25 %), la VAM tombe à 92 / 88 / 86 / 82 % de sa valeur à
 *  jambes fraîches par tranches de 250 m de D+ cumulé. Le moteur appliquait +9 % de
 *  temps de montée par 1000 m ; la mesure dit +22 %. Il était calé 2,4 fois trop bas.
 *  Nouvelles valeurs : +20 % / 1000 m, plafond +22 % — posé À la dernière valeur
 *  MESURÉE, sans extrapoler au-delà de 1250 m où nous n'avons pas de données.
 *  Ne touche QUE les montées longues : une course sans dénivelé cumulé notable est
 *  strictement inchangée.
 *  2026.07-13 : LISSAGE ALTIMÉTRIQUE calibré sur 501 tracés réels. Ses deux réglages
 *  — fenêtre 50 m, seuil vertical 3 m — étaient des défauts posés à l'écriture. Mesurés
 *  contre le D+ Strava, par terrain (biais médian, négatif = le lissage rabote) :
 *  ROULANT 350 tracés −50,0 % · VALLONNÉ 79 tracés −9,3 % · MONTAGNEUX 72 tracés −4,0 %.
 *  L'ancien réglage coupait donc la MOITIÉ du dénivelé des parcours roulants — un biais
 *  parfaitement systématique, pas du bruit. Nouveaux réglages 30 m / 1 m : −1,4 %, −1,9 %
 *  et −1,0 % sur les mêmes terrains. Ils gagnent sur les TROIS, en biais comme en
 *  dispersion (14,3 % contre 50,0 % sur route) : aucun compromis à arbitrer. La crainte
 *  d'un bruit réintroduit ne se vérifie pas — le filtre médian et la moyenne glissante
 *  assurent déjà le débruitage, le seuil de 3 m ne coupait plus que du signal. Le banc
 *  avait chiffré ce défaut sans en connaître la cause : donner le D+ exact au moteur
 *  faisait passer l'erreur sur route de 10,9 % à 8,8 %.
 *  2026.07-14 : MARCHER et COURIR cessent d'être moyennés. Un seau de pente ne portait
 *  qu'UNE allure — or « montée raide » couvre tout ce qui dépasse 12 %, sans limite haute :
 *  du 13 % couru et du 25 % marché finissaient dans le même nombre. Cette moyenne n'est
 *  valable que pour la proportion de marche rencontrée à l'ENTRAÎNEMENT ; appliquée à une
 *  course plus raide, elle fait courir l'athlète là où il marchera.
 *  Le profil apprend maintenant deux choses distinctes, l'une et l'autre mesurées sur la
 *  CADENCE (seul signal qui sépare les deux locomotions — l'allure, elle, confond « marcher »
 *  et « courir épuisé ») : (1) la part de temps marchée à CHAQUE pente, par intervalles de
 *  5 % ; (2) les performances propres à chaque régime dans chaque seau (allure et VAM de
 *  marche, allure et VAM de course). Le temps d'une section de montée devient un mélange
 *  continu des deux, à la part de marche correspondant à la pente RÉELLE de la section.
 *  AUCUN SEUIL DE PENTE n'est introduit — c'était l'erreur d'une tentative précédente,
 *  retirée après cinq secondes de gain sur vingt et une courses. La marche est un RÉGIME :
 *  elle se produit là où elle se produit, et cela varie fortement d'un coureur à l'autre
 *  (de 0,5 % à 12,6 % du temps dans la zone de transition, chez nos athlètes ; pente de
 *  bascule de 7,5 % à 10,6 %). Là où la part mesurée vaut zéro, le mélange rend exactement
 *  le temps de course : la section est strictement inchangée, et un coureur qui court tout
 *  garde sa projection au chiffre près.
 *  Le modèle ne s'active que sur données suffisantes (assez de temps classé par la cadence,
 *  et une couverture suffisante du seau) ; sinon le moteur garde son chemin d'avant, correct,
 *  simplement moins fin. Le recalage à l'effort de course s'applique aux deux régimes, jamais
 *  à la part de marche : courir plus fort le jour J ne déplace pas la pente de bascule.
 *  2026.07-15 : DESCENTE apprise coureur par coureur. Le moteur n'avait aucun modèle de
 *  fatigue en descente, alors qu'elle pèse autant de temps de course que la montée. La
 *  tentation était d'y poser un coefficient global : mesurée sur l'ensemble des athlètes,
 *  la perte de vitesse après 1000 m de D− encaissé n'est que de 5 %, contre 18 % en montée.
 *  Cette lecture est fausse, et un athlète l'a signalée — « des fois les quadriceps sont
 *  morts et je n'arrivais plus à descendre fort ». Les deux vécus sont réels ; c'est
 *  exactement ce qu'une moyenne détruit. La tenue en descente dépend de la qualité
 *  excentrique des quadriceps, qui s'entraîne spécifiquement et ne se déduit d'aucune autre
 *  donnée : il faut la mesurer sur chaque coureur, ou s'abstenir.
 *  Le profil apprend donc, par athlète, la vitesse de descente par pente et sa TENUE selon
 *  le D− déjà encaissé, à PENTE CONTRÔLÉE (bande 8-20 % — sans ce garde-fou, comparer le
 *  début et la fin d'une sortie mesurerait le terrain, pas la fatigue). Aucune valeur par
 *  défaut : sans courbe mesurée, le facteur vaut 1 et les descentes sont inchangées.
 *  Trois bornes : jamais d'accélération (un athlète parti prudemment finit « plus vite
 *  qu'à jambes fraîches » — c'est une gestion d'allure, pas un gain de fraîcheur) ;
 *  aucune extrapolation au-delà du D− réellement couvert par l'historique ; et un plafond
 *  qui refuse de propager un effondrement invraisemblable plutôt que de le croire.
 *  2026.08-1 : l'axe DURÉE de l'ancrage accepte désormais AUSSI les compétitions sur
 *  ROUTE quand la course visée est un trail (l'axe PENTE et la moyenne pondérée restent,
 *  eux, terrain-cohérents). Motif de FORME, pas de coefficient : l'allure est neutralisée
 *  du D+ par Minetti AVANT la régression `allure ~ durée`, donc la dégradation mesurée est
 *  physiologique et non propre au terrain — un semi sur route dit quelque chose de vrai sur
 *  ce que le coureur tient au bout de deux heures. Réserver cet axe aux trails coûtait cher
 *  en pratique : un traileur avec trois trails et un semi n'atteignait pas le minimum de
 *  quatre points, l'axe restait éteint, et la projection gardait l'allure d'un format court
 *  pour un format long — exactement l'erreur que cet axe existe pour corriger (cas mesuré :
 *  Trail du Jura Alsacien 02/08/2026, cible 3h42 pour 4h16 réalisées, axe durée inactif
 *  faute d'une quatrième course). Le garde-fou de colinéarité durée ↔ pente est conservé :
 *  si « long » et « raide » sont le même axe chez un coureur, la calibration se coupe seule. */
export const ENGINE_VERSION = '2026.08-1'

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
