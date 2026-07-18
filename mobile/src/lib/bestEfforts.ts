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
// Fenêtre de lissage altimétrique (nombre d'échantillons de part et d'autre).
const ELEV_SMOOTH_HALF = 2
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

/** Moyenne glissante (anti-bruit GPS/baro) — indispensable avant de calculer une pente. */
function smooth(values: number[], half: number): number[] {
  if (half <= 0 || values.length === 0) return values.slice()
  const out = new Array<number>(values.length)
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let cnt = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      if (Number.isFinite(values[j])) {
        sum += values[j]
        cnt++
      }
    }
    out[i] = cnt > 0 ? sum / cnt : values[i]
  }
  return out
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

  const rawAlt = toNumArray(streams.altitude)
  const hasAlt = rawAlt.length >= n && rawAlt.slice(0, n).every((x) => Number.isFinite(x))
  const alt = hasAlt ? smooth(rawAlt.slice(0, n), ELEV_SMOOTH_HALF) : null

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
export function extractBestEfforts(streams: BestEffortStreams): ExtractedBestEfforts | null {
  const c = buildCleanStreams(streams)
  if (!c) return null
  const { time, distance, gapDistance } = c
  const totalRaw = distance[distance.length - 1] - distance[0]
  const altGain = gapDistance[gapDistance.length - 1] // borne indicative

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
    records.push({
      distanceM: D,
      gapTimeSec,
      rawTimeSec: raw.timeSec,
      rawAvgGrade: +gradeProxy.toFixed(4),
      suspectDownhill,
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
        })
        continue
      }
      // Record réel = meilleur chrono, quel que soit le profil (descente comprise).
      if (r.rawTimeSec < cur.rawTimeSec) {
        cur.rawTimeSec = r.rawTimeSec
        cur.rawFromDownhill = r.suspectDownhill
      }
      // Valeur équivalent-plat = meilleure indépendamment (pour la prédiction équitable).
      if (r.gapTimeSec < cur.gapTimeSec) cur.gapTimeSec = r.gapTimeSec
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
  let used = 0

  for (const a of activities) {
    const sport = String(a.sport_type ?? a.type ?? '').toLowerCase()
    if (!RUN_SPORTS_LC.has(sport)) continue
    const streams = streamsById[String(a.strava_activity_id)]
    if (!streams) continue
    const ext = extractBestEfforts(streams)
    if (!ext) continue
    used++
    perActivityRecords.push(ext.records)
    for (const e of ext.criticalSpeedEfforts) {
      const cur = bestDistByDuration.get(e.timeSec)
      if (cur == null || e.distM > cur) bestDistByDuration.set(e.timeSec, e.distM)
    }
  }

  const merged = mergeBestEfforts(perActivityRecords)
  const records = [...merged.values()].sort((x, y) => x.distanceM - y.distanceM)

  // Vitesse critique : régression sur la fenêtre 2–15 min (là où le modèle est valide).
  const csEfforts: Effort[] = [...bestDistByDuration.entries()]
    .filter(([T]) => T >= 120 && T <= 900)
    .map(([T, distM]) => ({ distM, timeSec: T }))
  const criticalSpeed = computeCriticalSpeed(csEfforts)

  return { records, criticalSpeed, activitiesUsed: used }
}
