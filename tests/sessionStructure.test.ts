import { describe, it, expect } from 'vitest'
import { detectWorkoutStructure, classifySession } from '../src/lib/sessionQuality'

const FCMAX = 205

// Construit un flux FC (1 Hz) : warmup + N répétitions (effort/récup) + cooldown.
function intervalHr(reps: number, workS: number, restS: number, workHr: number, restHr: number): number[] {
  const hr: number[] = []
  for (let i = 0; i < 120; i++) hr.push(140)            // warmup
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < workS; i++) hr.push(workHr + (i % 3))   // effort (léger bruit)
    for (let i = 0; i < restS; i++) hr.push(restHr - (i % 3))   // récup
  }
  for (let i = 0; i < 90; i++) hr.push(135)             // cooldown
  return hr
}

describe('detectWorkoutStructure', () => {
  it('détecte un fractionné (6 × effort/récup) que la FC moyenne masque', () => {
    const hr = intervalHr(6, 60, 60, 180, 130)
    const s = detectWorkoutStructure(hr, FCMAX)!
    expect(s.isInterval).toBe(true)
    expect(s.reps).toBeGreaterThanOrEqual(5)
    expect(s.workAvgHrPct!).toBeGreaterThan(0.82)
    expect(s.restAvgHrPct!).toBeLessThan(0.72)
    // La FC MOYENNE de cette séance est ~modérée → l'ancien classifieur disait « endurance ».
    const avg = hr.reduce((a, b) => a + b, 0) / hr.length
    expect(avg / FCMAX).toBeLessThan(0.78)
    expect(classifySession({ moving_time: hr.length, average_heartrate: avg }, FCMAX, s)).toMatch(/fractionn/)
  })

  it('ne déclenche PAS sur une séance d\'endurance régulière', () => {
    const hr: number[] = []
    for (let i = 0; i < 1800; i++) hr.push(150 + (i % 4)) // ~73% FCmax, quasi plat
    const s = detectWorkoutStructure(hr, FCMAX)!
    expect(s.isInterval).toBe(false)
    expect(classifySession({ moving_time: 1800, average_heartrate: 151 }, FCMAX, s)).not.toMatch(/fractionn/)
  })

  it('marque « en côte » quand les efforts gagnent de l\'altitude', () => {
    const hr = intervalHr(5, 60, 60, 182, 128)
    // Altitude : monte de 20 m pendant chaque effort, redescend en récup.
    const alt: number[] = []
    let a = 500
    for (let i = 0; i < 120; i++) alt.push(a)
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 60; i++) { a += 20 / 60; alt.push(a) }
      for (let i = 0; i < 60; i++) { a -= 20 / 60; alt.push(a) }
    }
    for (let i = 0; i < 90; i++) alt.push(a)
    const s = detectWorkoutStructure(hr, FCMAX, { altitude: alt })!
    expect(s.isInterval).toBe(true)
    expect(s.hill).toBe(true)
    expect(s.label).toMatch(/côte/)
  })

  it('renvoie null si données insuffisantes', () => {
    expect(detectWorkoutStructure([150, 152, 149], FCMAX)).toBeNull()
    expect(detectWorkoutStructure(intervalHr(6, 60, 60, 180, 130), 0)).toBeNull()
  })
})
