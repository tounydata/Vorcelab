import { describe, it, expect } from 'vitest'
import {
  extractSamples,
  aggregateByGrade,
  findTransition,
  measureWalkTransition,
  measureClimbFatigue,
  toStepsPerMinute,
  WALK_CADENCE_THRESHOLD,
  WALK_CADENCE_THRESHOLD_SPM,
  MIN_SEGMENT_M,
  type GradeBinStats,
} from '../src/lib/walkTransition'

// Le moteur classe toutes les pentes ≥ 12 % dans un seau unique et sans limite haute.
// Or la bascule course → marche se produit précisément dans cette zone : du 12 % couru
// à 6,5 km/h et du 30 % marché à 3 km/h s'y retrouvent moyennés ensemble. Ce module
// mesure la bascule pour permettre de redécouper ; ces tests vérifient qu'il la voit.

/** Fabrique un stream synthétique : pente et régime constants, 1 point/seconde. */
function leg(opts: {
  gradePct: number
  speedKmH: number
  cadence: number
  seconds: number
  startDist?: number
  startAlt?: number
  startTime?: number
}) {
  const { gradePct, speedKmH, cadence, seconds } = opts
  const vMs = speedKmH / 3.6
  const time: number[] = [], distance: number[] = [], altitude: number[] = [], cad: number[] = []
  let d = opts.startDist ?? 0
  let a = opts.startAlt ?? 0
  const t0 = opts.startTime ?? 0
  for (let s = 0; s <= seconds; s++) {
    time.push(t0 + s)
    distance.push(d)
    altitude.push(a)
    cad.push(cadence)
    d += vMs
    a += vMs * (gradePct / 100)
  }
  return { time, distance, altitude, cadence: cad }
}

function streamsOf(...legs: ReturnType<typeof leg>[]) {
  const time: number[] = [], distance: number[] = [], altitude: number[] = [], cadence: number[] = []
  let dOff = 0, aOff = 0, tOff = 0
  for (const l of legs) {
    for (let i = 0; i < l.time.length; i++) {
      time.push(tOff + l.time[i]); distance.push(dOff + l.distance[i])
      altitude.push(aOff + l.altitude[i]); cadence.push(l.cadence[i])
    }
    dOff += l.distance[l.distance.length - 1]
    aOff += l.altitude[l.altitude.length - 1]
    tOff += l.time[l.time.length - 1] + 1
  }
  return {
    time: { data: time }, distance: { data: distance },
    altitude: { data: altitude }, cadence: { data: cadence },
  }
}

