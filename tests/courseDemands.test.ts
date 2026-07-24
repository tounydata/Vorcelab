import { describe, it, expect } from 'vitest'
import {
  deriveCourseDemands, courseDemandsFromPoints, type DemandSection, type GpxDemandPoint,
} from '../src/lib/coach/courseDemands'
import { generateTrainingPlan, type PlanInput } from '../src/lib/coach/planGenerator'
import { getWorkout } from '../src/lib/coach/workouts'

// ── Fabriques de sections synthétiques ────────────────────────────────────────
const up = (dplus: number, distKm: number, grade = dplus / (distKm * 1000) * 100): DemandSection =>
  ({ type: 'up', dplus, dminus: 0, dist: distKm * 1000, grade })
const down = (dminus: number, distKm: number, extra: Partial<DemandSection> = {}): DemandSection =>
  ({ type: 'down', dplus: 0, dminus, dist: distKm * 1000, grade: -dminus / (distKm * 1000) * 100, ...extra })
const flat = (distKm: number): DemandSection =>
  ({ type: 'flat', dplus: 0, dminus: 0, dist: distKm * 1000, grade: 0 })

describe('deriveCourseDemands — forme du parcours', () => {
  it('parcours plat : aucune emphase, shape flat', () => {
    const d = deriveCourseDemands([flat(10), up(30, 2), down(30, 2), flat(6)], { distanceKm: 20, dplus: 30, dminus: 30 })
    expect(d.shape).toBe('flat')
    expect(d.emphasis).toEqual([])
    expect(d.verticalRatioMPerKm).toBeLessThan(8)
  })

  it('une grande ascension continue → shape single_big_climb + climbing', () => {
    // 50 km, 2000 m sur UNE montée de 10 km, le reste plat/descente.
    const d = deriveCourseDemands(
      [flat(5), up(2000, 10, 20), flat(5), down(2000, 20), flat(10)],
      { distanceKm: 50, dplus: 2000, dminus: 2000 },
    )
    expect(d.shape).toBe('single_big_climb')
    expect(d.biggestClimbDplus).toBe(2000)
    expect(d.emphasis).toContain('climbing')
    expect(d.emphasis).toContain('durability') // 50 km + 2000 m
    expect(d.significantClimbs).toBe(1)
  })

  it('même D+ total mais 20 bosses courtes → mountainous, PAS single_big_climb', () => {
    const secs: DemandSection[] = []
    for (let i = 0; i < 20; i++) { secs.push(up(100, 1.2, 8.3)); secs.push(down(100, 1.2)) }
    const d = deriveCourseDemands(secs, { distanceKm: 50, dplus: 2000, dminus: 2000 })
    expect(d.shape).toBe('mountainous')
    expect(d.significantClimbs).toBe(20)
    expect(d.biggestClimbDplus).toBe(100)
    expect(d.emphasis).toContain('climbing')
  })

  it('descente raide + technique → emphase descending', () => {
    const d = deriveCourseDemands(
      [up(1400, 7, 20), down(1400, 5, { grade: -28, turnDegPerKm: 320 })],
      { distanceKm: 12, dplus: 1400, dminus: 1400 },
    )
    expect(d.technicalDescent).toBe(true)
    expect(d.steepDescentShare).toBeGreaterThanOrEqual(0.25)
    expect(d.emphasis).toContain('descending')
  })

  it('déterministe : mêmes entrées → mêmes sorties', () => {
    const secs = [up(500, 3), down(500, 3), flat(4)]
    const totals = { distanceKm: 10, dplus: 500, dminus: 500 }
    expect(deriveCourseDemands(secs, totals)).toEqual(deriveCourseDemands(secs, totals))
  })
})

describe('courseDemandsFromPoints — depuis le GPX brut', () => {
  it('renvoie null pour un tracé inexploitable', () => {
    expect(courseDemandsFromPoints(null)).toBeNull()
    expect(courseDemandsFromPoints([{ lat: 45, lon: 6, ele: null }])).toBeNull()
    expect(courseDemandsFromPoints([{ lat: 45, lon: 6, ele: null }, { lat: 45.01, lon: 6, ele: null }])).toBeNull()
  })

  it('détecte une longue montée continue depuis des points', () => {
    // Génère ~6 km de montée régulière (600 m D+) puis 6 km de descente.
    const pts: GpxDemandPoint[] = []
    let ele = 200
    for (let i = 0; i <= 60; i++) { pts.push({ lat: 45 + i * 0.001, lon: 6, ele }); ele += 10 } // +600 m
    for (let i = 1; i <= 60; i++) { pts.push({ lat: 45.06 + i * 0.001, lon: 6, ele }); ele -= 10 } // -600 m
    const d = courseDemandsFromPoints(pts)
    expect(d).not.toBeNull()
    expect(d!.dplus).toBeGreaterThan(500)
    expect(d!.maxAltitudeM).toBeGreaterThan(700)
    expect(d!.emphasis).toContain('climbing')
  })
})

// ── Intégration : la FORME du parcours change réellement le plan ───────────────
describe('le plan coach dépend de la forme du parcours (P1.1)', () => {
  const base: PlanInput = {
    raceName: 'Test', raceDateISO: '2026-10-01', raceDistanceKm: 50, raceElevationM: 1800,
    raceType: 'Trail', todayISO: '2026-07-01', daysPerWeek: 5, level: 'intermediate',
  }
  const ids = (input: PlanInput) => generateTrainingPlan(input).weeks.flatMap((w) => w.sessions.map((s) => s.workoutId))
  const targetCount = (list: string[], target: string) =>
    list.filter((id) => getWorkout(id)?.target === target).length

  const flatDemands = deriveCourseDemands([flat(50)], { distanceKm: 50, dplus: 50, dminus: 50 })
  const climbDemands = deriveCourseDemands(
    [up(1800, 9, 20), down(1800, 12, { grade: -15 }), flat(29)],
    { distanceKm: 50, dplus: 1800, dminus: 1800 },
  )
  const techDemands = deriveCourseDemands(
    [up(1800, 9, 20), down(1800, 6, { grade: -30, turnDegPerKm: 320 }), flat(35)],
    { distanceKm: 50, dplus: 1800, dminus: 1800 },
  )

  it('sans exigences GPX : plan produit, comportement inchangé (repli distance + D+)', () => {
    const plan = generateTrainingPlan(base)
    expect(plan.weeks.length).toBeGreaterThan(0)
  })

  it('des exigences de parcours différentes produisent des PLANS différents', () => {
    // À paramètres de course identiques, seule la FORME (emphases) varie : le
    // choix des séances doit changer → preuve que le GPX pilote réellement le plan.
    expect(ids({ ...base, courseDemands: techDemands }))
      .not.toEqual(ids({ ...base, courseDemands: flatDemands }))
  })

  it('descente technique → séances descending injectées', () => {
    expect(techDemands.emphasis).toContain('descending')
    expect(targetCount(ids({ ...base, courseDemands: techDemands }), 'descending'))
      .toBeGreaterThan(0)
  })

  it('long + vertical → durabilité prioritaire (temps sur les jambes)', () => {
    expect(climbDemands.emphasis).toContain('durability')
    expect(targetCount(ids({ ...base, courseDemands: climbDemands }), 'durability'))
      .toBeGreaterThan(0)
  })

  it('la rationale explicite le profil du parcours', () => {
    const plan = generateTrainingPlan({ ...base, courseDemands: climbDemands })
    expect(plan.rationale.some((r) => /profil du parcours/i.test(r))).toBe(true)
  })
})
