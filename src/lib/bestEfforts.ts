// Extraction PURE des MEILLEURES PERFORMANCES depuis les streams d'UNE activité.
//
// Idée (cf. Strava « Best Efforts », Garmin, Stryd) : on ne se fie PLUS à l'étiquette
// « course ». On balaie le tracé de CHAQUE sortie avec une fenêtre glissante et on
// repêche le meilleur temps sur chaque distance repère (5/10/20 km, semi, marathon…)
// et la meilleure vitesse tenue sur chaque durée repère (courbe « mean-max »). Ces
// efforts alimentent ensuite les records auto ET la vitesse critique (computeCriticalSpeed).
//
// Deux garde-fous essentiels (sinon on fabrique de faux records) :
//   • AJUSTEMENT DE PENTE (GAP) : une descente rapide n'est pas un vrai 5 km. On
//     convertit chaque pas en distance « équivalent plat » via la courbe Minetti déjà
//     utilisée par le moteur (gpxCore) — cohérence garantie avec le reste.
//   • VITESSE PLAUSIBLE : au-delà d'un plafond humain, c'est un artefact GPS → rejeté.
//
// 100 % pur (aucune IO), donc testable et identique web/mobile.

import { minettiGradePenalty } from './gpxCore'
import { computeCriticalSpeed, type Effort, type CriticalSpeedResult } from './criticalSpeed'
import { smoothAltitudeByDistance } from './elevationSmoothing'

/** Un stream brut : soit `{ data: [...] }` (Strava), soit un tableau direct. */
type RawStream = { data?: unknown } | unknown[] | null | undefined

export interface BestEffortStreams {
  /** Temps cumulé (s). */
  time?: RawStream
  /** Distance cumulée (m). */
  distance?: RawStream
  /** Altitude (m) — optionnelle (ajustement de pente si présente). */
  altitude?: RawStream
}

/** Distances repères (m) : 1, 5, 10, 20 km, semi, marathon, 50, 100 km. */
export const RUN_BENCHMARK_DISTANCES_M = [
  1000, 5000, 10000, 20000, 21097, 42195, 50000, 100000,
] as const

/** Durées repères (s) pour la courbe mean-max / vitesse critique (1 min → 90 min). */
export const MEAN_MAX_DURATIONS_S = [
  60, 120, 180, 300, 480, 720, 1200, 1800, 3600, 5400,
] as const

// Plafond de vitesse plausible en course (m/s). 7.5 ≈ 2:13/km : au-delà = artefact.
const SPEED_HARD_MAX = 7.5
// Une perf « brute » dont la pente moyenne descend sous ce seuil est suspecte
// (aidée par la descente) → signalée, à ne pas afficher comme record « propre ».
const SUSPECT_DOWNHILL_GRADE = -0.02

function toNumArray(s: RawStream): number[] {
  const arr = Array.isArray(s)
    ? s
    : s && typeof s === 'object' && Array.isArray((s as { data?: unknown }).data)
      ? (s as { data: unknown[] }).data
      : []
  return arr.map((v) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : NaN
  })
}

interface CleanStreams {
  time: number[]
  distance: number[]
  /** Distance cumulée « équivalent plat » (GAP) — = distance si pas d'altitude. */
  gapDistance: number[]
  n: number
}

/**
 * Nettoie et aligne les streams, et construit la distance cumulée « équivalent plat »
 * (GAP) : chaque pas est pondéré par le coût de la pente (Minetti, via gpxCore). Une
 * montée compte pour PLUS que sa distance, une descente pour un peu MOINS (borné, comme
 * dans tout le moteur), un plat = 1×.
 */
