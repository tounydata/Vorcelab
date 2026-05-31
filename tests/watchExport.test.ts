import { describe, it, expect } from 'vitest'
import { toWatchWorkout, sendToWatch, WATCH_EXPORT_ENABLED } from '../src/lib/coach/watchExport'
import { tempoRun, hillSession } from '../src/lib/sessionGenerator'

describe('watchExport (fonction dormante)', () => {
  it('reste dormant : aucune API d\'export', () => {
    expect(WATCH_EXPORT_ENABLED).toBe(false)
  })

  it('sendToWatch rejette (dormant, jamais appelé)', async () => {
    await expect(sendToWatch(tempoRun(50, 20))).rejects.toThrow(/dormante|indisponible/)
  })

  it('toWatchWorkout : un step par bloc, chaque step = lap manuel (anti Auto-Lap)', () => {
    const w = tempoRun(50, 20)
    const ww = toWatchWorkout(w, 'Tempo')
    expect(ww.steps).toHaveLength(w.blocks.length)
    expect(ww.steps.every(s => s.manualLap === true)).toBe(true)
    expect(ww.name).toBe('Tempo')
  })

  it('cible « pace » quand le bloc a une allure, sinon « open »', () => {
    const tempo = toWatchWorkout(tempoRun(50, 20), 'T')
    expect(tempo.steps.some(s => s.targetType === 'pace' && s.paceSecPerKm)).toBe(true)
    // côte = piloté RPE → open
    const hill = toWatchWorkout(hillSession('force', 6), 'Côtes')
    expect(hill.steps.some(s => s.targetType === 'open')).toBe(true)
  })
})
