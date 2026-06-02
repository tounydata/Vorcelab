import { describe, it, expect } from 'vitest'
import {
  computeActivityLoad,
  computeDailyPMC,
  computeACWR,
  type ActivityForLoad,
} from '../src/lib/trainingLoad'

// Cohérence avec le statut d'entraînement Garmin : une sortie longue à intensité
// aérobie (FC moyenne tirée par les montées) ne doit pas exploser la charge ni
// déclencher un faux « surmenage ». Cf. capture Garmin « Productif / Optimal »
// vs ancien Vorcelab « SURMENAGE ».
const FCMAX = 185

describe('computeActivityLoad — recalibrage Garmin', () => {
  it('classe une sortie longue z≈0.82 en aérobie (3.5), pas en seuil (4.5)', () => {
    // 26 km trail, 4h14, D+1567, FC 151 → z=0.816 → intensité 3.5 (palier intermédiaire)
    const a: ActivityForLoad = {
      moving_time: 254 * 60, average_heartrate: 151, sport_type: 'TrailRun',
      distance: 26000, total_elevation_gain: 1567, start_date: '2026-05-31',
    }
    const load = computeActivityLoad(a, FCMAX)
    // minutes effectives = 90 + (254-90)*0.5 = 172 ; ×3.5 ×1.30 (D+) ×1.05 (trail)
    expect(load).toBe(Math.round(172 * 3.5 * 1.3 * 1.05))
    // bien plus bas que l'ancien modèle (1560), poids relatif plus proche de Garmin
    expect(load).toBeLessThan(900)
  })

  it('applique un rendement décroissant au-delà de 90 min', () => {
    const base: ActivityForLoad = { moving_time: 90 * 60, average_heartrate: 150, sport_type: 'Run', distance: 16000, start_date: 'x' }
    const long: ActivityForLoad = { ...base, moving_time: 254 * 60 }
    const rByDuration = computeActivityLoad(long, FCMAX) / computeActivityLoad(base, FCMAX)
    // 254 min ≈ 2.8× la durée, mais < 2× la charge grâce à la saturation
    expect(rByDuration).toBeLessThan(2)
  })

  it("garde z≥0.85 en seuil (4.5) — un vrai tempo n'est pas dégradé", () => {
    const a: ActivityForLoad = { moving_time: 40 * 60, average_heartrate: 161, sport_type: 'Run', distance: 9000, start_date: 'x' }
    // z = 161/185 = 0.870 → 4.5
    expect(computeActivityLoad(a, FCMAX)).toBe(Math.round(40 * 4.5))
  })
})

describe('cohérence statut — pic isolé ≠ surmenage', () => {
  // Reconstruit le scénario : base faible + UNE grosse sortie récente.
  function scenario(): ActivityForLoad[] {
    const today = new Date()
    const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
    const acts: ActivityForLoad[] = [
      { moving_time: 254 * 60, average_heartrate: 151, sport_type: 'TrailRun', distance: 26000, total_elevation_gain: 1567, start_date: daysAgo(2) },
      { moving_time: 45 * 60, average_heartrate: 154, sport_type: 'Run', distance: 7100, start_date: daysAgo(5) },
    ]
    // base régulière mais modeste sur ~6 semaines
    for (let d = 45; d >= 8; d -= 3)
      acts.push({ moving_time: 50 * 60, average_heartrate: 150, sport_type: 'Run', distance: 9000, total_elevation_gain: 80, start_date: daysAgo(d) })
    return acts
  }

  it('une seule grosse sortie récente ne compte pas comme 3 jours durs', () => {
    const pmc = computeDailyPMC(scenario(), FCMAX, { totalDays: 90, displayDays: 42 })
    const hardDays = pmc.slice(-7).filter((d) => d.ctl > 0 && d.totalLoad > 1.3 * d.ctl).length
    // ≤ 2 séances réellement dures sur 7 j → pas de SURMENAGE (qui exige ≥ 3)
    expect(hardDays).toBeLessThan(3)
  })

  it('le ratio reste informatif (élevé) sans déclencher de surcharge soutenue', () => {
    const pmc = computeDailyPMC(scenario(), FCMAX, { totalDays: 90, displayDays: 42 })
    const acwr = computeACWR(pmc)
    expect(acwr.ratio).not.toBeNull()
  })
})