export function buildCleanStreams(streams: BestEffortStreams): CleanStreams | null {
  const time = toNumArray(streams.time)
  const distance = toNumArray(streams.distance)
  const n = Math.min(time.length, distance.length)
  if (n < 5) return null

  const t = time.slice(0, n)
  const d = distance.slice(0, n)
  // Rejette un stream incohérent (temps/distance non croissants aux extrêmes).
  if (!Number.isFinite(t[0]) || !Number.isFinite(d[0]) || !(t[n - 1] > t[0]) || !(d[n - 1] >= d[0])) {
    return null
  }

  // Lissage altimétrique ROBUSTE unifié avec le pipeline GPX principal (§9) :
  // interpolation par distance + filtre médian + moyenne par fenêtre de distance (50 m).
  // La distance `d` du stream sert de référence — jamais recalculée.
  const rawAlt = toNumArray(streams.altitude).slice(0, n)
  const hasAlt = rawAlt.some((x) => Number.isFinite(x))
  const alt = hasAlt ? smoothAltitudeByDistance(rawAlt, d, { medianWindow: 5, smoothingDistanceM: 50 }) : null

  const gapDistance = new Array<number>(n)
  gapDistance[0] = 0
  for (let i = 1; i < n; i++) {
    const dd = d[i] - d[i - 1]
    if (!(dd > 0)) {
      gapDistance[i] = gapDistance[i - 1]
      continue
    }
    let factor = 1
    if (alt) {
      const grade = (alt[i] - alt[i - 1]) / dd
      // 1 + coût relatif Minetti (0 à plat, <0 en descente douce, >0 en montée/forte descente).
      factor = Math.max(0.5, 1 + minettiGradePenalty(grade))
    }
    gapDistance[i] = gapDistance[i - 1] + dd * factor
  }

  return { time: t, distance: d, gapDistance, n }
}

/** Meilleur temps (s) pour couvrir `D` mètres sur un tableau de distance cumulée. */
function bestTimeForDistance(
  cumDist: number[],
  time: number[],
  D: number,
): { timeSec: number; startIdx: number; endIdx: number } | null {
  const n = cumDist.length
  let best = Infinity
  let res: { timeSec: number; startIdx: number; endIdx: number } | null = null
  let j = 0
  for (let i = 0; i < n; i++) {
    if (j < i) j = i
    while (j < n && cumDist[j] - cumDist[i] < D) j++
    if (j >= n) break // le reste du tracé est plus court que D
    // Interpolation sur le dernier sous-segment → précision infra-échantillon.
    const segDd = cumDist[j] - cumDist[j - 1]
    const segDt = time[j] - time[j - 1]
    const overshoot = cumDist[j] - cumDist[i] - D
    const tEnd = segDd > 0 ? time[j] - (overshoot / segDd) * segDt : time[j]
    const elapsed = tEnd - time[i]
    if (elapsed > 0 && elapsed < best) {
      best = elapsed
      res = { timeSec: +elapsed.toFixed(1), startIdx: i, endIdx: j }
    }
  }
  return res
}

/** Meilleure distance (m) couverte sur n'importe quelle fenêtre de `T` secondes. */
function bestDistanceForDuration(cumDist: number[], time: number[], T: number): number | null {
  const n = cumDist.length
  let best = 0
  let j = 0
  for (let i = 0; i < n; i++) {
    if (j < i) j = i
    while (j < n && time[j] - time[i] < T) j++
    if (j >= n) break
    // Interpolation pour couvrir EXACTEMENT T secondes.
    const segDt = time[j] - time[j - 1]
    const segDd = cumDist[j] - cumDist[j - 1]
    const overshoot = time[j] - time[i] - T
    const dEnd = segDt > 0 ? cumDist[j] - (overshoot / segDt) * segDd : cumDist[j]
    const covered = dEnd - cumDist[i]
    if (covered > best) best = covered
  }
  return best > 0 ? best : null
}

/**
 * Provenance ANONYMISABLE d'un record (§7). Permet de tracer d'où vient chaque chrono
 * (brut / GAP) sans jamais exposer l'identifiant réel de l'activité : `activityId` est
 * destiné à être pseudonymisé (hash court) par le rapport avant publication.
 */
