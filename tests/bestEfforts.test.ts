import { describe, it, expect } from 'vitest'
import {
  extractBestEfforts,
  buildCleanStreams,
  mergeBestEfforts,
  buildAthleteBestEfforts,
  detectClimbs,
  bestClimb,
  type BestEffortStreams,
  type BestEffortRecord,
} from '../src/lib/bestEfforts'
import { extractBestEfforts as mobileExtract } from '../mobile/src/lib/bestEfforts'
import { computeCriticalSpeed } from '../src/lib/criticalSpeed'

// Construit un stream synthétique : vitesse constante `speed` (m/s) sur `durationS`
// secondes, altitude selon `slope` (m gagné/perdu par mètre parcouru).
function stream(speed: number, durationS: number, slope = 0, ele0 = 100): BestEffortStreams {
  const time: number[] = []
  const distance: number[] = []
  const altitude: number[] = []
  for (let t = 0; t <= durationS; t++) {
    time.push(t)
    const d = speed * t
    distance.push(d)
    altitude.push(ele0 + slope * d)
  }
  return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude } }
}

describe('extractBestEfforts — plat, vitesse constante', () => {
  const s = stream(4, 3000) // 4 m/s pendant 50 min → 12 km plat
  const res = extractBestEfforts(s)!

  it('détecte le meilleur 10 km sans étiquette « course »', () => {
    const r10 = res.records.find((r) => r.distanceM === 10000)!
    expect(r10).toBeTruthy()
    // 10000 m à 4 m/s = 2500 s.
    expect(r10.rawTimeSec).toBeCloseTo(2500, 0)
    // À plat, l'équivalent plat = le brut.
    expect(r10.gapTimeSec).toBeCloseTo(r10.rawTimeSec, 0)
    expect(r10.suspectDownhill).toBe(false)
  })

  it('ne fabrique pas de record au-delà de la distance couverte', () => {
    // 12 km parcourus → pas de record marathon.
    expect(res.records.find((r) => r.distanceM === 42195)).toBeUndefined()
    expect(res.records.find((r) => r.distanceM === 10000)).toBeTruthy()
  })

  it('produit des efforts qui donnent une vitesse critique cohérente (~4 m/s)', () => {
    const cs = computeCriticalSpeed(res.criticalSpeedEfforts)!
    expect(cs).toBeTruthy()
    expect(cs.csMetersPerSec).toBeGreaterThan(3.7)
    expect(cs.csMetersPerSec).toBeLessThan(4.3)
  })
})

describe('garde-fous anti-faux-records', () => {
  it('une descente marquée rend le temps « équivalent plat » plus lent que le brut', () => {
    // Pente -8 % : altitude perd 0.08 m par mètre.
    const s = stream(4, 3000, -0.08)
    const res = extractBestEfforts(s)!
    const r5 = res.records.find((r) => r.distanceM === 5000)!
    // La perf JUSTE (GAP) est plus lente que le chrono brut aidé par la descente.
    expect(r5.gapTimeSec).toBeGreaterThan(r5.rawTimeSec)
    expect(r5.suspectDownhill).toBe(true)
  })

  it('un pic GPS (vitesse invraisemblable) ne crée pas de record absurde', () => {
    // Run de 12 km à 4 m/s, mais on injecte un saut de 3 km en 1 s (téléport GPS).
    const time: number[] = []
    const distance: number[] = []
    let d = 0
    for (let t = 0; t <= 3000; t++) {
      time.push(t)
      if (t === 1500) d += 3000 // téléport
      else d += 4
      distance.push(d)
    }
    const res = extractBestEfforts({ time: { data: time }, distance: { data: distance } })!
    // Le meilleur 5 km ne doit pas impliquer une vitesse surhumaine (> 7.5 m/s).
    const r5 = res.records.find((r) => r.distanceM === 5000)
    if (r5) expect(5000 / r5.rawTimeSec).toBeLessThanOrEqual(7.5)
  })

  it('buildCleanStreams rejette un stream trop court', () => {
    expect(buildCleanStreams({ time: { data: [0, 1] }, distance: { data: [0, 4] } })).toBeNull()
  })
})

describe('mergeBestEfforts — on ne jette RIEN (record réel + valeur équivalent-plat)', () => {
  const mk = (D: number, gap: number, raw: number, suspect: boolean): BestEffortRecord => ({
    distanceM: D,
    gapTimeSec: gap,
    rawTimeSec: raw,
    rawAvgGrade: suspect ? -0.05 : 0,
    suspectDownhill: suspect,
  })

  it('garde le meilleur chrono réel entre deux sorties', () => {
    const m = mergeBestEfforts([[mk(10000, 2600, 2600, false)], [mk(10000, 2500, 2500, false)]])
    expect(m.get(10000)!.rawTimeSec).toBe(2500)
  })

  it('un 10 km en descente plus rapide RESTE le record réel (il compte !)', () => {
    // Sortie A : 10 km en descente en 2200 s (record réel, mais aidé).
    // Sortie B : 10 km à plat en 2500 s.
    const m = mergeBestEfforts([[mk(10000, 2750, 2200, true)], [mk(10000, 2500, 2500, false)]])
    const r = m.get(10000)!
    // Le record réel = le meilleur chrono = 2200 (la descente compte).
    expect(r.rawTimeSec).toBe(2200)
    expect(r.rawFromDownhill).toBe(true)
    // Mais la valeur « équivalent plat » retenue est la meilleure des deux (2500 plat).
    expect(r.gapTimeSec).toBe(2500)
  })
})

