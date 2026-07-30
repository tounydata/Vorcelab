// Bascule COURSE → MARCHE en montée (logique PURE, testable, sans IO).
//
// Pourquoi : le profil coureur classe les pentes en sept seaux, dont le plus raide est
// « ≥ 12 %, sans limite haute ». Or c'est précisément autour de 10-15 % que l'athlète
// cesse de courir. Du 12 % (où l'on court encore, ~6,5 km/h) et du 30 % (où l'on marche,
// ~3 km/h) tombent donc dans la MÊME moyenne — la vitesse est divisée par deux entre les
// deux, et le moteur n'en retient qu'un seul chiffre. Appliqué à une course très
// verticale, ce chiffre est massivement optimiste : c'est le défaut mesuré au banc
// (D+/km > 40 → MAPE 15 %, optimisme sur 100 % des cas, une course à −23 %).
//
// Ce module MESURE la bascule au lieu de la postuler. Il ne modifie aucune projection :
// il produit les statistiques qui permettront de décider comment redécouper les seaux.
//
// ── Pourquoi la cadence, et pas la vitesse ────────────────────────────────────────
// La vitesse seule confond « marche » et « course lente en montée raide ». La cadence,
// elle, s'effondre franchement au passage à la marche : ~85 pas/min par jambe en course,
// ~55-60 en marche. Le seuil retenu (65) est celui déjà utilisé par le profil pour
// étiqueter la marche (`runnerProfile.ts` : cadence < 130 pas/min DEUX jambes), et il
// tombe au creux du trou entre les deux régimes.
//
// Les streams Strava donnent la cadence PAR JAMBE pour la course à pied.

/** Seuil de cadence (pas/min, UNE jambe) sous lequel l'athlète marche. */
export const WALK_CADENCE_THRESHOLD = 65

/** Largeur d'un intervalle de pente (%) dans les statistiques produites. */
export const GRADE_BIN_WIDTH = 5
/** Pente maximale analysée (%) — au-delà, le GPS est trop bruité pour conclure. */
export const MAX_GRADE_PCT = 45

/**
 * Distance minimale (m) entre deux points pour calculer une pente. Sous ce seuil, le
 * bruit d'altitude (±3 m) domine complètement le dénivelé réel : à 10 m de distance,
 * 3 m de bruit donnent 30 % de pente fantôme.
 */
export const MIN_SEGMENT_M = 40

export interface WalkTransitionStreams {
  time?: { data?: unknown[] } | null
  altitude?: { data?: unknown[] } | null
  distance?: { data?: unknown[] } | null
  cadence?: { data?: unknown[] } | null
  velocity_smooth?: { data?: unknown[] } | null
}

/** Statistiques d'un intervalle de pente, agrégées sur le TEMPS passé. */
export interface GradeBinStats {
  /** Borne basse de l'intervalle (%), largeur `GRADE_BIN_WIDTH`. */
  gradeMinPct: number
  /** Secondes cumulées dans cet intervalle (le poids honnête : on agrège du temps). */
  seconds: number
  meanCadence: number | null
  meanSpeedKmH: number | null
  /** Vitesse ASCENSIONNELLE moyenne (m/h) — l'invariant candidat en marche. */
  meanVamMH: number | null
  /** Part du temps (0..1) passée sous le seuil de cadence de marche. */
  walkFraction: number
}

export interface WalkTransitionProfile {
  bins: GradeBinStats[]
  /** Total analysé (s), tous intervalles confondus. */
  totalSeconds: number
  /**
   * Pente (%) à laquelle l'athlète passe la barre des 50 % de temps en marche, obtenue
   * par interpolation linéaire entre les deux intervalles qui encadrent le passage.
   * `null` si la bascule n'est jamais franchie (pas assez de terrain raide).
   */
  transitionGradePct: number | null
}

function nums(s?: { data?: unknown[] } | null): number[] | null {
  const d = s?.data
  if (!Array.isArray(d)) return null
  return d.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN))
}

interface Sample {
  gradePct: number
  seconds: number
  cadence: number
  speedKmH: number
}

/**
 * Échantillons (pente, durée, cadence, vitesse) d'UNE activité.
 *
 * La pente est calculée sur des segments d'au moins `MIN_SEGMENT_M` — pas point à point.
 * Sans cette distance minimale, le bruit d'altitude produit des pentes aberrantes qui
 * polluent surtout les intervalles raides, c'est-à-dire exactement ceux qu'on cherche à
 * mesurer.
 */
