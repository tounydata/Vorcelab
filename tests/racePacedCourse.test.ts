import { describe, it, expect } from 'vitest'
import {
  PACED_COURSE_EXPORT_ENABLED,
  buildPacedCourseGpx,
  downloadPacedCourse,
} from '../src/lib/racePacedCourse'

// 1 km ≈ 0.0089932° de latitude (méridien) — points alignés plein nord.
const KM_LAT = 0.0089932

function straightPoints(everyKm: number, totalKm: number) {
  const pts = []
  for (let d = 0; d <= totalKm + 1e-9; d += everyKm) {
    pts.push({ lat: d * KM_LAT, lon: 0, ele: 100 + d * 10 })
  }
  return pts
}

function parseTimes(gpx: string): number[] {
  return [...gpx.matchAll(/<time>([^<]+)<\/time>/g)].map((m) => new Date(m[1]).getTime() / 1000)
}

describe('racePacedCourse (fonction dormante)', () => {
  it('est dormante : flag désactivé et download rejette', async () => {
    expect(PACED_COURSE_EXPORT_ENABLED).toBe(false)
    await expect(
      downloadPacedCourse({ name: 'X', points: [], sections: [], sectionTimes: [] }),
    ).rejects.toThrow(/dormante/)
  })

  it('horodate les points au prorata du temps de chaque section', () => {
    // 2 km plein nord, 2 sections : 0→1 km en 300 s, 1→2 km en 360 s.
    const points = straightPoints(0.5, 2)
    const gpx = buildPacedCourseGpx({
      name: 'Test',
      points,
      sections: [
        { startKm: 0, endKm: 1 },
        { startKm: 1, endKm: 2 },
      ],
      sectionTimes: [300, 360],
    })
    const times = parseTimes(gpx)
    expect(times).toHaveLength(points.length)
    const rel = times.map((t) => t - times[0])
    // Monotone croissant.
    for (let i = 1; i < rel.length; i++) expect(rel[i]).toBeGreaterThan(rel[i - 1])
    // Mi-section 1 ≈ 150 s, fin section 1 ≈ 300 s, arrivée ≈ 660 s (tolérance haversine).
    expect(rel[1]).toBeGreaterThan(140)
    expect(rel[1]).toBeLessThan(160)
    expect(rel[2]).toBeGreaterThan(290)
    expect(rel[2]).toBeLessThan(310)
    expect(rel[4]).toBeGreaterThan(650)
    expect(rel[4]).toBeLessThan(670)
  })

  it('produit un GPX valide avec nom échappé et altitudes', () => {
    const gpx = buildPacedCourseGpx({
      name: 'Trail <des> Aiguilles & Co',
      points: straightPoints(1, 2),
      sections: [{ startKm: 0, endKm: 2 }],
      sectionTimes: [600],
    })
    expect(gpx).toContain('<?xml version="1.0"')
    expect(gpx).toContain('creator="Vorcelab"')
    expect(gpx).toContain('Trail &lt;des&gt; Aiguilles &amp; Co')
    expect(gpx).toContain('<ele>100.0</ele>')
  })

  it('rejette les entrées incohérentes', () => {
    const pts = straightPoints(1, 2)
    expect(() =>
      buildPacedCourseGpx({ name: 'X', points: [pts[0]], sections: [{ startKm: 0, endKm: 1 }], sectionTimes: [60] }),
    ).toThrow(/courte/)
    expect(() =>
      buildPacedCourseGpx({ name: 'X', points: pts, sections: [{ startKm: 0, endKm: 1 }], sectionTimes: [] }),
    ).toThrow(/incohérents/)
  })
})
