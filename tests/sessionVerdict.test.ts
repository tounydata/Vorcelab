import { describe, it, expect } from 'vitest'
import {
  deriveSessionTarget,
  computeSessionVerdict,
  compileSessionSignals,
  type SessionActual,
  type SessionRpe,
} from '../src/lib/coach/sessionVerdict'

const NO_ACTUAL: SessionActual = {
  avgPaceSecPerKm: null, avgHrPctMax: null, driftPct: null, dplusM: null, durationMin: null,
}
const NEUTRAL_RPE: SessionRpe = { feeling: null, rpe: null, pain: false }

describe('deriveSessionTarget', () => {
  it('mappe le système sur la bonne zone et calcule l\'allure si VDOT', () => {
    const easy = deriveSessionTarget({ system: 'endurance', climbing: false }, 50, 190)
    expect(easy.zone).toBe('E')
    expect(easy.continuous).toBe(true)
    expect(easy.paceRange).not.toBeNull()
    expect(easy.hrRange).not.toBeNull()

    const vo2 = deriveSessionTarget({ system: 'vo2max', climbing: false }, 50, null)
    expect(vo2.zone).toBe('I')
    expect(vo2.continuous).toBe(false) // intervalles → allure moyenne non comparable
    expect(vo2.hrRange).toBeNull()     // pas de FCmax
  })
})

describe('computeSessionVerdict', () => {
  const target = deriveSessionTarget({ system: 'endurance', climbing: false }, 50, 190)

  it('séance sans activité ET sans ressenti → manquée', () => {
    const r = computeSessionVerdict(target, NO_ACTUAL, NEUTRAL_RPE, false)
    expect(r.verdict).toBe('manquee')
    expect(r.confidence).toBe('low')
  })

  it('FC au-dessus de la zone + ressenti dur + dérive marquée → trop dur', () => {
    const actual: SessionActual = { avgPaceSecPerKm: 300, avgHrPctMax: 0.95, driftPct: 14, dplusM: 0, durationMin: 60 }
    const rpe: SessionRpe = { feeling: 'bad', rpe: 9, pain: false }
    const r = computeSessionVerdict(target, actual, rpe, true)
    expect(r.verdict).toBe('trop_dur')
    expect(r.confidence).toBe('high')
  })

  it('tout dans la cible → conforme', () => {
    const mid = (target.paceRange!.fastSecPerKm + target.paceRange!.slowSecPerKm) / 2
    const actual: SessionActual = { avgPaceSecPerKm: mid, avgHrPctMax: 0.72, driftPct: 3, dplusM: 0, durationMin: 60 }
    const r = computeSessionVerdict(target, actual, { feeling: 'ok', rpe: null, pain: false }, true)
    expect(r.verdict).toBe('conforme')
  })

  it('FC sous la zone + ressenti facile → trop facile', () => {
    const actual: SessionActual = { avgPaceSecPerKm: target.paceRange!.fastSecPerKm - 30, avgHrPctMax: 0.6, driftPct: 2, dplusM: 0, durationMin: 60 }
    const r = computeSessionVerdict(target, actual, { feeling: 'good', rpe: 2, pain: false }, true)
    expect(r.verdict).toBe('trop_facile')
  })

  it('footing dans la cible + ressenti « Bien » → conforme (et NON trop facile)', () => {
    // Le bug signalé : « Bien » sur un footing était classé « trop facile ».
    const mid = (target.paceRange!.fastSecPerKm + target.paceRange!.slowSecPerKm) / 2
    const actual: SessionActual = { avgPaceSecPerKm: mid, avgHrPctMax: 0.72, driftPct: 3, dplusM: 0, durationMin: 60 }
    const r = computeSessionVerdict(target, actual, { feeling: 'good', rpe: null, pain: false }, true)
    expect(r.verdict).toBe('conforme')
  })

  it('ressenti « Trop facile » → trop facile ; « Trop dur » → trop dur', () => {
    const mid = (target.paceRange!.fastSecPerKm + target.paceRange!.slowSecPerKm) / 2
    const actual: SessionActual = { avgPaceSecPerKm: mid, avgHrPctMax: 0.72, driftPct: 3, dplusM: 0, durationMin: 60 }
    expect(computeSessionVerdict(target, actual, { feeling: 'too_easy', rpe: null, pain: false }, true).verdict).toBe('trop_facile')
    expect(computeSessionVerdict(target, actual, { feeling: 'too_hard', rpe: null, pain: false }, true).verdict).toBe('trop_dur')
  })

  it('une douleur ne classe jamais en « trop facile »', () => {
    const actual: SessionActual = { avgPaceSecPerKm: target.paceRange!.slowSecPerKm + 60, avgHrPctMax: 0.6, driftPct: 2, dplusM: 0, durationMin: 60 }
    const r = computeSessionVerdict(target, actual, { feeling: 'good', rpe: 2, pain: true }, true)
    expect(r.verdict).not.toBe('trop_facile')
  })

  it('sans activité mais avec ressenti → verdict de confiance basse', () => {
    const r = computeSessionVerdict(target, NO_ACTUAL, { feeling: 'bad', rpe: null, pain: false }, false)
    expect(r.verdict).toBe('trop_dur')
    expect(r.confidence).toBe('low')
    expect(r.summary).toContain('ressenti')
  })

  it('produit toujours un signal par axe', () => {
    const sig = compileSessionSignals(target, NO_ACTUAL, NEUTRAL_RPE)
    expect(sig.map((s) => s.axis)).toEqual(['allure', 'fc', 'derive', 'ressenti'])
  })
})
