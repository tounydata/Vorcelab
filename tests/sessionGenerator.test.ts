import { describe, it, expect } from 'vitest'
import {
  easyRun,
  tempoRun,
  cruiseIntervals,
  vo2_30_30,
  hillSession,
  hillSpec,
  thresholdWeeklyCapMin,
  strides,
  ZONE_RPE,
  STRIDES_COUNT_AS_INTENSITY,
} from '../src/lib/sessionGenerator'
import { thresholdPaceSecPerKm } from '../src/lib/paceEngine'

// ─── B1 — footing ─────────────────────────────────────────────────────────────────

describe('easyRun', () => {
  it('génère un bloc chiffré en zone E', () => {
    const w = easyRun(50, 45)
    expect(w.type).toBe('easy')
    expect(w.totalMin).toBe(45)
    expect(w.blocks[0].zone).toBe('E')
    expect(w.blocks[0].paceSecPerKm).toBeGreaterThan(0)
    expect(w.intent).toBeTruthy()
  })
})

// ─── B2 — seuil ───────────────────────────────────────────────────────────────────

describe('tempo & cruise', () => {
  it('tempoRun encadre le bloc principal (échauffement + main + retour au calme)', () => {
    const w = tempoRun(50, 20)
    expect(w.blocks[0].kind).toBe('warmup')
    expect(w.blocks.at(-1)!.kind).toBe('cooldown')
    const main = w.blocks.find(b => b.kind === 'main')!
    expect(main.zone).toBe('T')
    expect(main.paceSecPerKm).toBe(Math.round(thresholdPaceSecPerKm(50)))
    expect(main.rpe).toBe(ZONE_RPE.T)
  })

  it('cruiseIntervals porte les répétitions au seuil', () => {
    const w = cruiseIntervals(50, 5, 6)
    const main = w.blocks.find(b => b.kind === 'main')!
    expect(main.reps).toBe(5)
    expect(main.zone).toBe('T')
  })

  it('thresholdWeeklyCapMin plafonne ~10 % du km hebdo', () => {
    // 50 km/sem, T-pace ~4:15 → ~10 % = 5 km ≈ 21 min
    const cap = thresholdWeeklyCapMin(50, 50)
    expect(cap).toBeGreaterThan(18)
    expect(cap).toBeLessThan(24)
  })
})

// ─── B1 — VO2max ──────────────────────────────────────────────────────────────────

describe('vo2_30_30', () => {
  it('alterne 30 s effort I / 30 s récup', () => {
    const w = vo2_30_30(50, 12)
    const main = w.blocks.find(b => b.kind === 'main')!
    expect(main.zone).toBe('I')
    expect(main.durationSec).toBe(30)
    expect(main.reps).toBe(12)
  })
})

// ─── B3 — côte ────────────────────────────────────────────────────────────────────

describe('hill', () => {
  it('paramètre par objectif (force = pente forte/court, seuil = pente douce/long)', () => {
    const force = hillSpec('force', 6)
    const seuil = hillSpec('seuil', 4)
    expect(force.gradeMinPct).toBeGreaterThan(seuil.gradeMaxPct)
    expect(force.repSec).toBeLessThan(seuil.repSec)
    expect(force.recoveryRatio).toBeGreaterThan(seuil.recoveryRatio)
  })

  it('la séance de côte ne fixe pas d\'allure (pilotage RPE)', () => {
    const w = hillSession('force', 6)
    const main = w.blocks.find(b => b.kind === 'main')!
    expect(main.paceSecPerKm).toBeUndefined()
    expect(main.rpe).toBeGreaterThan(0)
  })
})

// ─── B4 — strides ─────────────────────────────────────────────────────────────────

describe('strides', () => {
  it('sont neuromusculaires et hors quota d\'intensité', () => {
    expect(strides(6).reps).toBe(6)
    expect(STRIDES_COUNT_AS_INTENSITY).toBe(false)
  })
})
