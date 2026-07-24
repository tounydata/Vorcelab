// src/lib/coach/courseDemands.ts
// Exigences du PARCOURS dérivées du GPX (déterministe, 100 % pur — aucune IA).
//
// Problème résolu : jusqu'ici le plan coach ne connaissait de la course cible que
// sa DISTANCE et son D+ TOTAL. Deux 50 km / 2000 m radicalement différents — une
// seule grande ascension continue vs vingt bosses courtes ; descente roulante vs
// lacets techniques cassants — recevaient donc EXACTEMENT le même plan. Or la
// spécificité de l'entraînement dépend de la FORME du profil, pas du seul cumul.
//
// Ce module lit la géométrie réelle du tracé (sections montée/descente/plat +
// pente + sinuosité, mêmes primitives que le moteur de projection) et en dérive
// des EXIGENCES structurées + des cibles de séance (WorkoutTarget), branchées dans
// le générateur de plan via le levier d'adaptation le plus fort (adaptCatalog).
//
// Références (périodisation trail, littérature grand public) :
//  - Uphill Athlete : le volume de côtes et la LONGUEUR des ascensions ciblées
//    doivent refléter la course (une grande montée continue ≠ des rappels courts).
//  - Vernillo et al. 2017 ; Millet/Giandolini : la descente = charge EXCENTRIQUE ;
//    la protection musculaire (repeated-bout effect) se construit AVANT la course.
//  - Descente technique (lacets) : freinage constant, compétence spécifique.

import { buildDetailedSections, sectionTurnDegPerKm, hav, type LatLon } from '../gpxCore'
import type { WorkoutTarget } from './workouts'

/** Section de profil minimale acceptée (compatible DetailedSection ET Section moteur). */
export interface DemandSection {
  type: 'up' | 'down' | 'flat'
  dplus: number
  dminus: number
  dist: number
  grade: number
  /** Sinuosité (° de cap/km) si connue — sert à détecter la descente technique. */
  turnDegPerKm?: number
  /** Déjà marquée « technique » par le moteur (lacets) si disponible. */
  technical?: boolean
}

/** Classe de profil (affichage + rationale). */
export type CourseShape = 'flat' | 'rolling' | 'hilly' | 'single_big_climb' | 'mountainous'

export interface CourseDemands {
  distanceKm: number
  dplus: number
  dminus: number
  /** m de D+ par km — intensité verticale globale. */
  verticalRatioMPerKm: number
  /** Nombre de montées « significatives » (≥ SIGNIF_CLIMB_M de D+ continu). */
  significantClimbs: number
  /** D+ de la plus longue montée continue (m). */
  biggestClimbDplus: number
  /** Longueur de la plus longue montée continue (km). */
  biggestClimbKm: number
  /** Part du D+ réalisée sur pente RAIDE (≥ STEEP_GRADE %). [0..1] */
  steepClimbShare: number
  /** Part du D- réalisée sur pente RAIDE (≥ STEEP_GRADE %). [0..1] */
  steepDescentShare: number
  /** Descente = D- / (D+ + D-) : proportion « cassante » du parcours. [0..1] */
  descentShare: number
  /** Descente technique (lacets) détectée sur une longueur significative. */
  technicalDescent: boolean
  /** Altitude max (m) si connue, sinon null. */
  maxAltitudeM: number | null
  /** Classe de profil. */
  shape: CourseShape
  /** Exigences → cibles de séances (levier d'adaptation le plus fort). */
  emphasis: WorkoutTarget[]
  /** Explications déterministes (transparence). */
  notes: string[]
}

// ── Seuils (alignés sur le moteur de projection pour la cohérence) ────────────
const STEEP_GRADE = 12      // % : frontière des buckets « raides » (steep_up/steep_down)
const SIGNIF_CLIMB_M = 100  // m D+ : une ascension digne d'être entraînée spécifiquement
const TECH_SINUOSITY = 250  // °/km : seuil « lacets » (identique au moteur, SIN_TWISTY)
const TECH_MIN_KM = 0.4     // km de lacets cumulés mini pour annoncer « technique »

function round(x: number, d = 0): number {
  const f = 10 ** d
  return Math.round(x * f) / f
}