describe('mesure de la bascule course → marche', () => {
  it('retrouve la pente d’un segment synthétique', () => {
    const s = extractSamples(streamsOf(leg({ gradePct: 20, speedKmH: 4, cadence: 55, seconds: 300 })))
    expect(s.length).toBeGreaterThan(0)
    for (const x of s) expect(x.gradePct).toBeCloseTo(20, 0)
  })

  it('ignore les segments trop courts pour que la pente ait un sens', () => {
    // 30 m parcourus : sous MIN_SEGMENT_M, le bruit d’altitude dominerait la pente.
    const short = Math.ceil((30 / (6 / 3.6)))
    const s = extractSamples(streamsOf(leg({ gradePct: 10, speedKmH: 6, cadence: 80, seconds: short })))
    expect(MIN_SEGMENT_M).toBe(40)
    expect(s).toEqual([])
  })

  it('sépare course et marche par la cadence, pas par la vitesse', () => {
    const p = measureWalkTransition([
      streamsOf(
        leg({ gradePct: 2, speedKmH: 11, cadence: 85, seconds: 600 }),   // plat, course
        leg({ gradePct: 22, speedKmH: 3.2, cadence: 55, seconds: 600 }), // raide, marche
      ),
    ])
    const flat = p.bins.find((b) => b.gradeMinPct === 0)!
    const steep = p.bins.find((b) => b.gradeMinPct === 20)!
    expect(flat.walkFraction).toBe(0)
    expect(steep.walkFraction).toBe(1)
    expect(steep.meanCadence!).toBeLessThan(WALK_CADENCE_THRESHOLD)
  })

  it('calcule la VAM, l’invariant candidat de la zone de marche', () => {
    // 4 km/h à 25 % ⇒ 4000 × 0,25 = 1000 m/h de dénivelé.
    const p = measureWalkTransition([
      streamsOf(leg({ gradePct: 25, speedKmH: 4, cadence: 55, seconds: 900 })),
    ])
    const b = p.bins.find((x) => x.gradeMinPct === 25)!
    expect(b.meanVamMH).toBeGreaterThan(900)
    expect(b.meanVamMH).toBeLessThan(1100)
  })

  it('pondère par le TEMPS, pas par le nombre d’échantillons', () => {
    // Deux régimes dans le MÊME intervalle : le lent dure plus longtemps et doit peser
    // davantage — c’est du temps que le moteur prédit.
    const p = measureWalkTransition([
      streamsOf(
        leg({ gradePct: 12, speedKmH: 8, cadence: 85, seconds: 60 }),
        leg({ gradePct: 12, speedKmH: 3, cadence: 55, seconds: 600 }),
      ),
    ])
    const b = p.bins.find((x) => x.gradeMinPct === 10)!
    expect(b.walkFraction).toBeGreaterThan(0.8) // le régime long domine
    expect(b.meanSpeedKmH!).toBeLessThan(4.5)
  })

  it('interpole la pente de bascule entre les deux intervalles encadrants', () => {
    const bins: GradeBinStats[] = [
      { gradeMinPct: 5,  seconds: 600, meanCadence: 84, meanSpeedKmH: 9, meanVamMH: 600, walkFraction: 0.1 },
      { gradeMinPct: 10, seconds: 600, meanCadence: 70, meanSpeedKmH: 6, meanVamMH: 750, walkFraction: 0.3 },
      { gradeMinPct: 15, seconds: 600, meanCadence: 60, meanSpeedKmH: 4, meanVamMH: 700, walkFraction: 0.7 },
    ]
    // Entre les centres 12,5 (30 %) et 17,5 (70 %) : 50 % tombe au milieu → 15.
    expect(findTransition(bins)).toBeCloseTo(15, 1)
  })

  it('n’invente pas de bascule sur un intervalle famélique', () => {
    const bins: GradeBinStats[] = [
      { gradeMinPct: 5,  seconds: 600, meanCadence: 84, meanSpeedKmH: 9, meanVamMH: 600, walkFraction: 0.1 },
      { gradeMinPct: 25, seconds: 3,   meanCadence: 50, meanSpeedKmH: 3, meanVamMH: 700, walkFraction: 1.0 },
    ]
    expect(findTransition(bins)).toBeNull()
  })

  it('reste muet plutôt que d’extrapoler sans terrain raide', () => {
    const p = measureWalkTransition([
      streamsOf(leg({ gradePct: 3, speedKmH: 11, cadence: 85, seconds: 1200 })),
    ])
    expect(p.transitionGradePct).toBeNull()
    expect(p.totalSeconds).toBeGreaterThan(0)
  })

  it('ne renvoie rien sans cadence (aucune détection de marche possible)', () => {
    const s = streamsOf(leg({ gradePct: 20, speedKmH: 4, cadence: 55, seconds: 300 }))
    expect(extractSamples({ ...s, cadence: null })).toEqual([])
  })

  it('agrège plusieurs activités du même athlète', () => {
    const p = measureWalkTransition([
      streamsOf(leg({ gradePct: 22, speedKmH: 3.2, cadence: 55, seconds: 300 })),
      streamsOf(leg({ gradePct: 22, speedKmH: 3.2, cadence: 55, seconds: 300 })),
    ])
    const b = p.bins.find((x) => x.gradeMinPct === 20)!
    expect(b.seconds).toBeGreaterThan(500)
  })

  // L'API Strava renvoie des FOULÉES, pas des pas. Confondre les deux unités ferait passer
  // une cadence de course (156 pas/min) pour de la marche, et inverserait la mesure.
  it('convertit la cadence de l’API Strava (foulées/min) en pas par minute', () => {
    expect(toStepsPerMinute(78)).toBe(156)   // course sur le plat (78 foulées/min)
    expect(toStepsPerMinute(52)).toBe(104)   // marche en montée raide (52 foulées/min)
    expect(toStepsPerMinute(null)).toBeNull()
    expect(WALK_CADENCE_THRESHOLD_SPM).toBe(130)
    expect(WALK_CADENCE_THRESHOLD_SPM).toBe(WALK_CADENCE_THRESHOLD * 2)
  })

  it('agrège correctement sur des échantillons vides', () => {
    const p = aggregateByGrade([])
    expect(p.totalSeconds).toBe(0)
    expect(p.transitionGradePct).toBeNull()
    expect(p.bins.every((b) => b.meanCadence === null)).toBe(true)
  })
})