export interface BestEffortSource {
  /** Identifiant (à pseudonymiser dans tout rapport) de l'activité source. */
  activityId: string | number
  /** Date de l'activité source (ISO) — sert au diagnostic, pas à identifier l'athlète. */
  activityDate: string
  /** Type de sport de l'activité source (Run / TrailRun…). */
  sportType: string
  /** Chrono BRUT sur la distance (s). */
  rawTimeSec: number
  /** Chrono « équivalent plat » (GAP) sur la distance (s). */
  gapTimeSec: number
  /** Perf brute nettement aidée par la descente → suspecte comme record « propre ». */
  suspectDownhill: boolean
  /** L'activité présente-t-elle un gros trou temporel (pause / arrêt) ? */
  hasTimeGap: boolean
  /** Couverture altimétrique (0..100 %) — <100 % = GAP moins fiable sur cette sortie. */
  altitudeCoveragePct: number
}

export interface BestEffortRecord {
  distanceM: number
  /** Meilleur temps « équivalent plat » (GAP) — la perf JUSTE, comparable entre parcours. */
  gapTimeSec: number
  /** Meilleur temps BRUT (chrono réel sur le terrain). */
  rawTimeSec: number
  /** Pente moyenne (fraction) de la fenêtre brute — sert à repérer une aide de la descente. */
  rawAvgGrade: number
  /** Vrai si la perf brute est nettement en descente → suspecte comme « record propre ». */
  suspectDownhill: boolean
  /** Provenance anonymisable (renseignée quand l'appelant fournit `source`). */
  source?: BestEffortSource
}

export interface ExtractedBestEfforts {
  /** Records par distance repère (uniquement celles réellement couvertes). */
  records: BestEffortRecord[]
  /** Efforts (distance, temps) sur les durées repères — alimentent computeCriticalSpeed. */
  criticalSpeedEfforts: Effort[]
}

/**
 * Extrait de UNE activité : les meilleurs temps par distance repère (bruts + équivalent
 * plat, avec repérage des descentes) et les efforts par durée (pour la vitesse critique).
 * Rejette les fenêtres à vitesse invraisemblable (artefacts GPS).
 */
export interface BestEffortSourceMeta {
  activityId: string | number
  activityDate?: string | null
  sportType?: string | null
}

export function extractBestEfforts(
  streams: BestEffortStreams,
  sourceMeta?: BestEffortSourceMeta,
): ExtractedBestEfforts | null {
  const c = buildCleanStreams(streams)
  if (!c) return null
  const { time, distance, gapDistance } = c
  const totalRaw = distance[distance.length - 1] - distance[0]
  const altGain = gapDistance[gapDistance.length - 1] // borne indicative

  // ── Qualité de l'activité (provenance) : trous temporels + couverture altimétrique.
  // Un gros trou de temps (auto-pause, arrêt) invalide la continuité d'un « record ».
  let hasTimeGap = false
  for (let i = 1; i < time.length; i++) {
    if (time[i] - time[i - 1] > 20) { hasTimeGap = true; break }
  }
  const rawAlt = toNumArray(streams.altitude)
  const altFinite = rawAlt.slice(0, c.n).filter((x) => Number.isFinite(x)).length
  const altitudeCoveragePct = c.n > 0 ? +((altFinite / c.n) * 100).toFixed(1) : 0

  const records: BestEffortRecord[] = []
  for (const D of RUN_BENCHMARK_DISTANCES_M) {
    if (totalRaw < D) continue // l'activité ne couvre pas cette distance
    const raw = bestTimeForDistance(distance, time, D)
    if (!raw) continue
    // Garde-fou vitesse : au-delà du plafond humain → artefact, on ignore.
    if (D / raw.timeSec > SPEED_HARD_MAX) continue
    const gap = bestTimeForDistance(gapDistance, time, D)
    const gapTimeSec = gap ? gap.timeSec : raw.timeSec
    // Pente moyenne de la fenêtre brute (pour signaler une aide de la descente).
    const startD = distance[raw.startIdx]
    const endD = startD + D
    // Altitude approximée via la variation gap/raw sur la fenêtre — on repère surtout
    // le SIGNE : si l'équivalent plat est nettement plus court que le brut, ça descendait.
    const rawWindowGap = gapDistance[raw.endIdx] - gapDistance[raw.startIdx]
    const rawWindowRaw = distance[raw.endIdx] - distance[raw.startIdx]
    const gradeProxy = rawWindowRaw > 0 ? (rawWindowGap / rawWindowRaw - 1) : 0
    const suspectDownhill = gradeProxy < SUSPECT_DOWNHILL_GRADE
    void endD
    void altGain
    const source: BestEffortSource | undefined = sourceMeta
      ? {
          activityId: sourceMeta.activityId,
          activityDate: sourceMeta.activityDate ?? '',
          sportType: String(sourceMeta.sportType ?? ''),
          rawTimeSec: raw.timeSec,
          gapTimeSec,
          suspectDownhill,
          hasTimeGap,
          altitudeCoveragePct,
        }
      : undefined
    records.push({
      distanceM: D,
      gapTimeSec,
      rawTimeSec: raw.timeSec,
      rawAvgGrade: +gradeProxy.toFixed(4),
      suspectDownhill,
      ...(source ? { source } : {}),
    })
  }

  const criticalSpeedEfforts: Effort[] = []
  const totalTime = time[time.length - 1] - time[0]
  for (const T of MEAN_MAX_DURATIONS_S) {
    if (totalTime < T) continue
    const distM = bestDistanceForDuration(gapDistance, time, T)
    if (distM == null) continue
    if (distM / T > SPEED_HARD_MAX) continue // artefact
    criticalSpeedEfforts.push({ distM: +distM.toFixed(1), timeSec: T })
  }

  return { records, criticalSpeedEfforts }
}

