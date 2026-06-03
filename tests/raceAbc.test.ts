import { describe, it, expect } from 'vitest'
import { generateTrainingPlan } from '../src/lib/coach/planGenerator'

const base = {
  raceName: 'Cible A', raceDateISO: '2026-09-01', raceDistanceKm: 42, raceElevationM: 500,
  raceType: 'Route', todayISO: '2026-06-01', daysPerWeek: 5, currentCTL: 50,
}

describe('courses secondaires A/B/C', () => {
  it('une course C est intégrée comme séance (system race) dans sa semaine', () => {
    const plan = generateTrainingPlan({ ...base, secondaryRaces: [{ name: '10k local', dateISO: '2026-07-05', priority: 'C' }] })
    const wk = plan.weeks.find((w) => w.sessions.some((s) => s.workoutId === 'secondary_race'))
    expect(wk).toBeTruthy()
    expect(wk!.sessions.some((s) => s.system === 'race' && s.title.includes('10k local'))).toBe(true)
  })

  it('une course B réduit le volume de sa semaine (mini-affûtage)', () => {
    const noSec = generateTrainingPlan(base)
    const withB = generateTrainingPlan({ ...base, secondaryRaces: [{ name: 'Semi prépa', dateISO: '2026-07-05', priority: 'B' }] })
    const bw = withB.weeks.find((w) => w.sessions.some((s) => s.workoutId === 'secondary_race'))!
    const same = noSec.weeks.find((w) => w.weekStartISO === bw.weekStartISO)!
    expect(bw.volumeHours).toBeLessThan(same.volumeHours)
  })

  it('rationale mentionne la course secondaire', () => {
    const plan = generateTrainingPlan({ ...base, secondaryRaces: [{ name: '10k local', dateISO: '2026-07-05', priority: 'C' }] })
    expect(plan.rationale.some((r) => r.toLowerCase().includes('secondaire'))).toBe(true)
  })

  it('sans secondaryRaces → plan inchangé (rétro-compat)', () => {
    const a = generateTrainingPlan(base).weeks.reduce((s, w) => s + w.sessions.length, 0)
    const b = generateTrainingPlan({ ...base, secondaryRaces: [] }).weeks.reduce((s, w) => s + w.sessions.length, 0)
    expect(a).toBe(b)
  })
})
