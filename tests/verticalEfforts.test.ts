import { describe, it, expect } from 'vitest'
import {
  extractVerticalEfforts,
  mergeVerticalEfforts,
  VERTICAL_ASCENT_TIERS_M,
  buildAthleteBestEfforts,
  type BestEffortStreams,
} from '../src/lib/bestEfforts'
import { extractVerticalEfforts as mobileExtract } from '../mobile/src/lib/bestEfforts'

// Construit une montée RÉGULIÈRE : `n` points à 1 Hz, vitesse `speed` m/s, pente `grade`
// (fraction) → gain d'altitude constant. Optionnellement, insère une pause.
function climbStream(n: number, speed: number, grade: number, pauseAt?: number): BestEffortStreams {
  const time: number[] = []
  const distance: number[] = []
  const altitude: number[] = []
  let t = 0, d = 0, a = 1000
  for (let i = 0; i < n; i++) {
    if (pauseAt != null && i === pauseAt) t += 120
    time.push(t); distance.push(d); altitude.push(a)
    t += 1; d += speed; a += speed * grade
  }
  return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude } }
}

describe('extractVerticalEfforts — courbe verticale par palier (§11)', () => {
  it('extrait les paliers réellement couverts avec ascent/duration/distance/VAM/grade', () => {
    // 1 m/s, pente 20 % → 0.2 m/s de D+ → 1000 pts = 200 m de D+ → paliers 100 couverts.
    const efforts = extractVerticalEfforts(climbStream(1000, 1, 0.2), { activityId: 'a1', sportType: 'TrailRun' })
    const e100 = efforts.find((e) => e.targetAscentM === 100)!
    expect(e100).toBeDefined()
    expect(e100.ascentM).toBeGreaterThanOrEqual(100)
    expect(e100.durationS).toBeGreaterThan(0)
    expect(e100.distM).toBeGreaterThan(0)
    expect(e100.vamMh).toBeGreaterThan(0)
    expect(e100.avgGradePct).toBeCloseTo(20, 0)
    // VAM attendue ≈ 0.2 m/s * 3600 = 720 m/h.
    expect(e100.vamMh).toBeGreaterThan(600)
    expect(e100.vamMh).toBeLessThan(850)
    expect(e100.source?.activityId).toBe('a1')
  })

  it('ne produit pas de palier au-delà du D+ total de l’activité', () => {
    // 200 m de D+ seulement → paliers 300/500/1000 absents.
    const efforts = extractVerticalEfforts(climbStream(1000, 1, 0.2), { activityId: 'a1', sportType: 'TrailRun' })
    const tiers = efforts.map((e) => e.targetAscentM)
    expect(tiers).toContain(100)
    expect(tiers).not.toContain(300)
    expect(tiers).not.toContain(1000)
  })

  it('choisit la fenêtre la PLUS RAPIDE (VAM la plus haute) pour un palier', () => {
    // Montée douce puis raide sur le même stream : le palier 100 doit capter la partie raide.
    const time: number[] = [], distance: number[] = [], altitude: number[] = []
    let t = 0, d = 0, a = 1000
    // 600 s de montée douce (0.1 m/s D+), puis 600 s raide (0.3 m/s D+).
    for (let i = 0; i < 600; i++) { time.push(t); distance.push(d); altitude.push(a); t++; d += 1; a += 0.1 }
    for (let i = 0; i < 600; i++) { time.push(t); distance.push(d); altitude.push(a); t++; d += 1; a += 0.3 }
    const efforts = extractVerticalEfforts({ time: { data: time }, distance: { data: distance }, altitude: { data: altitude } }, { activityId: 'x', sportType: 'TrailRun' })
    const e100 = efforts.find((e) => e.targetAscentM === 100)!
    // La partie raide (0.3 m/s D+ → 1080 m/h) doit dominer, pas la douce (360 m/h).
    expect(e100.vamMh).toBeGreaterThan(800)
  })

  it('rejette les VAM invraisemblables (artefact)', () => {
    // Pente énorme + vitesse élevée → VAM > 3000 m/h → rejetée.
    const efforts = extractVerticalEfforts(climbStream(500, 5, 0.5), { activityId: 'a1', sportType: 'TrailRun' })
    const e100 = efforts.find((e) => e.targetAscentM === 100)
    expect(e100).toBeUndefined()
  })

  it('un parcours plat ne produit aucun effort vertical', () => {
    const flat = climbStream(1000, 3, 0)
    expect(extractVerticalEfforts(flat, { activityId: 'a1', sportType: 'TrailRun' })).toEqual([])
  })

  it('marque hasTimeGap quand le stream a une pause', () => {
    const efforts = extractVerticalEfforts(climbStream(1000, 1, 0.2, 400), { activityId: 'a1', sportType: 'TrailRun' })
    expect(efforts[0].hasTimeGap).toBe(true)
  })

  it('mergeVerticalEfforts garde la meilleure VAM par palier entre activités', () => {
    const slow = extractVerticalEfforts(climbStream(1000, 1, 0.15), { activityId: 'slow', sportType: 'TrailRun' })
    const fast = extractVerticalEfforts(climbStream(1000, 1, 0.2), { activityId: 'fast', sportType: 'TrailRun' })
    const merged = mergeVerticalEfforts([slow, fast])
    expect(merged[100].source?.activityId).toBe('fast')
  })

  it('les paliers exposés sont bien 100/300/500/1000', () => {
    expect(VERTICAL_ASCENT_TIERS_M).toEqual([100, 300, 500, 1000])
  })

  it('parité web/mobile', () => {
    const s = climbStream(1000, 1, 0.2)
    expect(mobileExtract(s, { activityId: 'a1', sportType: 'TrailRun' })).toEqual(
      extractVerticalEfforts(s, { activityId: 'a1', sportType: 'TrailRun' }),
    )
  })

  it('buildAthleteBestEfforts expose bestClimbByTier', () => {
    const act = { strava_activity_id: 'a1', sport_type: 'TrailRun', start_date: '2026-05-01' }
    const res = buildAthleteBestEfforts([act], { a1: climbStream(2000, 1, 0.2) })
    expect(res.bestClimbByTier[100]).toBeDefined()
    expect(res.bestClimbByTier[300]).toBeDefined()
  })
})
