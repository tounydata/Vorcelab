import { describe, it, expect } from 'vitest'
import { selectTuningLeaveOneAthleteOut, type TuningErrors } from '../src/lib/backtestLoao'

type Tuning = { anchorTrustHigh: number }
const PROD: Tuning = { anchorTrustHigh: 0.9 }
const isBaseline = (t: Tuning) => t.anchorTrustHigh === PROD.anchorTrustHigh

function candidate(tuning: Tuning, byAthlete: Record<string, number[]>): TuningErrors<Tuning> {
  return { tuning, errorsByAthlete: new Map(Object.entries(byAthlete)) }
}

describe('sélection de réglage en leave-one-athlete-out', () => {
  it('adopte un réglage qui améliore TOUS les athlètes', () => {
    const v = selectTuningLeaveOneAthleteOut([
      candidate(PROD, { a: [13, 13], b: [12], c: [14], d: [15] }),
      candidate({ anchorTrustHigh: 1.0 }, { a: [10, 10], b: [9], c: [11], d: [12] }),
    ], isBaseline)!
    expect(v.gain).toBeCloseTo(3, 6)
    expect(v.selectionStability).toBe(1)
    expect(v.adopt).toBe(true)
    expect(v.selectionCounts[0].tuning.anchorTrustHigh).toBe(1.0)
  })

  it('REFUSE un réglage qui gagne en échantillon mais perd hors échantillon', () => {
    // Le candidat est spectaculaire sur `a` et `b`, désastreux sur `c` et `d`.
    // En macro sur tout le monde il gagne (moyenne 9,5 contre 12) ; mais chaque
    // athlète tenu à l'écart hérite d'un réglage élu par les autres, et la
    // mesure honnête se dégrade. C'est précisément le piège que le protocole
    // « macro sur tous les athlètes » ne pouvait pas voir.
    const v = selectTuningLeaveOneAthleteOut([
      candidate(PROD, { a: [12], b: [12], c: [12], d: [12] }),
      candidate({ anchorTrustHigh: 1.0 }, { a: [2], b: [2], c: [17], d: [17] }),
    ], isBaseline)!
    expect(v.baselineMape).toBeCloseTo(12, 6)
    expect(v.loaoMape).toBeGreaterThan(v.baselineMape)
    expect(v.gain).toBeLessThan(0)
    expect(v.adopt).toBe(false)
    expect(v.reason).toContain('seuil de bruit')
  })

  it('refuse un gain sous le seuil de bruit', () => {
    const v = selectTuningLeaveOneAthleteOut([
      candidate(PROD, { a: [12], b: [12], c: [12] }),
      candidate({ anchorTrustHigh: 0.95 }, { a: [11.8], b: [11.8], c: [11.8] }),
    ], isBaseline)!
    expect(v.gain).toBeCloseTo(0.2, 6)
    expect(v.adopt).toBe(false)
    expect(v.reason).toContain('0,5 pt'.replace(',', '.'))
  })

  it('refuse un gain porté par une sélection instable', () => {
    // Chaque athlète élit un réglage différent : le « meilleur » n'existe pas.
    const v = selectTuningLeaveOneAthleteOut([
      candidate(PROD, { a: [20], b: [20], c: [20], d: [20] }),
      candidate({ anchorTrustHigh: 0.7 }, { a: [1], b: [30], c: [30], d: [12] }),
      candidate({ anchorTrustHigh: 1.0 }, { a: [30], b: [1], c: [30], d: [12] }),
      candidate({ anchorTrustHigh: 0.8 }, { a: [30], b: [30], c: [1], d: [12] }),
    ], isBaseline)!
    expect(v.selectionStability).toBeLessThan(1)
    expect(v.adopt).toBe(false)
  })

  it('refuse un gain moyen payé par un athlète qui régresse', () => {
    const v = selectTuningLeaveOneAthleteOut([
      candidate(PROD, { a: [12], b: [12], c: [12], d: [12] }),
      candidate({ anchorTrustHigh: 1.0 }, { a: [5], b: [5], c: [5], d: [20] }),
    ], isBaseline)!
    expect(v.gain).toBeGreaterThan(0.5)
    expect(v.selectionStability).toBe(1)
    expect(v.adopt).toBe(false)
    expect(v.reason).toContain('régressent')
  })

  it('exige la production dans les candidats et au moins deux athlètes', () => {
    expect(selectTuningLeaveOneAthleteOut([], isBaseline)).toBeNull()
    expect(selectTuningLeaveOneAthleteOut(
      [candidate({ anchorTrustHigh: 1.0 }, { a: [10], b: [10] })], isBaseline,
    )).toBeNull()
    expect(selectTuningLeaveOneAthleteOut(
      [candidate(PROD, { a: [10] })], isBaseline,
    )).toBeNull()
  })

  it('mesure chaque athlète sous un réglage qu’il n’a pas contribué à choisir', () => {
    const v = selectTuningLeaveOneAthleteOut([
      candidate(PROD, { a: [12], b: [12], c: [12] }),
      candidate({ anchorTrustHigh: 1.0 }, { a: [4], b: [8], c: [8] }),
    ], isBaseline)!
    // `a` est tenu à l'écart : son score flatteur de 4 ne doit pas peser sur le
    // choix, et c'est bien son propre 4 qui est ensuite mesuré.
    const a = v.perAthlete.find((p) => p.athleteId === 'a')!
    expect(a.chosen.anchorTrustHigh).toBe(1.0)
    expect(a.heldOutMape).toBe(4)
    expect(a.baselineMape).toBe(12)
  })
})