/** Record fusionné par distance : le vrai chrono ET la valeur « équivalent plat ». */
export interface MergedBestEffort {
  distanceM: number
  /** TON RECORD RÉEL : meilleur chrono terrain, descente comprise — il compte toujours. */
  rawTimeSec: number
  /** Info : ce record réel était-il aidé par une descente marquée ? (jamais « jeté »). */
  rawFromDownhill: boolean
  /** Meilleure perf « équivalent plat » (peut venir d'une AUTRE sortie) — sert au moteur
   *  pour prédire équitablement une course au profil différent. */
  gapTimeSec: number
  /** Provenance du CHRONO BRUT retenu (§7) — renseignée si les records portaient `source`. */
  rawSource?: BestEffortSource
  /** Provenance de la valeur GAP retenue (peut différer du brut) — §7. */
  gapSource?: BestEffortSource
}

/** Résultat d'évaluation de la qualité d'un record pour la durabilité personnelle (§8). */
export interface BestEffortQuality {
  /** Le record peut-il ALIMENTER librement l'exposant de durabilité personnel ? */
  eligibleForFade: boolean
  /** Poids robuste (0..1) — dépondération douce plutôt que rejet brutal quand pertinent. */
  weight: number
  /** Raisons machine de la dépondération / exclusion (explicabilité). */
  reasons: string[]
}

// Seuils de qualité (§8). Conservateurs, non calibrés sur le benchmark.
const QUALITY = {
  minAltitudeCoveragePct: 80,
  suspectDownhillWeight: 0.3,
  timeGapWeight: 0.4,
  lowAltitudeWeight: 0.5,
  nonRunWeight: 0,
  eligibilityFloor: 0.5,
  speedHardMax: SPEED_HARD_MAX,
} as const

/**
 * Évalue la qualité d'un record (§8) : plutôt que de filtrer brutalement, on DÉPONDÈRE.
 * Un record en descente suspecte, avec trou temporel, à couverture altimétrique faible,
 * à vitesse invraisemblable, ou hors course à pied/trail voit son poids réduit et n'est
 * plus éligible à activer LIBREMENT la durabilité personnelle (`eligibleForFade`).
 */
