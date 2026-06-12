import { describe, it, expect } from 'vitest'
import { computeRaceProjection, type GpxPoint } from '../src/lib/computeRaceProjection'
import { freshnessMultiplier } from '../src/lib/racePredictor'

// ── Stabilité de la projection : pas de saut « sans rien faire ». ─────────────
// Régression sur le bug rapporté : ±15-20 min d'un jour à l'autre, causés par
// des paliers discrets (falaise de récence à 60 j, marches ACWR) et par les
// footings récup qui polluaient l'allure de base trail.

// Tracé trail vallonné ~10 km (D+/km > 20 → branche trail même sans type).
function hillyTrail(): GpxPoint[] {
  const pts: GpxPoint[] = []
  const lat0 = 45.0, lon0 = 6.0, dLon = 0.00127 // ~100 m/point
  for (let i = 0; i < 100; i++) {
    pts.push({ lat: lat0, lon: lon0 + i * dLon, ele: 1000 + 120 * Math.sin(i / 8) })
  }
  return pts
}

function trailRun(ageDays: number, paceSecPerKm: number, distM = 12000, dplus = 450): Record<string, unknown> {
  return {
    type: 'TrailRun', sport_type: 'TrailRun',
    distance: distM, total_elevation_gain: dplus,
    moving_time: (distM / 1000) * paceSecPerKm,
    average_speed: 1000 / paceSecPerKm,
    start_date: new Date(Date.now() - ageDays * 86_400_000).toISOString(),
  }
}

const trail = hillyTrail()
const race = { type: 'Trail' as const, goal_time: null }

describe('freshnessMultiplier — continu, borné, monotone (plus de marches ACWR)', () => {
  it('est borné [0.99, 1.04] et neutre en zone stable', () => {
    expect(freshnessMultiplier(0.5)).toBe(0.99)
    expect(freshnessMultiplier(1.0)).toBe(1)
    expect(freshnessMultiplier(1.1)).toBe(1)
    expect(freshnessMultiplier(2.0)).toBe(1.04)
  })

  it('est monotone croissant sans saut (continuité ≤ 0.003 par pas de 0.01)', () => {
    let prev = freshnessMultiplier(0.5)
    for (let r = 0.5; r <= 2.0; r += 0.01) {
      const m = freshnessMultiplier(r)
      expect(m).toBeGreaterThanOrEqual(prev - 1e-9) // monotone
      expect(Math.abs(m - prev)).toBeLessThanOrEqual(0.003) // pas de marche
      prev = m
    }
  })
})

describe('Allure de base trail — stabilité jour après jour', () => {
  const baseRuns = [
    trailRun(5, 360), trailRun(12, 350), trailRun(20, 370),
    trailRun(30, 355), trailRun(45, 365),
  ]

  it("pas de falaise à 60 jours : une sortie qui vieillit de 59 → 61 j ne déplace presque rien", () => {
    const at59 = computeRaceProjection(trail, [...baseRuns, trailRun(59, 300)], {}, race)
    const at61 = computeRaceProjection(trail, [...baseRuns, trailRun(61, 300)], {}, race)
    const deltaPct = Math.abs(at59.estTimeS - at61.estTimeS) / at59.estTimeS
    expect(deltaPct).toBeLessThan(0.005) // < 0,5 % (avant : ~moitié du poids du jour au lendemain)
  })

  it('un footing récup nettement plus lent que la médiane est écarté de la projection', () => {
    const without = computeRaceProjection(trail, baseRuns, {}, race)
    const withRecov = computeRaceProjection(trail, [...baseRuns, trailRun(2, 540)], {}, race)
    // 9:00/km > 1,35 × médiane (~6:00/km) → filtré : la projection bouge à peine.
    const deltaPct = Math.abs(withRecov.estTimeS - without.estTimeS) / without.estTimeS
    expect(deltaPct).toBeLessThan(0.02)
  })

  it("une vraie sortie rapide récente, elle, fait bien bouger la projection", () => {
    const without = computeRaceProjection(trail, baseRuns, {}, race)
    const withFast = computeRaceProjection(trail, [...baseRuns, trailRun(2, 290)], {}, race)
    expect(withFast.estTimeS).toBeLessThan(without.estTimeS) // plus rapide, et non filtrée
  })
})
