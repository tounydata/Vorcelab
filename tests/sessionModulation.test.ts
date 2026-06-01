import { describe, it, expect } from 'vitest'
import { computeAdjustment, applyModulation } from '../src/lib/coach/sessionModulation'
import { generateTrainingPlan, type PlanInput } from '../src/lib/coach/planGenerator'

function road10k(over: Partial<PlanInput> = {}): PlanInput {
  return {
    raceName: '10 km', raceDateISO: '2026-12-13', raceDistanceKm: 10,
    raceElevationM: 80, raceType: 'Route', todayISO: '2026-06-01',
    daysPerWeek: 5, currentCTL: null, ...over,
  }
}

const QUALITY = new Set(['tempo', 'threshold', 'vo2max', 'speed', 'hills', 'race_pace'])
const isQuality = (s: { intensity: string; system: string }) => s.intensity === 'hard' || QUALITY.has(s.system)

describe('computeAdjustment', () => {
  it('trop_dur → allègement, trop_facile → progression, sinon rien', () => {
    expect(computeAdjustment('trop_dur').direction).toBe('lighten')
    expect(computeAdjustment('trop_facile').direction).toBe('progress')
    expect(computeAdjustment('conforme').direction).toBe('none')
    expect(computeAdjustment('manquee').direction).toBe('none')
    expect(computeAdjustment(null).direction).toBe('none')
  })
})

describe('applyModulation', () => {
  it('allègement : la 1re séance qualité de la semaine devient un footing facile', () => {
    const plan = generateTrainingPlan(road10k({ weaknesses: ['vo2max'] }))
    const before = plan.weeks[0].sessions.filter(isQuality).length
    const { plan: out, applied } = applyModulation(plan, computeAdjustment('trop_dur'))
    expect(applied?.direction).toBe('lighten')
    const after = out.weeks[0].sessions.filter(isQuality).length
    expect(after).toBe(before - 1) // une qualité en moins
    expect(out.weeks[0].sessions.some((s) => s.workoutId === 'endurance_easy')).toBe(true)
  })

  it('progression : un footing facile devient un tempo', () => {
    const plan = generateTrainingPlan(road10k())
    const { plan: out, applied } = applyModulation(plan, computeAdjustment('trop_facile'))
    expect(applied?.direction).toBe('progress')
    expect(out.weeks[0].sessions.some((s) => s.workoutId === 'tempo_run')).toBe(true)
  })

  it('verdict conforme → plan inchangé', () => {
    const plan = generateTrainingPlan(road10k())
    const { plan: out, applied } = applyModulation(plan, computeAdjustment('conforme'))
    expect(applied).toBeNull()
    expect(out).toBe(plan)
  })

  it("l'affûtage (taper) n'est jamais modulé", () => {
    // Course très proche → semaine 0 = taper
    const plan = generateTrainingPlan(road10k({ raceDateISO: '2026-06-08' }))
    const { applied } = applyModulation(plan, computeAdjustment('trop_dur'))
    if (plan.weeks[0].phase === 'taper' || plan.weeks[0].phase === 'race') {
      expect(applied).toBeNull()
    }
  })
})