export function assessBestEffortQuality(
  record: Pick<MergedBestEffort, 'distanceM' | 'gapTimeSec' | 'rawFromDownhill' | 'gapSource'>,
): BestEffortQuality {
  const reasons: string[] = []
  let weight = 1
  const src = record.gapSource

  // Vitesse invraisemblable (équivalent plat) → artefact GPS.
  if (record.gapTimeSec > 0 && record.distanceM / record.gapTimeSec > QUALITY.speedHardMax) {
    reasons.push('implausible_speed')
    weight = 0
  }
  // Descente suspecte : le record peut être « aidé » — on ne l'interdit pas mais on le pèse.
  if (record.rawFromDownhill || src?.suspectDownhill) {
    reasons.push('suspect_downhill')
    weight = Math.min(weight, QUALITY.suspectDownhillWeight)
  }
  if (src?.hasTimeGap) {
    reasons.push('time_gap')
    weight = Math.min(weight, QUALITY.timeGapWeight)
  }
  if (src && src.altitudeCoveragePct < QUALITY.minAltitudeCoveragePct) {
    reasons.push('low_altitude_coverage')
    weight = Math.min(weight, QUALITY.lowAltitudeWeight)
  }
  if (src && src.sportType && !RUN_SPORTS_LC.has(src.sportType.toLowerCase())) {
    reasons.push('non_running_sport')
    weight = QUALITY.nonRunWeight
  }

  return { eligibleForFade: weight >= QUALITY.eligibilityFloor, weight: +weight.toFixed(3), reasons }
}

/**
 * Fusionne les records de plusieurs activités. On NE JETTE RIEN :
 *   • `rawTimeSec` = le meilleur CHRONO RÉEL sur la distance (une descente qui bat ton
 *     temps EST ton record, elle compte) ;
 *   • `gapTimeSec` = la meilleure perf « équivalent plat » (indépendante), que le moteur
 *     utilise seulement pour prédire une course d'un autre profil.
 * Les deux peuvent provenir de sorties différentes — c'est voulu.
 */
export function mergeBestEfforts(perActivity: BestEffortRecord[][]): Map<number, MergedBestEffort> {
  const best = new Map<number, MergedBestEffort>()
  for (const list of perActivity) {
    for (const r of list) {
      const cur = best.get(r.distanceM)
      if (!cur) {
        best.set(r.distanceM, {
          distanceM: r.distanceM,
          rawTimeSec: r.rawTimeSec,
          rawFromDownhill: r.suspectDownhill,
          gapTimeSec: r.gapTimeSec,
          ...(r.source ? { rawSource: r.source, gapSource: r.source } : {}),
        })
        continue
      }
      // Record réel = meilleur chrono, quel que soit le profil (descente comprise).
      if (r.rawTimeSec < cur.rawTimeSec) {
        cur.rawTimeSec = r.rawTimeSec
        cur.rawFromDownhill = r.suspectDownhill
        if (r.source) cur.rawSource = r.source
      }
      // Valeur équivalent-plat = meilleure indépendamment (pour la prédiction équitable).
      if (r.gapTimeSec < cur.gapTimeSec) {
        cur.gapTimeSec = r.gapTimeSec
        if (r.source) cur.gapSource = r.source
      }
    }
  }
  return best
}

// ── Records de TRAIL : meilleures ascensions / VAM (Étape 3) ─────────────────────

export interface ClimbEffort {
  /** Dénivelé positif de l'ascension (m). */
  ascentM: number
  /** Durée de l'ascension (s). */
  durationS: number
  /** Distance horizontale parcourue (m). */
  distM: number
  /** VAM = vitesse ascensionnelle moyenne (m/h). */
  vamMh: number
  /** Pente moyenne de l'ascension (%). */
  avgGradePct: number
}

export interface ClimbDetectionOptions {
  /** Dénivelé minimum pour retenir une ascension (m). */
  minAscentM?: number
  /** Pente moyenne minimum (%). */
  minGradePct?: number
  /** Tolérance de redescente avant de clore une ascension (m). */
  hysteresisM?: number
}

const CLIMB_DEFAULTS: Required<ClimbDetectionOptions> = { minAscentM: 100, minGradePct: 3, hysteresisM: 10 }

