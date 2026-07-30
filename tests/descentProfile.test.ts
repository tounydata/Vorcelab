import { describe, it, expect } from 'vitest'
import {
  extractSamples,
  measureDescent,
  aggregateDescentFatigue,
  DESCENT_FATIGUE_GRADE_MIN_PCT,
} from '../src/lib/walkTransition'

// La descente pèse autant de temps de course que la montée et n'a jamais été mesurée.
// Deux questions à ne PAS confondre : la vitesse selon la pente, et sa tenue dans la
// durée (« quadriceps détruits »). La seconde exige de contrôler le relief, sans quoi on
// mesure le terrain et non l'athlète.

function leg(opts: { gradePct: number; speedKmH: number; seconds: number; cadence?: number }) {
  const vMs = opts.speedKmH / 3.6
  const time: number[] = [], distance: number[] = [], altitude: number[] = [], cadence: number[] = []
  let d = 0, a = 1000
  for (let s = 0; s <= opts.seconds; s++) {
    time.push(s); distance.push(d); altitude.push(a); cadence.push(opts.cadence ?? 85)
    d += vMs; a += vMs * (opts.gradePct / 100)
  }
  return { time, distance, altitude, cadence }
}

function streamsOf(...legs: ReturnType<typeof leg>[]) {
  const time: number[] = [], distance: number[] = [], altitude: number[] = [], cadence: number[] = []
  let dOff = 0, aOff = 0, tOff = 0
  for (const l of legs) {
    for (let i = 0; i < l.time.length; i++) {
      time.push(tOff + l.time[i]); distance.push(dOff + l.distance[i])
      altitude.push(aOff + (l.altitude[i] - 1000)); cadence.push(l.cadence[i])
    }
    dOff += l.distance[l.distance.length - 1]
    aOff += l.altitude[l.altitude.length - 1] - 1000
    tOff += l.time[l.time.length - 1] + 1
  }
  return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude }, cadence: { data: cadence } }
}

describe('descente', () => {
  it('compte le dénivelé NÉGATIF déjà encaissé', () => {
    const s = extractSamples(streamsOf(leg({ gradePct: -12, speedKmH: 12, seconds: 600 })))
    expect(s[0].cumulativeLossM).toBe(0)
    expect(s[s.length - 1].cumulativeLossM).toBeGreaterThan(100)
    expect(s[s.length - 1].cumulativeGainM).toBe(0) // que de la descente
    for (let i = 1; i < s.length; i++) {
      expect(s[i].cumulativeLossM).toBeGreaterThanOrEqual(s[i - 1].cumulativeLossM)
    }
  })

  it('range la descente en pentes POSITIVES, sans la confondre avec la montée', () => {
    const { byGrade } = measureDescent([
      streamsOf(leg({ gradePct: -12, speedKmH: 12, seconds: 600 })),
    ])
    const b = byGrade.find((x) => x.gradeMinPct === 10)!
    expect(b.seconds).toBeGreaterThan(300)
    expect(b.meanSpeedKmH).toBeCloseTo(12, 0)
    // Aucune montée ne doit être comptée ici.
    expect(byGrade.filter((x) => x.gradeMinPct >= 20).every((x) => x.seconds === 0)).toBe(true)
  })

  it('ignore la MONTÉE dans la mesure de fatigue en descente', () => {
    const bins = aggregateDescentFatigue(
      extractSamples(streamsOf(leg({ gradePct: +12, speedKmH: 6, seconds: 900 }))),
    )
    expect(bins.every((b) => b.seconds === 0)).toBe(true)
  })

  it('détecte un effondrement de vitesse à pente CONSTANTE', () => {
    const bins = aggregateDescentFatigue(
      extractSamples(streamsOf(
        leg({ gradePct: -12, speedKmH: 14, seconds: 900 }),  // frais
        leg({ gradePct: -12, speedKmH: 8, seconds: 1800 }),  // quadriceps cuits
      )),
    )
    const usable = bins.filter((b) => b.speedRatioToFresh != null)
    expect(usable.length).toBeGreaterThan(1)
    expect(usable[usable.length - 1].speedRatioToFresh!).toBeLessThan(0.85)
  })

  it('ne crie pas à la fatigue quand la vitesse tient', () => {
    const bins = aggregateDescentFatigue(
      extractSamples(streamsOf(
        leg({ gradePct: -12, speedKmH: 12, seconds: 1200 }),
        leg({ gradePct: -12, speedKmH: 12, seconds: 1200 }),
      )),
    )
    for (const b of bins) {
      if (b.speedRatioToFresh != null) expect(b.speedRatioToFresh).toBeCloseTo(1, 1)
    }
  })

  it('exclut le terrain hors de la bande contrôlée', () => {
    expect(DESCENT_FATIGUE_GRADE_MIN_PCT).toBe(8)
    const bins = aggregateDescentFatigue(
      extractSamples(streamsOf(leg({ gradePct: -3, speedKmH: 13, seconds: 1200 }))),
    )
    expect(bins.every((b) => b.seconds === 0)).toBe(true)
  })

  it('publie la pente moyenne, pour que le lecteur puisse invalider la comparaison', () => {
    const bins = aggregateDescentFatigue(
      extractSamples(streamsOf(leg({ gradePct: -12, speedKmH: 12, seconds: 1200 }))),
    )
    const b = bins.find((x) => x.seconds > 60)!
    expect(b.meanGradePct).toBeCloseTo(12, 0)
  })
})

// L'allure (mm:ss/km) est l'unité dans laquelle un coureur pense. « 9,9 km/h » ne parle
// à personne, « 6:04/km » se lit immédiatement. Seule la MONTÉE garde la VAM, où l'allure
// perd son sens (18:00/km à 25 % de pente ne se compare à rien).
describe('conversion vitesse → allure', () => {
  // Réplique de la fonction du script, verrouillée ici car c'est elle qui rend les
  // rapports lisibles — une erreur d'arrondi y passerait inaperçue à la lecture.
  const pace = (kmh: number | null): string => {
    if (kmh == null || !(kmh > 0)) return '—'
    const s = 3600 / kmh
    const m = Math.floor(s / 60)
    const sec = Math.round(s - m * 60)
    return sec === 60 ? `${m + 1}:00/km` : `${m}:${String(sec).padStart(2, '0')}/km`
  }

  it('convertit les vitesses réellement mesurées', () => {
    expect(pace(9.9)).toBe('6:04/km')   // descente 5-10 %, la plus rapide
    expect(pace(5.2)).toBe('11:32/km')  // descente 30-35 %, on freine
    expect(pace(12)).toBe('5:00/km')
  })

  it('ne produit jamais 60 secondes', () => {
    // Sans le garde-fou, 3599,5 s/km s'afficherait « 59:60/km ».
    for (let kmh = 3; kmh <= 20; kmh += 0.01) {
      expect(pace(kmh)).not.toMatch(/:60\/km$/)
    }
  })

  it('se tait sur une vitesse absente ou nulle', () => {
    expect(pace(null)).toBe('—')
    expect(pace(0)).toBe('—')
  })
})
