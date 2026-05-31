import { describe, it, expect } from 'vitest'
import {
  assessPain,
  detectOverload,
  HEURISTIC_CAVEATS,
} from '../src/lib/safetyGuards'

// ─── E1 — douleur ───────────────────────────────────────────────────────────────

describe('assessPain', () => {
  it('drapeau rouge → arrêt + orientation pro', () => {
    const r = assessPain({ level: 2, redFlag: true })
    expect(r.action).toBe('stop_refer')
    expect(r.refer).toBe(true)
  })

  it('douleur >5 ou pire le lendemain → réduire', () => {
    expect(assessPain({ level: 6 }).action).toBe('reduce')
    expect(assessPain({ level: 4, worseNextMorning: true }).action).toBe('reduce')
  })

  it('aggravation semaine après semaine → arrêt + pro', () => {
    expect(assessPain({ level: 4, worseningWeekOverWeek: true }).action).toBe('stop_refer')
  })

  it('3-5 stable → prudence (acceptable)', () => {
    expect(assessPain({ level: 4 }).action).toBe('caution')
  })

  it('0-2 → ok', () => {
    expect(assessPain({ level: 1 }).action).toBe('ok')
  })

  it('ne pose jamais de diagnostic (juste orientation)', () => {
    expect(assessPain({ level: 9 }).message.toLowerCase()).not.toContain('diagnostic')
  })
})

// ─── E2 — surcharge multi-signaux ─────────────────────────────────────────────────

describe('detectOverload', () => {
  it('un seul signal ne déclenche jamais une surcharge', () => {
    expect(detectOverload({ acwr: 1.8 }).level).toBe('watch')
    expect(detectOverload({ sRpeTrend: 'rising' }).level).toBe('watch')
  })

  it('≥ 2 signaux concordants → surcharge + propose décharge', () => {
    const r = detectOverload({ acwr: 1.7, sRpeTrend: 'rising' })
    expect(r.level).toBe('overload')
    expect(r.suggestDeload).toBe(true)
    expect(r.flagged.length).toBe(2)
  })

  it('aucun signal → rien', () => {
    expect(detectOverload({ acwr: 1.0, sRpeTrend: 'stable', wellness: 'green' }).level).toBe('none')
  })

  it('ignore les signaux appareil (non fournis) et se base sur l\'actif', () => {
    const r = detectOverload({ acwr: 1.6, wellness: 'red' })
    expect(r.level).toBe('overload')
  })
})

// ─── E4 — garde-fous heuristiques ─────────────────────────────────────────────────

describe('HEURISTIC_CAVEATS', () => {
  it('expose des repères pour les heuristiques clés', () => {
    expect(HEURISTIC_CAVEATS.acwr).toBeTruthy()
    expect(HEURISTIC_CAVEATS.tenPercent).toBeTruthy()
    expect(HEURISTIC_CAVEATS.cadence).toBeTruthy()
  })
})