/**
 * Détecte les ASCENSIONS soutenues d'une activité (vallée → sommet) par détection de
 * pics/creux sur l'altitude lissée, avec hystérésis anti-bruit. Pour chaque ascension :
 * dénivelé, durée, distance, VAM (m/h) et pente moyenne. Sert les records de trail
 * (meilleure ascension / meilleure VAM) — l'altitude est lissée avant tout calcul.
 */
export function detectClimbs(streams: BestEffortStreams, options?: ClimbDetectionOptions): ClimbEffort[] {
  const o = { ...CLIMB_DEFAULTS, ...(options ?? {}) }
  const time = toNumArray(streams.time)
  const distance = toNumArray(streams.distance)
  const rawAlt = toNumArray(streams.altitude)
  const n = Math.min(time.length, distance.length, rawAlt.length)
  if (n < 5 || !rawAlt.slice(0, n).every((x) => Number.isFinite(x))) return []
  const alt = smoothAltitudeByDistance(rawAlt.slice(0, n), distance.slice(0, n), { medianWindow: 5, smoothingDistanceM: 50 })

  const climbs: ClimbEffort[] = []
  let valleyIdx = 0
  let valleyAlt = alt[0]
  let peakIdx = 0
  let peakAlt = alt[0]

  const close = (vIdx: number, pIdx: number) => {
    const ascentM = alt[pIdx] - alt[vIdx]
    if (ascentM < o.minAscentM) return
    const durationS = time[pIdx] - time[vIdx]
    const distM = distance[pIdx] - distance[vIdx]
    if (!(durationS > 0) || !(distM > 0)) return
    const avgGradePct = (ascentM / distM) * 100
    if (avgGradePct < o.minGradePct) return
    climbs.push({
      ascentM: Math.round(ascentM),
      durationS: Math.round(durationS),
      distM: Math.round(distM),
      vamMh: Math.round((ascentM * 3600) / durationS),
      avgGradePct: +avgGradePct.toFixed(1),
    })
  }

  for (let i = 1; i < n; i++) {
    if (alt[i] > peakAlt) {
      peakAlt = alt[i]
      peakIdx = i
    } else if (peakAlt - valleyAlt < o.minAscentM && alt[i] < valleyAlt) {
      // Toujours en descente avant toute vraie montée → on abaisse la vallée.
      valleyAlt = alt[i]
      valleyIdx = i
      peakAlt = alt[i]
      peakIdx = i
    } else if (peakAlt - alt[i] > o.hysteresisM) {
      // Redescente franche depuis le sommet → on clôt l'ascension vallée→sommet.
      close(valleyIdx, peakIdx)
      valleyAlt = alt[i]
      valleyIdx = i
      peakAlt = alt[i]
      peakIdx = i
    }
  }
  close(valleyIdx, peakIdx)
  return climbs
}

/** Meilleure ascension d'une liste (par VAM). */
export function bestClimb(climbs: ClimbEffort[]): ClimbEffort | null {
  return climbs.reduce<ClimbEffort | null>((best, c) => (!best || c.vamMh > best.vamMh ? c : best), null)
}

// ── Courbe VERTICALE (Étape §11) : meilleure ascension par PALIER de dénivelé ─────────
// Fondation d'une future « courbe verticale » (équivalent mean-max, mais en D+). On extrait
// le temps MINIMAL pour grimper 100 / 300 / 500 / 1000 m de D+ cumulé (→ VAM la plus haute
// tenue sur ce dénivelé). PAS branché sur la projection centrale (cf. §11) : donnée
// explicative + tests uniquement.

/** Paliers de dénivelé positif (m) pour la courbe verticale. */
export const VERTICAL_ASCENT_TIERS_M = [100, 300, 500, 1000] as const

export interface VerticalEffort {
  /** Palier visé (m de D+). */
  targetAscentM: number
  /** Dénivelé positif réellement couvert (≥ palier). */
  ascentM: number
  /** Durée de l'effort (s). */
  durationS: number
  /** Distance horizontale parcourue (m). */
  distM: number
  /** VAM = vitesse ascensionnelle moyenne (m/h). */
  vamMh: number
  /** Pente moyenne de l'effort (%). */
  avgGradePct: number
  /** Provenance anonymisable (si `sourceMeta` fourni). */
  source?: BestEffortSource
  /** L'activité présente-t-elle un gros trou temporel ? (qualité). */
  hasTimeGap?: boolean
}