// ── Fatigue de montée ────────────────────────────────────────────────────────────
// La VAM dépend fortement de la pente : comparer le début et la fin d'une sortie sans
// contrôler le relief mesurerait le TERRAIN, pas la fatigue. Ces tests verrouillent le
// garde-fou — c'est lui qui rend la mesure interprétable.
describe('fatigue de montée', () => {
  it('compte le dénivelé DÉJÀ grimpé en abordant chaque segment', () => {
    const s = extractSamples(streamsOf(leg({ gradePct: 20, speedKmH: 4, cadence: 55, seconds: 600 })))
    expect(s[0].cumulativeGainM).toBe(0) // le premier segment se fait jambes fraîches
    expect(s[s.length - 1].cumulativeGainM).toBeGreaterThan(100)
    for (let i = 1; i < s.length; i++) {
      expect(s[i].cumulativeGainM).toBeGreaterThanOrEqual(s[i - 1].cumulativeGainM)
    }
  })

  it('détecte une VAM qui s’effondre à pente CONSTANTE', () => {
    // Même pente du début à la fin : toute baisse est imputable à l'athlète.
    const bins = measureClimbFatigue([
      streamsOf(
        leg({ gradePct: 15, speedKmH: 5, cadence: 58, seconds: 900 }),   // frais
        leg({ gradePct: 15, speedKmH: 2.5, cadence: 52, seconds: 1800 }), // cuit
      ),
    ])
    const usable = bins.filter((b) => b.vamRatioToFresh != null)
    expect(usable.length).toBeGreaterThan(1)
    expect(usable[usable.length - 1].vamRatioToFresh!).toBeLessThan(0.8)
  })

  it('ne crie pas à la fatigue quand l’athlète tient son rythme', () => {
    const bins = measureClimbFatigue([
      streamsOf(
        leg({ gradePct: 15, speedKmH: 5, cadence: 58, seconds: 1200 }),
        leg({ gradePct: 15, speedKmH: 5, cadence: 58, seconds: 1200 }),
      ),
    ])
    for (const b of bins) {
      if (b.vamRatioToFresh != null) expect(b.vamRatioToFresh).toBeCloseTo(1, 1)
    }
  })

  it('ignore le terrain hors de la bande de pente contrôlée', () => {
    // Du plat et du très raide : ni l'un ni l'autre ne doit entrer dans la mesure.
    const bins = measureClimbFatigue([
      streamsOf(
        leg({ gradePct: 2, speedKmH: 11, cadence: 85, seconds: 900 }),
        leg({ gradePct: 40, speedKmH: 2, cadence: 50, seconds: 900 }),
      ),
    ])
    expect(bins.every((b) => b.seconds === 0)).toBe(true)
  })

  it('publie la pente moyenne, pour que le lecteur puisse invalider la comparaison', () => {
    const bins = measureClimbFatigue([
      streamsOf(leg({ gradePct: 15, speedKmH: 5, cadence: 58, seconds: 1200 })),
    ])
    const b = bins.find((x) => x.seconds > 60)!
    expect(b.meanGradePct).toBeCloseTo(15, 0)
  })
})