export function extractSamples(streams: WalkTransitionStreams): Sample[] {
  const alt = nums(streams.altitude)
  const dist = nums(streams.distance)
  const cad = nums(streams.cadence)
  const vel = nums(streams.velocity_smooth)
  const time = nums(streams.time)
  if (!alt || !dist || !cad || !time) return []
  const n = Math.min(alt.length, dist.length, cad.length, time.length)
  if (n < 2) return []

  const out: Sample[] = []
  let anchor = 0
  for (let i = 1; i < n; i++) {
    const dd = dist[i] - dist[anchor]
    if (!(dd >= MIN_SEGMENT_M)) continue
    const da = alt[i] - alt[anchor]
    const dt = time[i] - time[anchor]
    if (!Number.isFinite(da) || !Number.isFinite(dt) || dt <= 0) { anchor = i; continue }

    // Cadence et vitesse moyennes du segment, sur les points exploitables.
    let cSum = 0, cCount = 0, vSum = 0, vCount = 0
    for (let j = anchor; j <= i; j++) {
      if (Number.isFinite(cad[j]) && cad[j] > 0) { cSum += cad[j]; cCount++ }
      if (vel && Number.isFinite(vel[j]) && vel[j] > 0) { vSum += vel[j]; vCount++ }
    }
    anchor = i
    if (cCount === 0) continue

    const gradePct = (da / dd) * 100
    // Vitesse : le stream si disponible, sinon dérivée de la distance et du temps.
    const speedKmH = vCount > 0 ? (vSum / vCount) * 3.6 : (dd / dt) * 3.6
    if (!(speedKmH > 0.3)) continue // arrêt / pause : n'informe pas sur l'allure
    out.push({ gradePct, seconds: dt, cadence: cSum / cCount, speedKmH })
  }
  return out
}

/**
 * Agrège des échantillons en statistiques par intervalle de pente MONTANTE.
 *
 * Pondération par le TEMPS et non par le nombre d'échantillons : un segment parcouru
 * lentement dure plus longtemps et pèse donc davantage — ce qui est le comportement
 * voulu, puisque c'est bien du temps que le moteur cherche à prédire.
 */
export function aggregateByGrade(samples: Sample[]): WalkTransitionProfile {
  const binCount = Math.ceil(MAX_GRADE_PCT / GRADE_BIN_WIDTH)
  const acc = Array.from({ length: binCount }, (_, k) => ({
    gradeMinPct: k * GRADE_BIN_WIDTH,
    seconds: 0, cadWeighted: 0, spdWeighted: 0, vamWeighted: 0, walkSeconds: 0,
  }))

  for (const s of samples) {
    if (!(s.gradePct >= 0) || s.gradePct >= MAX_GRADE_PCT) continue
    const k = Math.floor(s.gradePct / GRADE_BIN_WIDTH)
    const b = acc[k]
    if (!b) continue
    b.seconds += s.seconds
    b.cadWeighted += s.cadence * s.seconds
    b.spdWeighted += s.speedKmH * s.seconds
    // VAM = vitesse horizontale × pente (m gravis par heure).
    b.vamWeighted += s.speedKmH * 1000 * (s.gradePct / 100) * s.seconds
    if (s.cadence < WALK_CADENCE_THRESHOLD) b.walkSeconds += s.seconds
  }

  const bins: GradeBinStats[] = acc.map((b) => ({
    gradeMinPct: b.gradeMinPct,
    seconds: Math.round(b.seconds),
    meanCadence: b.seconds > 0 ? +(b.cadWeighted / b.seconds).toFixed(1) : null,
    meanSpeedKmH: b.seconds > 0 ? +(b.spdWeighted / b.seconds).toFixed(2) : null,
    meanVamMH: b.seconds > 0 ? Math.round(b.vamWeighted / b.seconds) : null,
    walkFraction: b.seconds > 0 ? +(b.walkSeconds / b.seconds).toFixed(3) : 0,
  }))

  return {
    bins,
    totalSeconds: bins.reduce((s, b) => s + b.seconds, 0),
    transitionGradePct: findTransition(bins),
  }
}

/**
 * Pente où la part de marche franchit 50 %, interpolée entre les centres des deux
 * intervalles encadrants. Ne considère que les intervalles ayant assez de matière
 * (≥ 60 s) : un intervalle à 3 s de mesure donnerait une bascule au hasard.
 */
export function findTransition(bins: GradeBinStats[]): number | null {
  const usable = bins.filter((b) => b.seconds >= 60)
  for (let i = 1; i < usable.length; i++) {
    const prev = usable[i - 1]
    const cur = usable[i]
    if (prev.walkFraction < 0.5 && cur.walkFraction >= 0.5) {
      const x0 = prev.gradeMinPct + GRADE_BIN_WIDTH / 2
      const x1 = cur.gradeMinPct + GRADE_BIN_WIDTH / 2
      const span = cur.walkFraction - prev.walkFraction
      if (span <= 0) return +x1.toFixed(1)
      return +(x0 + ((0.5 - prev.walkFraction) / span) * (x1 - x0)).toFixed(1)
    }
  }
  return null
}

/** Chaîne complète pour un athlète : streams → échantillons → statistiques. */
export function measureWalkTransition(streamSets: WalkTransitionStreams[]): WalkTransitionProfile {
  const samples: Sample[] = []
  for (const s of streamSets) samples.push(...extractSamples(s))
  return aggregateByGrade(samples)
}