/**
 * Dérive les exigences du parcours à partir de ses sections + de ses cumuls.
 * Fonction pure : mêmes entrées → mêmes sorties. `maxAltitudeM = null` si inconnu.
 */
export function deriveCourseDemands(
  sections: DemandSection[],
  totals: { distanceKm: number; dplus: number; dminus: number; maxAltitudeM?: number | null },
): CourseDemands {
  const distanceKm = Math.max(0, totals.distanceKm)
  const dplus = Math.max(0, totals.dplus)
  const dminus = Math.max(0, totals.dminus)
  const verticalRatioMPerKm = distanceKm > 0 ? round(dplus / distanceKm, 1) : 0

  const ups = sections.filter((s) => s.type === 'up')
  const downs = sections.filter((s) => s.type === 'down')

  const significantClimbs = ups.filter((s) => s.dplus >= SIGNIF_CLIMB_M).length
  const biggest = ups.reduce<DemandSection | null>((best, s) => (!best || s.dplus > best.dplus ? s : best), null)
  const biggestClimbDplus = biggest ? Math.round(biggest.dplus) : 0
  const biggestClimbKm = biggest ? round(biggest.dist / 1000, 2) : 0

  const steepUpD = ups.filter((s) => s.grade >= STEEP_GRADE).reduce((a, s) => a + s.dplus, 0)
  const steepDownD = downs.filter((s) => Math.abs(s.grade) >= STEEP_GRADE).reduce((a, s) => a + s.dminus, 0)
  const steepClimbShare = dplus > 0 ? round(steepUpD / dplus, 2) : 0
  const steepDescentShare = dminus > 0 ? round(steepDownD / dminus, 2) : 0
  const descentShare = dplus + dminus > 0 ? round(dminus / (dplus + dminus), 2) : 0

  // Descente technique : soit le moteur l'a déjà marquée, soit la sinuosité des
  // sections descendantes dépasse le seuil « lacets » sur une longueur suffisante.
  const technicalKm = downs
    .filter((s) => s.technical || (s.turnDegPerKm ?? 0) >= TECH_SINUOSITY)
    .reduce((a, s) => a + s.dist / 1000, 0)
  const technicalDescent = technicalKm >= TECH_MIN_KM

  const maxAltitudeM = totals.maxAltitudeM ?? null

  // ── Classe de profil (précédence explicite) ────────────────────────────────
  let shape: CourseShape
  if (verticalRatioMPerKm < 8) {
    shape = 'flat'
  } else if (dplus > 0 && biggestClimbDplus >= 0.55 * dplus && significantClimbs <= 2) {
    shape = 'single_big_climb'
  } else if (verticalRatioMPerKm >= 30) {
    shape = 'mountainous'
  } else if (verticalRatioMPerKm >= 15) {
    shape = 'hilly'
  } else {
    shape = 'rolling'
  }

  // ── Exigences → cibles de séance (dédupliquées, ordre stable) ───────────────
  const emphasis: WorkoutTarget[] = []
  const notes: string[] = []
  const add = (t: WorkoutTarget) => { if (!emphasis.includes(t)) emphasis.push(t) }

  const bigClimb = verticalRatioMPerKm >= 15 || biggestClimbDplus >= 400 || steepClimbShare >= 0.30
  if (bigClimb) {
    add('climbing')
    if (shape === 'single_big_climb') {
      notes.push(`Une grande ascension continue (${biggestClimbDplus} m sur ${biggestClimbKm} km) : privilégier les LONGUES montées soutenues plutôt que des rappels courts.`)
    } else {
      notes.push(`Parcours vertical (${verticalRatioMPerKm} m/km) : priorité aux côtes longues et au renfo spécifique montée${steepClimbShare >= 0.30 ? ` (part raide ≥ 12 % : ${Math.round(steepClimbShare * 100)} % du D+ → marche active en puissance)` : ''}.`)
    }
  }

  const bigDescent = steepDescentShare >= 0.25 || technicalDescent || (dminus >= 1200 && descentShare >= 0.45)
  if (bigDescent) {
    add('descending')
    notes.push(
      technicalDescent
        ? 'Descente technique (lacets) : travail de pied de descente + charge excentrique programmée TÔT (protection musculaire, repeated-bout effect).'
        : 'Descente exigeante (raide/volumineuse) : charge excentrique programmée tôt pour protéger les quadriceps le jour J.',
    )
  }

  if (distanceKm >= 42 && dplus >= 1500) {
    add('durability')
    notes.push('Longue distance + fort dénivelé : endurance spécifique et durabilité (temps sur les jambes) prioritaires.')
  }

  return {
    distanceKm: round(distanceKm, 2),
    dplus: Math.round(dplus),
    dminus: Math.round(dminus),
    verticalRatioMPerKm,
    significantClimbs,
    biggestClimbDplus,
    biggestClimbKm,
    steepClimbShare,
    steepDescentShare,
    descentShare,
    technicalDescent,
    maxAltitudeM: maxAltitudeM != null ? Math.round(maxAltitudeM) : null,
    shape,
    emphasis,
    notes,
  }
}

