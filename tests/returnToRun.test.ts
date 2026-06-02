import { describe, it, expect } from 'vitest'
import { returnToRunLadder, returnToRunStep, nextReturnToRunStep } from '../src/lib/coach/returnToRun'

describe('returnToRunLadder', () => {
  it('échelle graduée : course croît, marche décroît, finit en continu', () => {
    const l = returnToRunLadder()
    expect(l[0].runSec).toBe(60)
    expect(l[l.length - 1].continuous).toBe(true)
    // course croissante
    for (let i = 1; i < l.length; i++) expect(l[i].runSec).toBeGreaterThanOrEqual(l[i - 1].runSec)
    // volume raisonnable
    l.forEach((s) => expect(s.totalMin).toBeGreaterThanOrEqual(20))
  })
  it('label lisible', () => {
    expect(returnToRunStep(1).label).toContain('marche')
    expect(returnToRunStep(8).label).toContain('continu')
  })
})

describe('nextReturnToRunStep — gated par la douleur', () => {
  it('2 séances sans douleur → palier suivant', () => {
    let s = { step: 1, cleanSessions: 0 }
    const ok = { pain: 1, worseNextDay: false }
    s = nextReturnToRunStep(s, ok).state           // 1 séance propre
    const r = nextReturnToRunStep(s, ok)           // 2e → avance
    expect(r.advanced).toBe(true)
    expect(r.state.step).toBe(2)
  })

  it('douleur > 2/10 → on recule d\'un palier', () => {
    const r = nextReturnToRunStep({ step: 3, cleanSessions: 1 }, { pain: 5, worseNextDay: false })
    expect(r.regressed).toBe(true)
    expect(r.state.step).toBe(2)
    expect(r.state.cleanSessions).toBe(0)
  })

  it('aggravation le lendemain → recul même sans douleur forte', () => {
    const r = nextReturnToRunStep({ step: 2, cleanSessions: 0 }, { pain: 1, worseNextDay: true })
    expect(r.state.step).toBe(1)
  })

  it('ne descend jamais sous le palier 1', () => {
    const r = nextReturnToRunStep({ step: 1, cleanSessions: 0 }, { pain: 8, worseNextDay: true })
    expect(r.state.step).toBe(1)
  })
})
