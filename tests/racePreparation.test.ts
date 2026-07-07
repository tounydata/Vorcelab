import { describe, it, expect } from 'vitest'
import { assessRacePreparation } from '../src/lib/racePreparation'
import type { ActivityForLoad } from '../src/lib/trainingLoad'

// Course de référence : 1er juin 2026.
const RACE = '2026-06-01T08:00:00Z'
const raceMs = new Date(RACE).getTime()
const D = 86_400_000

function run(ageDaysBeforeRace: number, movingS: number, hr = 150, distM = 12000, dplus = 300): ActivityForLoad {
  return {
    type: 'Run', sport_type: 'Run',
    moving_time: movingS, average_heartrate: hr,
    distance: distM, total_elevation_gain: dplus,
    start_date: new Date(raceMs - ageDaysBeforeRace * D).toISOString(),
  }
}

// Base « habituelle » solide : 3 courses/sem d'1h sur la fenêtre 42–182 j avant.
function baseHistory(): ActivityForLoad[] {
  const out: ActivityForLoad[] = []
  for (let day = 43; day <= 180; day += 3) out.push(run(day, 3600))
  return out
}

describe('assessRacePreparation', () => {
  it('détecte une préparation LÉGÈRE (mois creux avant la course)', () => {
    // 6 semaines avant : quasi rien (1 petite sortie).
    const acts = [...baseHistory(), run(10, 1800)]
    const p = assessRacePreparation(acts, RACE)
    expect(p.status).toBe('undertrained')
    expect(p.loadRatioPct!).toBeLessThan(65)
    expect(p.weeksLow).toBe(true)
  })

  it('reconnaît une préparation NORMALE (charge maintenue)', () => {
    // 6 semaines avant : même rythme que la base.
    const pre: ActivityForLoad[] = []
    for (let day = 2; day <= 40; day += 3) pre.push(run(day, 3600))
    const p = assessRacePreparation([...baseHistory(), ...pre], RACE)
    expect(p.status).toBe('ready')
    expect(p.loadRatioPct!).toBeGreaterThan(75)
  })

  it('ne juge pas sans base suffisante (peu d\'historique)', () => {
    const p = assessRacePreparation([run(5, 3600), run(12, 3600)], RACE)
    expect(p.status).toBe('unknown')
    expect(p.loadRatioPct).toBeNull()
  })

  it('n\'inclut que les activités AVANT la course', () => {
    // Une grosse séance APRÈS la course ne doit pas compter.
    const acts = [...baseHistory(), run(-3, 7200)] // 3 j après la course
    const p = assessRacePreparation(acts, RACE)
    expect(p.status).toBe('undertrained') // le pré-course reste vide
    expect(p.runCount42).toBe(0)
  })
})
