import { describe, it, expect } from 'vitest'
import { fmtHM } from '../src/lib/raceStrategyView'
import { formatPace } from '../src/lib/paceEngine'

// Régression « 2h60 » (vu en prod) : tout formatteur doit arrondir AVANT de
// séparer heures/minutes ou minutes/secondes — jamais de 60 dans le champ bas.

describe('fmtHM — retenue des minutes', () => {
  it('179,6 min → 3h00 (pas 2h60)', () => {
    expect(fmtHM(179.6)).toBe('3h00')
  })
  it('valeurs rondes inchangées', () => {
    expect(fmtHM(125)).toBe('2h05')
    expect(fmtHM(60)).toBe('1h00')
    expect(fmtHM(59.4)).toBe('0h59')
  })
  it('jamais de « h60 » sur une plage continue', () => {
    for (let m = 0; m < 600; m += 0.1) {
      expect(fmtHM(m)).not.toMatch(/h60/)
    }
  })
})

describe('formatPace — retenue des secondes', () => {
  it('299,6 s/km → 5:00 (pas 4:60)', () => {
    expect(formatPace(299.6)).toBe('5:00')
  })
  it('jamais de « :60 » sur une plage continue', () => {
    for (let s = 180; s < 600; s += 0.1) {
      expect(formatPace(s)).not.toMatch(/:60/)
    }
  })
})
