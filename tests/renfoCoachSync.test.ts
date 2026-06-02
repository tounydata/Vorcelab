import { describe, it, expect } from 'vitest'
import { currentPlanPhase } from '../src/lib/coach/planGenerator'
import { runningPhaseToDUP } from '../src/lib/renfoUtils'

describe('currentPlanPhase', () => {
  it('course lointaine → base ; course imminente → taper/race', () => {
    expect(currentPlanPhase('2026-12-13', 21, '2026-06-02')).toBe('base')
    expect(['taper', 'race']).toContain(currentPlanPhase('2026-06-08', 21, '2026-06-02'))
  })
})

describe('runningPhaseToDUP — co-périodisation', () => {
  it('mappe la phase course → DUP renfo', () => {
    expect(runningPhaseToDUP('base')).toBe('force')
    expect(runningPhaseToDUP('build')).toBe('volume')
    expect(runningPhaseToDUP('specific')).toBe('puissance')
    expect(runningPhaseToDUP('taper')).toBe('deload')
    expect(runningPhaseToDUP('race')).toBe('deload')
  })
})
