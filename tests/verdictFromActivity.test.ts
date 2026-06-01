import { describe, it, expect } from 'vitest'
import { extractActual, buildSessionVerdict } from '../src/lib/coach/verdictFromActivity'

describe('extractActual', () => {
  it('calcule allure (s/km), %FCmax, D+ et durée', () => {
    const a = extractActual({ distance: 10000, moving_time: 3000, average_heartrate: 152, total_elevation_gain: 120 }, 190)
    expect(a.avgPaceSecPerKm).toBe(300)        // 3000 s / 10 km
    expect(a.avgHrPctMax).toBeCloseTo(0.8, 2)  // 152 / 190
    expect(a.dplusM).toBe(120)
    expect(a.durationMin).toBe(50)
  })

  it('activité nulle → tout null', () => {
    const a = extractActual(null, 190)
    expect(a).toEqual({ avgPaceSecPerKm: null, avgHrPctMax: null, driftPct: null, dplusM: null, durationMin: null })
  })
})

describe('buildSessionVerdict', () => {
  it('footing facile couru trop vite et en FC haute → trop dur', () => {
    const { result } = buildSessionVerdict(
      { system: 'endurance', climbing: false }, 50, 190,
      { distance: 12000, moving_time: 3000, average_heartrate: 182 }, // ~4:10/km, 96 %FCmax
      { feeling: 'bad', rpe: null, pain: false },
    )
    expect(result.verdict).toBe('trop_dur')
  })

  it('sans activité, ressenti « bien » → trop facile, confiance basse', () => {
    const { result } = buildSessionVerdict(
      { system: 'endurance', climbing: false }, 50, 190,
      null,
      { feeling: 'good', rpe: 2, pain: false },
    )
    expect(result.verdict).toBe('trop_facile')
    expect(result.confidence).toBe('low')
  })
})
