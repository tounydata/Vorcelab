import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'

// Frein « fatigue du dénivelé » : INDIVIDUEL. Il ne se déclenche QUE si le D+ de la
// course dépasse le plus gros D+ que l'athlète encaisse d'habitude (sa plus grosse
// sortie), et son ampleur dépend de lui. Jamais une pénalité universelle.

// Trail costaud ~10 km avec beaucoup de D+ (oscillations d'altitude marquées).
function bigClimbTrail(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0, dLon = 0.00127
  for (let i = 0; i < 120; i++) pts.push({ lat: lat0, lon: lon0 + i * dLon, ele: 1000 + 180 * Math.sin(i / 4) })
  return pts
}
function trailRun(dplus: number): Record<string, unknown> {
  return {
    type: 'TrailRun', sport_type: 'TrailRun', distance: 12000, total_elevation_gain: dplus,
    moving_time: 4200, average_speed: 12000 / 4200, average_heartrate: 150, max_heartrate: 190,
    start_date: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  }
}
const race = { type: 'Trail' as const, goal_time: null }
const proj = (priorDplus: number) =>
  computeRaceProjection(bigClimbTrail(), [trailRun(priorDplus), trailRun(priorDplus), trailRun(priorDplus)], {}, race)

describe('fatigue du dénivelé — frein individuel', () => {
  it('se déclenche quand le D+ dépasse le D+ habituel de l’athlète', () => {
    const p = proj(150) // habitué à ~150 m D+ → gros trail bien au-delà
    expect(p.personalAdjustments.some((a) => a.label.startsWith('Fatigue du dénivelé'))).toBe(true)
  })

  it('ne se déclenche PAS pour un habitué du gros dénivelé (même course)', () => {
    const p = proj(3000) // habitué à 3000 m D+ → cette course est en deçà
    expect(p.personalAdjustments.some((a) => a.label.startsWith('Fatigue du dénivelé'))).toBe(false)
  })

  it('rend la projection plus lente pour le coureur non habitué (individuel)', () => {
    // Même course, même effort : celui qui n’a jamais encaissé autant de D+ est ralenti.
    expect(proj(150).estTimeS).toBeGreaterThan(proj(3000).estTimeS)
  })
})
