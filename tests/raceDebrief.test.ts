import { describe, it, expect } from 'vitest'
import { computeRaceDebrief } from '../src/lib/raceDebrief'
import type { ProjectionResult } from '../src/lib/computeRaceProjection'
import type { StreamData } from '../src/lib/streams'

// Projection 10 km plat : 2 tronçons de 5 km à 4:10/km (1250 s chacun → 2500 s).
function projection(): ProjectionResult {
  const samples = Array.from({ length: 11 }, (_, i) => ({ d: i, alt: 100 }))
  return {
    points: [], samples, microSegments: [],
    sections: [
      { type: 'flat', startKm: 0, endKm: 5, dplus: 0, dminus: 0, dist: 5000, grade: 0 },
      { type: 'flat', startKm: 5, endKm: 10, dplus: 0, dminus: 0, dist: 5000, grade: 0 },
    ],
    sectionTimes: [1250, 1250],
    totalDistM: 10000, dplus: 0, dminus: 0, altMin: 100, altMax: 100,
    estTimeS: 2500, timeMin: 2400, timeMax: 2700, confidence: 'good',
    basePaceS: 250, isTrail: false, personalAdjustments: [],
  } as unknown as ProjectionResult
}

// Streams : 1re moitié à 4:00/km (240 s/km), 2e à 4:30/km (270 s/km) → split positif.
// FC qui monte (150 → 175) → dérive aérobie positive.
function positiveSplitStreams(): StreamData {
  const distance: number[] = [], time: number[] = [], heartrate: number[] = []
  for (let i = 0; i <= 100; i++) {
    const d = i * 100
    distance.push(d)
    time.push(d <= 5000 ? d * 0.24 : 1200 + (d - 5000) * 0.27)
    heartrate.push(d <= 5000 ? 150 : 175)
  }
  return { distance: { data: distance }, time: { data: time }, heartrate: { data: heartrate } }
}

describe('computeRaceDebrief — split, dérive, exécution', () => {
  it('mesure le temps réel et l\'écart à la projection', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d).not.toBeNull()
    expect(d.actualTotalS).toBeCloseTo(2550, 0)   // 1200 + 1350
    expect(d.deltaS).toBeCloseTo(50, 0)            // 2550 − 2500
    expect(d.accuracyPct).toBeGreaterThan(95)      // 2% d'écart
  })

  it('détecte le départ trop rapide (split positif)', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.splitPct).toBeGreaterThan(9)          // ~12,5 %
    expect(d.splitVerdict).toMatch(/ambitieux/i)
    expect(d.takeaways.some((t) => t.tone === 'work' && /prudent|2ᵉ moiti/i.test(t.text))).toBe(true)
  })

  it('calcule la dérive cardiaque et la FC', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.hasHR).toBe(true)
    expect(d.avgHR).toBeGreaterThan(155)
    expect(d.decouplingPct!).toBeGreaterThan(10)   // FC monte, allure baisse
  })

  it('pénalise l\'exécution d\'une course mal gérée', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.executionScore).toBeLessThan(80)
    expect(d.executionScore).toBeGreaterThanOrEqual(40)
  })

  it('produit la courbe (points allure + altitude)', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.points.length).toBeGreaterThanOrEqual(40)
    expect(d.points.every((p) => p.alt === 100)).toBe(true)
    expect(d.paceLoS).toBeLessThan(d.paceHiS)
  })
})

describe('computeRaceDebrief — course régulière & cas limites', () => {
  // Allure constante = projection exacte : exécution élevée, split nul.
  function evenStreams(): StreamData {
    const distance: number[] = [], time: number[] = [], heartrate: number[] = []
    for (let i = 0; i <= 100; i++) {
      const d = i * 100
      distance.push(d); time.push(d * 0.25); heartrate.push(155) // 4:10/km, FC stable
    }
    return { distance: { data: distance }, time: { data: time }, heartrate: { data: heartrate } }
  }

  it('récompense une course régulière et conforme', () => {
    const d = computeRaceDebrief(projection(), evenStreams())!
    expect(Math.abs(d.splitPct)).toBeLessThan(3)
    expect(d.executionScore).toBeGreaterThan(80)
    expect(d.accuracyPct).toBeGreaterThan(98)
  })

  it('gère l\'absence de FC (pas de dérive, exécution sur pacing+plan)', () => {
    const noHr = evenStreams()
    delete noHr.heartrate
    const d = computeRaceDebrief(projection(), noHr)!
    expect(d.hasHR).toBe(false)
    expect(d.decouplingPct).toBeNull()
    expect(d.executionScore).toBeGreaterThan(80)
  })

  it('renvoie null sans streams distance/temps', () => {
    expect(computeRaceDebrief(projection(), {})).toBeNull()
  })
})