export interface GpxDemandPoint { lat: number; lon: number; ele: number | null }

/**
 * Construit les exigences directement depuis les points GPX bruts. Réutilise EXACTEMENT
 * les primitives du moteur de projection (segmentation 500 m → buildDetailedSections →
 * sinuosité par section) pour rester cohérent avec l'analyse de course. Renvoie null si
 * le tracé est inexploitable (< 2 points ou sans altitude). Pur & déterministe.
 */
export function courseDemandsFromPoints(points: GpxDemandPoint[] | null | undefined): CourseDemands | null {
  if (!points || points.length < 2) return null
  const hasEle = points.some((p) => p.ele != null)
  if (!hasEle) return null

  // Distances cumulées + cumuls D+/D- (identique au moteur).
  const cumDist = [0]
  let dplus = 0, dminus = 0
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + hav(points[i - 1], points[i]))
    if (points[i].ele != null && points[i - 1].ele != null) {
      const diff = (points[i].ele as number) - (points[i - 1].ele as number)
      if (diff > 0) dplus += diff
      else dminus += Math.abs(diff)
    }
  }
  const totalDistM = cumDist[cumDist.length - 1]
  if (totalDistM <= 0) return null
  const eles = points.map((p) => p.ele).filter((e): e is number => e != null)
  const maxAltitudeM = eles.length ? Math.max(...eles) : null

  // Segmentation 500 m (mêmes bornes que computeRaceProjection).
  interface KmSec { km: number; startKm: number; dist: number; dplus: number; dminus: number }
  const kmSecs: KmSec[] = []
  let segTarget = 500, prevIdx = 0
  for (let i = 0; i < cumDist.length; i++) {
    if (cumDist[i] >= segTarget || i === cumDist.length - 1) {
      let sdp = 0, sdm = 0
      for (let j = prevIdx + 1; j <= i; j++) {
        if (points[j].ele != null && points[j - 1].ele != null) {
          const diff = (points[j].ele as number) - (points[j - 1].ele as number)
          if (diff > 0) sdp += diff
          else sdm += Math.abs(diff)
        }
      }
      kmSecs.push({
        km: +(cumDist[i] / 1000).toFixed(2),
        startKm: +(cumDist[prevIdx] / 1000).toFixed(2),
        dist: cumDist[i] - cumDist[prevIdx],
        dplus: Math.round(sdp),
        dminus: Math.round(sdm),
      })
      prevIdx = i
      segTarget = cumDist[i] + 500
    }
  }

  const detailed = buildDetailedSections(kmSecs)
  // Enrichir chaque section descendante de sa sinuosité (détection technique).
  const asLatLon = points as unknown as LatLon[]
  const sections: DemandSection[] = detailed.map((s) => {
    const out: DemandSection = { type: s.type, dplus: s.dplus, dminus: s.dminus, dist: s.dist, grade: s.grade }
    if (s.type === 'down') out.turnDegPerKm = Math.round(sectionTurnDegPerKm(asLatLon, cumDist, s.startKm, s.endKm))
    return out
  })

  return deriveCourseDemands(sections, {
    distanceKm: totalDistM / 1000,
    dplus,
    dminus,
    maxAltitudeM,
  })
}

/** Libellés courts de profil (UI/rationale). */
export const COURSE_SHAPE_LABELS: Record<CourseShape, string> = {
  flat: 'Plat / roulant',
  rolling: 'Vallonné',
  hilly: 'Accidenté',
  single_big_climb: 'Une grande ascension',
  mountainous: 'Très montagneux',
}
