import { describe, it, expect } from 'vitest'
import {
  assessBestEffortQuality,
  extractBestEfforts,
  mergeBestEfforts,
  type BestEffortSource,
  type MergedBestEffort,
} from '../src/lib/bestEfforts'
import { assessBestEffortQuality as mobileAssess } from '../mobile/src/lib/bestEfforts'

function src(over: Partial<BestEffortSource> = {}): BestEffortSource {
  return {
    activityId: 'a1',
    activityDate: '2026-05-01T08:00:00Z',
    sportType: 'Run',
    rawTimeSec: 1200,
    gapTimeSec: 1250,
    suspectDownhill: false,
    hasTimeGap: false,
    altitudeCoveragePct: 100,
    ...over,
  }
}

function record(over: Partial<MergedBestEffort> = {}): MergedBestEffort {
  return {
    distanceM: 5000,
    rawTimeSec: 1200,
    rawFromDownhill: false,
    gapTimeSec: 1250, // 5000/1250 = 4 m/s → plausible
    gapSource: src(),
    ...over,
  }
}

describe('assessBestEffortQuality — qualité des records (§8)', () => {
  it('un record propre est pleinement éligible (poids 1)', () => {
    const q = assessBestEffortQuality(record())
    expect(q.eligibleForFade).toBe(true)
    expect(q.weight).toBe(1)
    expect(q.reasons).toEqual([])
  })

  it('une descente suspecte est dépondérée et non librement éligible', () => {
    const q = assessBestEffortQuality(record({ rawFromDownhill: true, gapSource: src({ suspectDownhill: true }) }))
    expect(q.reasons).toContain('suspect_downhill')
    expect(q.weight).toBeLessThan(0.5)
    expect(q.eligibleForFade).toBe(false)
  })

  it('un trou temporel (pause/arrêt) dépondère le record', () => {
    const q = assessBestEffortQuality(record({ gapSource: src({ hasTimeGap: true }) }))
    expect(q.reasons).toContain('time_gap')
    expect(q.weight).toBeLessThan(0.5)
  })

  it('une couverture altimétrique faible dépondère le record', () => {
    const q = assessBestEffortQuality(record({ gapSource: src({ altitudeCoveragePct: 40 }) }))
    expect(q.reasons).toContain('low_altitude_coverage')
    expect(q.weight).toBeLessThanOrEqual(0.5)
  })

  it('une activité hors course à pied est exclue (poids 0)', () => {
    const q = assessBestEffortQuality(record({ gapSource: src({ sportType: 'Ride' }) }))
    expect(q.reasons).toContain('non_running_sport')
    expect(q.weight).toBe(0)
    expect(q.eligibleForFade).toBe(false)
  })

  it('une vitesse invraisemblable (artefact GPS) est rejetée (poids 0)', () => {
    // 5000 m en 300 s → 16.7 m/s, très au-dessus du plafond humain.
    const q = assessBestEffortQuality(record({ gapTimeSec: 300 }))
    expect(q.reasons).toContain('implausible_speed')
    expect(q.weight).toBe(0)
  })

  it('parité web/mobile', () => {
    const r = record({ gapSource: src({ suspectDownhill: true }), rawFromDownhill: true })
    expect(mobileAssess(r)).toEqual(assessBestEffortQuality(r))
  })
})

describe('provenance des records (§7) + streams avec pauses (§19.5)', () => {
  // Construit un stream plat régulier de `n` secondes à `speed` m/s, avec option pause.
  function flatStream(n: number, speed: number, pauseAt?: number) {
    const time: number[] = []
    const distance: number[] = []
    const altitude: number[] = []
    let t = 0
    let d = 0
    for (let i = 0; i < n; i++) {
      // Une pause : le temps saute de 120 s sans distance parcourue.
      if (pauseAt != null && i === pauseAt) t += 120
      time.push(t)
      distance.push(d)
      altitude.push(100)
      t += 1
      d += speed
    }
    return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude } }
  }

  it('extractBestEfforts renseigne la provenance quand une source est fournie', () => {
    const streams = flatStream(1300, 4) // ~5.2 km à 4 m/s
    const ext = extractBestEfforts(streams, { activityId: 42, activityDate: '2026-05-01', sportType: 'Run' })
    expect(ext).not.toBeNull()
    const rec5k = ext!.records.find((r) => r.distanceM === 5000)
    expect(rec5k?.source?.activityId).toBe(42)
    expect(rec5k?.source?.sportType).toBe('Run')
    expect(rec5k?.source?.altitudeCoveragePct).toBe(100)
  })

  it('un stream avec pause est marqué hasTimeGap → le record devient dépondéré', () => {
    const streams = flatStream(1300, 4, 600)
    const ext = extractBestEfforts(streams, { activityId: 7, activityDate: '2026-05-01', sportType: 'Run' })
    const rec5k = ext!.records.find((r) => r.distanceM === 5000)
    expect(rec5k?.source?.hasTimeGap).toBe(true)
    const merged = [...mergeBestEfforts([ext!.records]).values()].find((r) => r.distanceM === 5000)!
    const q = assessBestEffortQuality(merged)
    expect(q.reasons).toContain('time_gap')
    expect(q.eligibleForFade).toBe(false)
  })

  it('mergeBestEfforts conserve la provenance du gagnant', () => {
    const slow = extractBestEfforts(flatStream(1300, 4), { activityId: 'slow', sportType: 'Run' })!
    const fast = extractBestEfforts(flatStream(1300, 5), { activityId: 'fast', sportType: 'Run' })!
    const merged = mergeBestEfforts([slow.records, fast.records])
    const rec5k = merged.get(5000)!
    // Le plus rapide (5 m/s) gagne le chrono → provenance = 'fast'.
    expect(rec5k.gapSource?.activityId).toBe('fast')
  })
})