describe('computeRaceDebrief — détection des arrêts (crampes)', () => {
  // Course régulière 4:10/km avec un arrêt de 60 s pile à mi-course (km 5).
  function stoppedStreams(): StreamData {
    const distance: number[] = [], time: number[] = []
    for (let i = 0; i <= 50; i++) { distance.push(i * 100); time.push(i * 25) } // 0→5000, 0→1250
    for (let k = 1; k <= 6; k++) { distance.push(5000); time.push(1250 + k * 10) } // arrêt 60 s
    let t = 1310
    for (let i = 1; i <= 50; i++) { distance.push(5000 + i * 100); time.push(t + i * 25) } // reprise → 10000, 2560
    return { distance: { data: distance }, time: { data: time } }
  }

  it('repère l\'arrêt, sa durée et le temps en mouvement', () => {
    const d = computeRaceDebrief(projection(), stoppedStreams())!
    expect(d.stopCount).toBe(1)
    expect(d.stoppedS).toBeGreaterThanOrEqual(55)
    expect(d.actualTotalS).toBeCloseTo(2560, 0)   // chrono réel, arrêt inclus
    expect(d.movingS).toBeCloseTo(2500, 0)        // hors arrêt
    expect(d.stops[0].startKm).toBeCloseTo(5, 1)
  })

  it('ne fausse PAS le pacing : l\'arrêt à mi-course ne crée pas de faux split', () => {
    const d = computeRaceDebrief(projection(), stoppedStreams())!
    expect(Math.abs(d.splitPct)).toBeLessThan(3)   // sans correction : ~+5 % artificiel
    expect(d.accuracyPct).toBeGreaterThan(98)       // précision calculée hors arrêts
  })

  it('génère un conseil crampes en priorité', () => {
    const d = computeRaceDebrief(projection(), stoppedStreams())!
    expect(d.takeaways[0].text).toMatch(/arrêt|cramp/i)
    expect(d.verdict).toMatch(/arrêt/i)
  })

  it('reconnaît un arrêt sur un ravito connu (pas un problème)', () => {
    const d = computeRaceDebrief(projection(), stoppedStreams(), null, { ravitoKms: [5] })!
    expect(d.stops[0].isRavito).toBe(true)
    expect(d.ravitoStoppedS).toBeGreaterThanOrEqual(55)
    expect(d.unplannedStoppedS).toBeLessThan(10)
    // arrêt entièrement « prévu » → pas de conseil « arrêts subis »
    expect(d.takeaways.some((t) => /subis/i.test(t.text))).toBe(false)
    expect(d.verdict).toMatch(/ravito prévu/i)
  })

  // Montre mise en pause : aucun arrêt dans le flux, mais écoulé > mouvement.
  it('récupère le temps d\'arrêt via les métadonnées (montre en pause)', () => {
    const even = (() => {
      const distance: number[] = [], time: number[] = []
      for (let i = 0; i <= 100; i++) { distance.push(i * 100); time.push(i * 25) }
      return { distance: { data: distance }, time: { data: time } }
    })()
    const d = computeRaceDebrief(projection(), even, null, { movingTimeS: 2500, elapsedTimeS: 2680 })!
    expect(d.stopCount).toBe(0)                 // rien à localiser dans le flux
    expect(d.stoppedS).toBeCloseTo(180, 0)      // 2680 − 2500, via les métadonnées
    expect(d.movingS).toBeCloseTo(2500, 0)
    expect(d.actualTotalS).toBeCloseTo(2680, 0) // chrono réel
    expect(d.accuracyPct).toBeGreaterThan(99)   // précision hors arrêts
    expect(d.verdict).toMatch(/arrêt/i)
  })
})
