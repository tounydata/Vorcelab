import { describe, it, expect } from 'vitest'
import { buildSessionDebrief, type DebriefActivity } from '../src/lib/sessionDebrief'

const FCMAX = 185

function run(over: Partial<DebriefActivity>, start = '2026-06-01'): DebriefActivity {
  return {
    distance: 10000, total_elevation_gain: 100, moving_time: 50 * 60,
    average_heartrate: 145, average_speed: 3.3, type: 'Run', sport_type: 'Run',
    start_date: start, ...over,
  }
}

// Historique de courses modestes sur ~2 mois
function modestHistory(): DebriefActivity[] {
  const out: DebriefActivity[] = []
  for (let i = 1; i <= 12; i++) {
    const d = new Date('2026-06-01'); d.setDate(d.getDate() - i * 4)
    out.push(run({ id: `h${i}`, distance: 8000, total_elevation_gain: 80, moving_time: 45 * 60 }, d.toISOString().slice(0, 10)))
  }
  return out
}

describe('buildSessionDebrief', () => {
  it('repère la plus longue sortie et le met dans le titre', () => {
    const current = run({ id: 'cur', distance: 26000, total_elevation_gain: 1500, moving_time: 250 * 60, average_heartrate: 151, sport_type: 'TrailRun', type: 'TrailRun' })
    const d = buildSessionDebrief(current, modestHistory(), FCMAX)
    expect(d.sampleSize).toBe(12)
    expect(d.headline.toLowerCase()).toContain('plus longue')
    expect(d.comparisons.some((c) => c.startsWith('Distance'))).toBe(true)
    expect(d.impact).toContain('Charge')
    expect(d.tip).toBeTruthy()
  })

  it('classe une séance dans la moyenne sans la sur-vendre', () => {
    // Historique varié 6→14 km : la séance courante (9 km) tombe au milieu.
    const varied: DebriefActivity[] = []
    for (let i = 1; i <= 12; i++) {
      const d = new Date('2026-06-01'); d.setDate(d.getDate() - i * 4)
      varied.push(run({ id: `v${i}`, distance: 6000 + i * 700, total_elevation_gain: 80, moving_time: (40 + i * 3) * 60 }, d.toISOString().slice(0, 10)))
    }
    const current = run({ id: 'cur', distance: 9000, total_elevation_gain: 90, moving_time: 50 * 60 })
    const d = buildSessionDebrief(current, varied, FCMAX)
    // ni top distance, ni top effort → message « plus modéré » ou « dans ta moyenne »
    expect(d.headline).not.toContain('plus longue')
    expect(d.impact).toMatch(/moyenne|modéré|légère/i)
  })

  it('reste robuste sans historique comparable', () => {
    const current = run({ id: 'cur', distance: 12000 })
    const d = buildSessionDebrief(current, [], FCMAX)
    expect(d.sampleSize).toBe(0)
    expect(d.comparisons).toEqual([])
    expect(d.impact).toContain('Charge')
    expect(d.headline.length).toBeGreaterThan(0)
  })

  it('ne compare pas une sortie vélo aux courses (familles séparées)', () => {
    const current = run({ id: 'cur', distance: 40000, moving_time: 90 * 60, type: 'Ride', sport_type: 'Ride', average_heartrate: 130 })
    const d = buildSessionDebrief(current, modestHistory(), FCMAX)
    // que des courses dans l'historique → aucun pair vélo
    expect(d.sampleSize).toBe(0)
  })

  it('signale un échantillon limité entre 1 et 2 pairs', () => {
    const hist = modestHistory().slice(0, 2)
    const current = run({ id: 'cur', distance: 9000 })
    const d = buildSessionDebrief(current, hist, FCMAX)
    expect(d.sampleSize).toBe(2)
    expect(d.comparisons[0]).toContain('limitée')
  })

  it('exclut la séance courante de ses propres pairs (via id)', () => {
    const current = run({ id: 'cur', distance: 9000 })
    const hist = [...modestHistory(), run({ id: 'cur', distance: 9000 }, '2026-05-20')]
    const d = buildSessionDebrief(current, hist, FCMAX)
    expect(d.sampleSize).toBe(12) // le doublon 'cur' est écarté
  })
})
