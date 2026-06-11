// Export « parcours avec pacing » : GPX horodaté section par section depuis la
// projection Vorcelab, importable comme parcours montre (Virtual Partner Garmin,
// pacer COROS) → le coureur court contre sa projection, sur sa montre.
// 🌙 FONCTION DORMANTE : aucune UI ne l'appelle aujourd'hui. La logique est codée
// et testée, prête à être activée (PACED_COURSE_EXPORT_ENABLED = true) le jour où
// on décide de livrer l'export. Cf. principe des fonctions dormantes (watchExport).

import type { GpxPoint } from './computeRaceProjection'

/** 🌙 Dormant : passera à true le jour où l'export parcours est livré dans l'UI. */
export const PACED_COURSE_EXPORT_ENABLED = false

export interface PacedCourseInput {
  /** Nom de la course (devient le nom du parcours sur la montre). */
  name: string
  /** Trace GPX d'origine (mêmes points que la projection). */
  points: GpxPoint[]
  /** Sections de la projection (bornes en km, dans l'ordre). */
  sections: { startKm: number; endKm: number }[]
  /** Temps projeté par section (secondes), aligné sur `sections`. */
  sectionTimes: number[]
  /** Heure de départ réelle si connue — sinon horodatage neutre (seuls les deltas comptent). */
  startTime?: Date
}

const EARTH_R = 6_371_000

function hav(a: GpxPoint, b: GpxPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(h))
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Temps cumulé (s) à la distance d (m), interpolé au prorata dans chaque section. */
function timeAtDistance(distM: number, secEndM: number[], sectionTimes: number[]): number {
  let cumTime = 0
  let secStart = 0
  for (let i = 0; i < secEndM.length; i++) {
    const secLen = secEndM[i] - secStart
    if (distM <= secEndM[i] || i === secEndM.length - 1) {
      const frac = secLen > 0 ? Math.min(1, Math.max(0, (distM - secStart) / secLen)) : 1
      return cumTime + frac * sectionTimes[i]
    }
    cumTime += sectionTimes[i]
    secStart = secEndM[i]
  }
  return cumTime
}

/**
 * Construit un GPX 1.1 dont chaque point porte un `<time>` cohérent avec la
 * projection (allure constante au sein d'une section). Pur et testé — l'UI ne
 * l'appelle pas tant que PACED_COURSE_EXPORT_ENABLED est false.
 */
export function buildPacedCourseGpx(input: PacedCourseInput): string {
  const { name, points, sections, sectionTimes } = input
  if (points.length < 2) throw new Error('Trace trop courte pour un parcours.')
  if (sections.length === 0 || sections.length !== sectionTimes.length) {
    throw new Error('Sections et temps par section incohérents.')
  }
  // Horodatage neutre par défaut : la montre n'utilise que les écarts de temps.
  const start = (input.startTime ?? new Date('2000-01-01T06:00:00Z')).getTime()
  const secEndM = sections.map((s) => s.endKm * 1000)

  let cum = 0
  const trkpts: string[] = []
  for (let i = 0; i < points.length; i++) {
    if (i > 0) cum += hav(points[i - 1], points[i])
    const t = new Date(start + Math.round(timeAtDistance(cum, secEndM, sectionTimes)) * 1000)
    const ele = points[i].ele != null ? `<ele>${points[i].ele!.toFixed(1)}</ele>` : ''
    trkpts.push(
      `<trkpt lat="${points[i].lat.toFixed(6)}" lon="${points[i].lon.toFixed(6)}">${ele}<time>${t.toISOString()}</time></trkpt>`,
    )
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Vorcelab" xmlns="http://www.topografix.com/GPX/1/1">',
    `<trk><name>${escapeXml(name)} — pacing Vorcelab</name><trkseg>`,
    ...trkpts,
    '</trkseg></trk>',
    '</gpx>',
  ].join('\n')
}

/**
 * 🌙 Dormant : déclencherait le téléchargement du parcours horodaté.
 * Rejette tant que PACED_COURSE_EXPORT_ENABLED est false — jamais appelée par l'app.
 */
export function downloadPacedCourse(_input: PacedCourseInput): Promise<never> {
  return Promise.reject(
    new Error('Export parcours avec pacing non activé (fonction dormante).'),
  )
}