describe('buildAthleteBestEfforts — agrégation multi-sorties', () => {
  it('agrège les records sur toutes les sorties running et ignore le vélo', () => {
    const run1 = stream(4.0, 3000) // 12 km @ 4 m/s
    const run2 = stream(4.3, 1600) // ~6.9 km @ 4.3 m/s (meilleur 5 km)
    const ride = stream(9.0, 2000) // vélo rapide → ne doit pas compter
    const activities = [
      { strava_activity_id: 'a1', sport_type: 'Run', start_date: '2026-05-01T08:00:00Z' },
      { strava_activity_id: 'a2', sport_type: 'TrailRun', start_date: '2026-05-10T08:00:00Z' },
      { strava_activity_id: 'bike', sport_type: 'Ride', start_date: '2026-05-12T08:00:00Z' },
    ]
    const res = buildAthleteBestEfforts(activities, { a1: run1, a2: run2, bike: ride })
    expect(res.activitiesUsed).toBe(2) // le vélo est ignoré
    const r5 = res.records.find((r) => r.distanceM === 5000)!
    // Meilleur 5 km = celui de la sortie la plus rapide (4.3 m/s → ~1163 s).
    expect(r5.rawTimeSec).toBeLessThan(5000 / 4.2)
    // Vitesse critique estimée (~4 m/s pour un athlète à vitesse constante).
    expect(res.criticalSpeed).toBeTruthy()
    expect(res.criticalSpeed!.csMetersPerSec).toBeGreaterThan(3.5)
  })

  it('sans streams exploitables, ne renvoie aucun record (dégradation propre)', () => {
    const res = buildAthleteBestEfforts(
      [{ strava_activity_id: 'x', sport_type: 'Run', start_date: '2026-05-01T08:00:00Z' }],
      {},
    )
    expect(res.activitiesUsed).toBe(0)
    expect(res.records).toEqual([])
    expect(res.criticalSpeed).toBeNull()
  })
})

describe('detectClimbs — records de trail (VAM / ascension)', () => {
  // Profil : 2 km de montée à ~10 % (200 m D+) puis 2 km de descente, à 2 m/s.
  function climbThenDescent(): BestEffortStreams {
    const time: number[] = []
    const distance: number[] = []
    const altitude: number[] = []
    const speed = 2
    for (let t = 0; t <= 2000; t++) {
      time.push(t)
      const d = speed * t
      distance.push(d)
      // Monte de 100→300 sur les 2 premiers km (2000 m), puis redescend.
      const alt = d <= 2000 ? 100 + (d / 2000) * 200 : 300 - ((d - 2000) / 2000) * 200
      altitude.push(alt)
    }
    return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude } }
  }

  it('détecte l’ascension et calcule une VAM plausible', () => {
    const climbs = detectClimbs(climbThenDescent())
    expect(climbs.length).toBe(1)
    const c = climbs[0]
    expect(c.ascentM).toBeGreaterThan(180)
    expect(c.ascentM).toBeLessThan(220)
    // 200 m en 1000 s = 720 m/h.
    expect(c.vamMh).toBeGreaterThan(650)
    expect(c.vamMh).toBeLessThan(780)
    expect(c.avgGradePct).toBeGreaterThan(8)
  })

  it('ignore une bosse trop faible (< dénivelé minimum)', () => {
    const time: number[] = []
    const distance: number[] = []
    const altitude: number[] = []
    for (let t = 0; t <= 1000; t++) {
      time.push(t); distance.push(2 * t); altitude.push(100 + Math.sin(t / 100) * 20) // ±20 m
    }
    expect(detectClimbs({ time: { data: time }, distance: { data: distance }, altitude: { data: altitude } })).toEqual([])
  })

  it('bestClimb retient la meilleure VAM', () => {
    const c = bestClimb([
      { ascentM: 200, durationS: 1200, distM: 2000, vamMh: 600, avgGradePct: 10 },
      { ascentM: 150, durationS: 600, distM: 1500, vamMh: 900, avgGradePct: 10 },
    ])
    expect(c!.vamMh).toBe(900)
  })

  it('buildAthleteBestEfforts expose la meilleure ascension', () => {
    const res = buildAthleteBestEfforts(
      [{ strava_activity_id: 't1', sport_type: 'TrailRun', start_date: '2026-05-01T08:00:00Z' }],
      { t1: climbThenDescent() },
    )
    expect(res.bestClimb).toBeTruthy()
    expect(res.bestClimb!.vamMh).toBeGreaterThan(650)
  })
})

describe('parité web/mobile', () => {
  it('web et mobile extraient les mêmes records', () => {
    const s = stream(4, 3000)
    const web = extractBestEfforts(s)!
    const mob = mobileExtract(s)!
    expect(mob.records).toEqual(web.records)
  })
})
