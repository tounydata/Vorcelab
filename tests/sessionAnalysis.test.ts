import { describe, it, expect } from 'vitest'
import { vamBand, VAM_BAND_LABEL, VAM_BAND_COLOR, driftBand } from '../src/lib/coach/sessionAnalysis'

describe('sessionAnalysis — bandes (knowledge T2 / A1)', () => {
  it('classe la VAM selon la connaissance (900/700/500)', () => {
    expect(vamBand(950)).toBe('elite')
    expect(vamBand(750)).toBe('strong')
    expect(vamBand(600)).toBe('fair')
    expect(vamBand(400)).toBe('weak')
    expect(VAM_BAND_LABEL[vamBand(600)]).toMatch(/correct/i)
    expect(VAM_BAND_COLOR[vamBand(950)]).toMatch(/growth/)
  })
  it('classe la dérive (5 / 10 %)', () => {
    expect(driftBand(3)).toBe('stable')
    expect(driftBand(8)).toBe('moderate')
    expect(driftBand(14)).toBe('marked')
  })
})
