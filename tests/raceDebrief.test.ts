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

describe('computeRaceDebrief — fidélité connaissance (GAP, durabilité, VAM, descente)', () => {
  // Course vallonnée : montée 0–3 km (+300 m, ~10 %), descente 3–6 km (−300 m).
  function hillyProjection(): ProjectionResult {
    const samples = [100, 200, 300, 400, 300, 200, 100].map((alt, d) => ({ d, alt }))
    return {
      points: [], samples, microSegments: [],
      sections: [
        { type: 'up', startKm: 0, endKm: 3, dplus: 300, dminus: 0, dist: 3000, grade: 0.10 },
        { type: 'down', startKm: 3, endKm: 6, dplus: 0, dminus: 300, dist: 3000, grade: -0.10 },
      ],
      sectionTimes: [1200, 900],
      totalDistM: 6000, dplus: 300, dminus: 300, altMin: 100, altMax: 400,
      estTimeS: 2100, timeMin: 2000, timeMax: 2300, confidence: 'good',
      basePaceS: 300, isTrail: true, personalAdjustments: [],
    } as unknown as ProjectionResult
  }
  // FC qui dérive (150 → 180) sur montée puis descente.
  function hillyStreams(): StreamData {
    const distance: number[] = [], time: number[] = [], heartrate: number[] = []
    let t = 0
    for (let i = 0; i <= 60; i++) {
      const d = i * 100
      if (i > 0) { t += 100 * ((i - 1) * 100 < 3000 ? 0.4 : 0.3) } // montée plus lente que descente
      distance.push(d); time.push(t); heartrate.push(Math.round(150 + (i / 60) * 30))
    }
    return { distance: { data: distance }, time: { data: time }, heartrate: { data: heartrate } }
  }

  it('ajuste le découplage à la pente sur terrain vallonné', () => {
    const d = computeRaceDebrief(hillyProjection(), hillyStreams())!
    expect(d.decouplingGapAdjusted).toBe(true)
    expect(d.decouplingPct).not.toBeNull()
  })

  it('ne « GAP-ajuste » pas une course plate', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.decouplingGapAdjusted).toBe(false)
  })

  it('calcule la durabilité par tiers et la charge excentrique', () => {
    const d = computeRaceDebrief(hillyProjection(), hillyStreams())!
    expect(d.durabilityFadePct).not.toBeNull()
    expect(['solid', 'moderate', 'weak']).toContain(d.durabilityBand)
    expect(d.eccLoadEq).toBeGreaterThan(0)   // descente −300 m pondérée
  })

  it('classe la VAM de montée (bande de niveau)', () => {
    const d = computeRaceDebrief(hillyProjection(), hillyStreams())!
    const climb = d.terrain.find((t) => t.kind === 'climb')
    expect(climb).toBeTruthy()
    expect(['elite', 'strong', 'fair', 'weak']).toContain(climb!.vamBand)
  })

  // Course roulante : descente au 1er tiers (rapide) et au dernier tiers (lente) → fade.
  it('détecte l\'effondrement des descentes en fin de course', () => {
    const proj = {
      points: [], samples: [200, 120, 120, 120, 120, 120, 40].map((alt, d) => ({ d, alt })), microSegments: [],
      sections: [
        { type: 'down', startKm: 0, endKm: 1, dplus: 0, dminus: 80, dist: 1000, grade: -0.08 },
        { type: 'flat', startKm: 1, endKm: 5, dplus: 0, dminus: 0, dist: 4000, grade: 0 },
        { type: 'down', startKm: 5, endKm: 6, dplus: 0, dminus: 80, dist: 1000, grade: -0.08 },
      ],
      sectionTimes: [240, 1200, 480],
      totalDistM: 6000, dplus: 0, dminus: 160, altMin: 40, altMax: 200, confidence: 'good',
      estTimeS: 1920, timeMin: 1800, timeMax: 2100, basePaceS: 300, isTrail: true, personalAdjustments: [],
    } as unknown as ProjectionResult
    // Réel : 1re descente rapide (240 s/km), dernière lente (480 s/km).
    const distance: number[] = [], time: number[] = []
    let t = 0
    for (let i = 0; i <= 60; i++) {
      const d = i * 100
      if (i > 0) { const prev = (i - 1) * 100; t += 100 * (prev < 1000 ? 0.24 : prev < 5000 ? 0.30 : 0.48) }
      distance.push(d); time.push(t)
    }
    const d = computeRaceDebrief(proj, { distance: { data: distance }, time: { data: time } })!
    expect(d.descentFade).toBe('marked')
    expect(d.takeaways.some((tk) => /descente|excentrique/i.test(tk.text))).toBe(true)
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

  it('les causes étiquetées CHANGENT le débrief (crampe)', () => {
    const base = computeRaceDebrief(projection(), stoppedStreams())!
    const tagged = computeRaceDebrief(projection(), stoppedStreams(), null, { annotations: [{ km: 5, label: 'crampe' }] })!
    expect(tagged.verdict).toMatch(/crampe/i)
    expect(tagged.verdict).not.toBe(base.verdict)
    expect(tagged.takeaways.some((t) => /crampe|excentrique/i.test(t.text))).toBe(true)
  })

  it('une chute renseignée apparaît dans les enseignements', () => {
    const d = computeRaceDebrief(projection(), stoppedStreams(), null, { annotations: [{ km: 5, label: 'chute' }] })!
    expect(d.verdict).toMatch(/chute/i)
    expect(d.takeaways.some((t) => /chute/i.test(t.text))).toBe(true)
  })

  it('un arrêt étiqueté « ravito » devient prévu (plus subi)', () => {
    const d = computeRaceDebrief(projection(), stoppedStreams(), null, { annotations: [{ km: 5, label: 'ravito' }] })!
    expect(d.unplannedStoppedS).toBeLessThan(10)
    expect(d.takeaways.some((t) => /subis/i.test(t.text))).toBe(false)
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

describe('computeRaceDebrief — dérive cardiaque : chaleur & départ rapide', () => {
  it('un départ trop rapide est identifié comme facteur de la dérive (pas un déficit d\'endurance)', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.decouplingPct!).toBeGreaterThan(10)
    expect(d.driftConfounders).toContain('fast_start')
    expect(d.adjustedDecouplingPct!).toBeLessThan(d.decouplingPct!)
    // Le conseil sur la dérive mentionne le départ, pas uniquement l'endurance/nutrition.
    expect(d.takeaways.some((t) => /départ|prudent/i.test(t.text))).toBe(true)
  })

  it('la chaleur (Strava average_temp) est prise en compte et créditée', () => {
    const hot = computeRaceDebrief(projection(), positiveSplitStreams(), null, { tempC: 30 })!
    const cool = computeRaceDebrief(projection(), positiveSplitStreams(), null, { tempC: 12 })!
    expect(hot.tempC).toBe(30)
    expect(hot.driftConfounders).toContain('heat')
    expect(cool.driftConfounders).not.toContain('heat')
    // À dérive MESURÉE égale, la chaleur abaisse la dérive NETTE …
    expect(hot.adjustedDecouplingPct!).toBeLessThan(cool.adjustedDecouplingPct!)
    // … et ne pénalise donc pas l'endurance : note d'exécution au moins aussi bonne.
    expect(hot.executionScore).toBeGreaterThanOrEqual(cool.executionScore)
    expect(hot.takeaways.some((t) => /chaleur|30/.test(t.text))).toBe(true)
  })

  it('sans chaleur ni départ rapide, la dérive nette = la dérive mesurée (pas de régression)', () => {
    const distance: number[] = [], time: number[] = [], heartrate: number[] = []
    for (let i = 0; i <= 100; i++) { const dd = i * 100; distance.push(dd); time.push(dd * 0.25); heartrate.push(150 + Math.round(dd / 1000)) }
    const s: StreamData = { distance: { data: distance }, time: { data: time }, heartrate: { data: heartrate } }
    const d = computeRaceDebrief(projection(), s, null, { tempC: 12 })!
    expect(Math.abs(d.splitPct)).toBeLessThan(3)         // allure régulière → pas de départ rapide
    expect(d.driftConfounders).toEqual([])
    expect(d.adjustedDecouplingPct).toBe(d.decouplingPct)
  })

  it('utilise le RESSENTI (apparent_temperature) 2ᵉ moitié plutôt que l\'air pour la chaleur', () => {
    // Air 20 °C (sous le seuil) mais ressenti 32 °C en 2ᵉ moitié (humide) → confondant chaleur.
    const heat = { avgTempC: 20, avgApparentC: 28, secondHalfApparentC: 32, source: 'api' as const }
    const d = computeRaceDebrief(projection(), positiveSplitStreams(), null, { tempC: 20, heat })!
    expect(d.driftConfounders).toContain('heat')
    expect(d.feelsLikeC).toBe(32)
    expect(d.adjustedDecouplingPct!).toBeLessThan(d.decouplingPct!)
  })
})

describe('computeRaceDebrief — préparation (charge d\'entraînement)', () => {
  const undertrained = { status: 'undertrained' as const, loadRatioPct: 40, runCount42: 2, longestRunKm: 8, weeksLow: true }

  it('recadre une forte dérive comme un manque de fond récent, pas une faiblesse à travailler', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams(), null, { preparation: undertrained })!
    expect(d.decouplingPct!).toBeGreaterThan(10)
    expect(d.preparation?.status).toBe('undertrained')
    // Un enseignement parle de préparation légère…
    expect(d.takeaways.some((t) => /pr[ée]paration l[ée]g[èe]re|fond r[ée]cent/i.test(t.text))).toBe(true)
    // … et on n'assène PAS « travaille l'endurance fondamentale ».
    expect(d.takeaways.some((t) => /travaille l'endurance fondamentale/i.test(t.text))).toBe(false)
    expect(d.verdict).toMatch(/pr[ée]paration l[ée]g[èe]re/i)
  })

  it('sans info de préparation, comportement inchangé (endurance à travailler si dérive élevée)', () => {
    const d = computeRaceDebrief(projection(), positiveSplitStreams())!
    expect(d.preparation).toBeNull()
    // départ rapide crédité → message confondant, pas de faux « endurance » ; mais pas de recadrage préparation.
    expect(d.takeaways.some((t) => /pr[ée]paration l[ée]g[èe]re/i.test(t.text))).toBe(false)
  })
})