/**
 * Extrait, pour chaque palier de D+, l'ascension la plus RAPIDE (VAM max) d'UNE activité,
 * par fenêtre glissante sur le dénivelé positif cumulé (altitude lissée). Rejette les
 * fenêtres à VAM invraisemblable (> 3000 m/h ≈ artefact baro/GPS).
 */
export function extractVerticalEfforts(
  streams: BestEffortStreams,
  sourceMeta?: BestEffortSourceMeta,
): VerticalEffort[] {
  const time = toNumArray(streams.time)
  const distance = toNumArray(streams.distance)
  const rawAlt = toNumArray(streams.altitude)
  const n = Math.min(time.length, distance.length, rawAlt.length)
  if (n < 5 || !rawAlt.slice(0, n).every((x) => Number.isFinite(x))) return []
  if (!(time[n - 1] > time[0])) return []
  const alt = smoothAltitudeByDistance(rawAlt.slice(0, n), distance.slice(0, n), { medianWindow: 5, smoothingDistanceM: 50 })

  // Dénivelé positif CUMULÉ (monotone non décroissant).
  const cumUp = new Array<number>(n)
  cumUp[0] = 0
  for (let i = 1; i < n; i++) {
    const dUp = alt[i] - alt[i - 1]
    cumUp[i] = cumUp[i - 1] + (dUp > 0 ? dUp : 0)
  }
  const totalUp = cumUp[n - 1]

  let hasTimeGap = false
  for (let i = 1; i < n; i++) {
    if (time[i] - time[i - 1] > 20) { hasTimeGap = true; break }
  }

  const VAM_HARD_MAX = 3000 // m/h — au-delà = artefact
  const out: VerticalEffort[] = []
  for (const A of VERTICAL_ASCENT_TIERS_M) {
    if (totalUp < A) continue
    let bestDur = Infinity
    let bestI = -1
    let bestJ = -1
    let j = 0
    for (let i = 0; i < n; i++) {
      if (j < i) j = i
      while (j < n && cumUp[j] - cumUp[i] < A) j++
      if (j >= n) break
      const dur = time[j] - time[i]
      if (dur > 0 && dur < bestDur) { bestDur = dur; bestI = i; bestJ = j }
    }
    if (bestI < 0 || bestJ < 0 || !(bestDur > 0)) continue
    const ascentM = cumUp[bestJ] - cumUp[bestI]
    const distM = Math.max(0, distance[bestJ] - distance[bestI])
    const vamMh = (ascentM * 3600) / bestDur
    if (vamMh > VAM_HARD_MAX) continue // artefact
    const avgGradePct = distM > 0 ? (ascentM / distM) * 100 : 0
    const effort: VerticalEffort = {
      targetAscentM: A,
      ascentM: Math.round(ascentM),
      durationS: Math.round(bestDur),
      distM: Math.round(distM),
      vamMh: Math.round(vamMh),
      avgGradePct: +avgGradePct.toFixed(1),
      hasTimeGap,
    }
    if (sourceMeta) {
      effort.source = {
        activityId: sourceMeta.activityId,
        activityDate: sourceMeta.activityDate ?? '',
        sportType: String(sourceMeta.sportType ?? ''),
        rawTimeSec: Math.round(bestDur),
        gapTimeSec: Math.round(bestDur),
        suspectDownhill: false,
        hasTimeGap,
        altitudeCoveragePct: 100,
      }
    }
    out.push(effort)
  }
  return out
}

/** Meilleur effort vertical par palier (VAM max), fusionné sur plusieurs activités. */
export function mergeVerticalEfforts(perActivity: VerticalEffort[][]): Record<number, VerticalEffort> {
  const best: Record<number, VerticalEffort> = {}
  for (const list of perActivity) {
    for (const e of list) {
      const cur = best[e.targetAscentM]
      if (!cur || e.vamMh > cur.vamMh) best[e.targetAscentM] = e
    }
  }
  return best
}

