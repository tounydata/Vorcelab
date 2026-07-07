// Comparaison projection vs réel : une fois la course courue, on confronte le temps
// et l'allure projetés par tronçon au déroulé réel (streams Strava de l'activité liée).
import type { ProjectionResult } from './computeRaceProjection'
import type { StreamData } from './streams'

export interface SectionCompare {
  startKm: number
  endKm: number
  type: 'up' | 'down' | 'flat'
  projS: number      // temps projeté du tronçon (s)
  actualS: number    // temps réel du tronçon (s)
  deltaS: number     // réel − projeté (positif = plus lent que prévu)
  projPaceS: number  // allure projetée (s/km)
  actualPaceS: number
}

export interface RaceComparison {
  projTotalS: number
  actualTotalS: number
  deltaS: number          // réel − projeté (positif = plus lent)
  deltaPct: number        // écart relatif (%)
  projDistKm: number
  actualDistKm: number
  sections: SectionCompare[]
  /** Tronçon où le plus de temps a été perdu vs la projection (deltaS max). */
  worstSection: SectionCompare | null
  /** Tronçon où le plus de temps a été gagné vs la projection (deltaS min). */
  bestSection: SectionCompare | null
}

/** Activité Strava (ligne brute) candidate au rôle de « résultat de course ». */
export interface ActivityLite {
  id: string                        // uuid (strava_activities.id) — clé de liaison
  stravaActivityId?: string | null  // id Strava — clé des streams
  name?: string | null
  type?: string | null
  sport_type?: string | null
  start_date?: string | null
  distance?: number | null          // mètres
  moving_time?: number | null       // s
  elapsed_time?: number | null      // s
  total_elevation_gain?: number | null
  tempC?: number | null             // °C moyen (Strava average_temp) — contexte chaleur du débrief
}

const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun'])

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

/** Normalise une ligne strava_activities en ActivityLite. */
export function toActivityLite(row: Record<string, unknown>): ActivityLite {
  // Température : soit la colonne aliasée (average_temp), soit dans raw_data (select *).
  const raw = row.raw_data as Record<string, unknown> | null | undefined
  const tempC = num(row.average_temp) ?? (raw ? num(raw.average_temp) : null)
  return {
    id: String(row.id),
    stravaActivityId: row.strava_activity_id != null ? String(row.strava_activity_id) : null,
    name: (row.name as string) ?? null,
    type: (row.type as string) ?? null,
    sport_type: (row.sport_type as string) ?? null,
    start_date: (row.start_date as string) ?? null,
    distance: num(row.distance),
    moving_time: num(row.moving_time),
    elapsed_time: num(row.elapsed_time),
    total_elevation_gain: num(row.total_elevation_gain),
    tempC,
  }
}

/**
 * Auto-détecte l'activité Strava qui correspond le mieux à une course :
 * course à pied, datée à ±2 j de la course, distance à ±25 % de la distance projetée.
 * Retourne la meilleure candidate (score = proximité date puis distance) ou null.
 */
export function findRaceActivity(
  activities: Record<string, unknown>[],
  raceDateISO: string,
  raceDistM: number,
  maxDayGap = 2,
): ActivityLite | null {
  const raceDay = new Date(raceDateISO).getTime()
  if (!Number.isFinite(raceDay)) return null
  const cands = activities.map(toActivityLite).filter((a) => {
    if (!a.start_date || a.distance == null) return false
    const kind = a.sport_type || a.type || ''
    if (!RUN_TYPES.has(kind)) return false
    const dayGap = Math.abs(new Date(a.start_date).getTime() - raceDay) / 86_400_000
    if (!(dayGap <= maxDayGap)) return false
    if (raceDistM > 0) {
      const ratio = a.distance / raceDistM
      if (ratio < 0.75 || ratio > 1.25) return false
    }
    return true
  })
  if (!cands.length) return null
  cands.sort((a, b) => {
    const da = Math.abs(new Date(a.start_date!).getTime() - raceDay)
    const db = Math.abs(new Date(b.start_date!).getTime() - raceDay)
    if (da !== db) return da - db
    // à date égale, la distance la plus proche
    const ra = raceDistM > 0 ? Math.abs((a.distance ?? 0) - raceDistM) : 0
    const rb = raceDistM > 0 ? Math.abs((b.distance ?? 0) - raceDistM) : 0
    return ra - rb
  })
  return cands[0]
}

/**
 * Confronte une projection (sections + temps) au déroulé réel d'une activité.
 * Utilise les streams distance[] / time[] pour le temps réel cumulé interpolé par km.
 */
export function compareProjectionToActual(proj: ProjectionResult, stream: StreamData): RaceComparison | null {
  const dist = stream.distance?.data
  const time = stream.time?.data
  if (!dist || !time || dist.length < 2 || dist.length !== time.length) return null

  const t0 = time[0]
  const actualTotalS = time[time.length - 1] - t0
  const actualDistKm = dist[dist.length - 1] / 1000

  // Temps réel écoulé (s) à une distance donnée (km), par interpolation linéaire.
  const timeAtKm = (km: number): number => {
    const target = km * 1000
    if (target <= dist[0]) return 0
    if (target >= dist[dist.length - 1]) return actualTotalS
    let lo = 0, hi = dist.length - 1
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (dist[mid] < target) lo = mid
      else hi = mid
    }
    const d0 = dist[lo], d1 = dist[hi]
    const f = d1 > d0 ? (target - d0) / (d1 - d0) : 0
    return (time[lo] + (time[hi] - time[lo]) * f) - t0
  }

  const sections: SectionCompare[] = proj.sections.map((s, i) => {
    const projS = proj.sectionTimes[i] ?? 0
    const actualS = Math.max(0, timeAtKm(s.endKm) - timeAtKm(s.startKm))
    const km = Math.max(0.01, s.endKm - s.startKm)
    return {
      startKm: s.startKm, endKm: s.endKm, type: s.type,
      projS, actualS, deltaS: actualS - projS,
      projPaceS: projS / km, actualPaceS: actualS / km,
    }
  })

  let worst: SectionCompare | null = null, best: SectionCompare | null = null
  for (const sec of sections) {
    if (!worst || sec.deltaS > worst.deltaS) worst = sec
    if (!best || sec.deltaS < best.deltaS) best = sec
  }

  return {
    projTotalS: proj.estTimeS,
    actualTotalS,
    deltaS: actualTotalS - proj.estTimeS,
    deltaPct: proj.estTimeS > 0 ? ((actualTotalS - proj.estTimeS) / proj.estTimeS) * 100 : 0,
    projDistKm: proj.totalDistM / 1000,
    actualDistKm,
    sections,
    worstSection: worst,
    bestSection: best,
  }
}