/** Familles course à pied / trail (records extraits uniquement de ces activités). */
const RUN_SPORTS_LC = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])

/** Activité minimale nécessaire à l'agrégation des records. */
export interface BestEffortActivity {
  strava_activity_id: string | number
  type?: string | null
  sport_type?: string | null
  start_date?: string | null
}

export interface AthleteBestEfforts {
  /** Records par distance (triés) : chrono réel + valeur équivalent-plat. */
  records: MergedBestEffort[]
  /** Vitesse critique estimée à partir de la courbe mean-max (ou null). */
  criticalSpeed: CriticalSpeedResult | null
  /** Meilleure ascension (VAM la plus élevée) sur l'ensemble des sorties (trail). */
  bestClimb: ClimbEffort | null
  /** Courbe verticale : meilleure ascension par palier de D+ (100/300/500/1000 m). §11 */
  bestClimbByTier: Record<number, VerticalEffort>
  /** Nombre d'activités running réellement exploitées (avec streams). */
  activitiesUsed: number
}

/**
 * Agrège les meilleures perfs d'un athlète sur SES activités course à pied/trail
 * (fenêtre déjà sélectionnée par l'appelant — records = longue mémoire, pas 56 j).
 * NE JETTE RIEN : garde le meilleur chrono réel par distance ET la meilleure valeur
 * équivalent-plat, et estime la vitesse critique depuis la courbe mean-max poolée.
 */
export function buildAthleteBestEfforts(
  activities: BestEffortActivity[],
  streamsById: Record<string, BestEffortStreams>,
): AthleteBestEfforts {
  const perActivityRecords: BestEffortRecord[][] = []
  // Pour la vitesse critique : meilleure distance atteinte sur chaque durée repère,
  // toutes activités confondues (la courbe mean-max « longue mémoire »).
  const bestDistByDuration = new Map<number, number>()
  let bestClimbOverall: ClimbEffort | null = null
  const perActivityVertical: VerticalEffort[][] = []
  let used = 0

  for (const a of activities) {
    const sport = String(a.sport_type ?? a.type ?? '').toLowerCase()
    if (!RUN_SPORTS_LC.has(sport)) continue
    const streams = streamsById[String(a.strava_activity_id)]
    if (!streams) continue
    const sourceMeta: BestEffortSourceMeta = {
      activityId: a.strava_activity_id,
      activityDate: a.start_date ?? null,
      sportType: a.sport_type ?? a.type ?? null,
    }
    const ext = extractBestEfforts(streams, sourceMeta)
    if (!ext) continue
    used++
    perActivityRecords.push(ext.records)
    for (const e of ext.criticalSpeedEfforts) {
      const cur = bestDistByDuration.get(e.timeSec)
      if (cur == null || e.distM > cur) bestDistByDuration.set(e.timeSec, e.distM)
    }
    const climb = bestClimb(detectClimbs(streams))
    if (climb && (!bestClimbOverall || climb.vamMh > bestClimbOverall.vamMh)) bestClimbOverall = climb
    perActivityVertical.push(extractVerticalEfforts(streams, sourceMeta))
  }

  const merged = mergeBestEfforts(perActivityRecords)
  const records = [...merged.values()].sort((x, y) => x.distanceM - y.distanceM)

  // Vitesse critique : régression sur la fenêtre 2–15 min (là où le modèle est valide).
  const csEfforts: Effort[] = [...bestDistByDuration.entries()]
    .filter(([T]) => T >= 120 && T <= 900)
    .map(([T, distM]) => ({ distM, timeSec: T }))
  const criticalSpeed = computeCriticalSpeed(csEfforts)

  const bestClimbByTier = mergeVerticalEfforts(perActivityVertical)

  return { records, criticalSpeed, bestClimb: bestClimbOverall, bestClimbByTier, activitiesUsed: used }
}
