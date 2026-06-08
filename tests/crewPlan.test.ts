import { describe, it, expect } from 'vitest'
import { generateCrewPlan } from '../src/lib/crewPlan'
import type { ProjectionResult } from '../src/lib/computeRaceProjection'
import type { NutritionRow } from '../src/lib/nutritionPlan'

function makeProjection(totalKm: number, dplus = 500): ProjectionResult {
  const sections = []
  const sectionTimes = []
  const segSize = 5
  const n = Math.ceil(totalKm / segSize)
  for (let i = 0; i < n; i++) {
    const startKm = i * segSize
    const dist = Math.min(segSize, totalKm - startKm) * 1000
    const grade = i % 2 === 0 ? 8 : -6
    sections.push({
      type: (grade > 0 ? 'up' : 'down') as 'up' | 'down' | 'flat',
      startKm,
      endKm: startKm + dist / 1000,
      dplus: grade > 0 ? dist * grade / 100 : 0,
      dminus: grade < 0 ? dist * Math.abs(grade) / 100 : 0,
      dist,
      grade,
    })
    sectionTimes.push((dist / 1000) * 600)
  }
  const totalDistM = totalKm * 1000
  const estTimeS = sectionTimes.reduce((a, b) => a + b, 0)
  const points = [
    { lat: 45.0, lon: 6.0, ele: 1000 },
    { lat: 45.1, lon: 6.1, ele: 1200 },
  ]
  return {
    points,
    samples: [],
    sections,
    sectionTimes,
    totalDistM,
    dplus,
    dminus: dplus * 0.8,
    altMin: 1000,
    altMax: 1000 + dplus,
    estTimeS,
    timeMin: estTimeS * 0.9,
    timeMax: estTimeS * 1.15,
    confidence: 'medium',
    basePaceS: 360,
    isTrail: true,
    personalAdjustments: [],
  }
}

const noNutrition: NutritionRow[] = []

const withNutrition: NutritionRow[] = [
  { moment: '~5 km', action: 'Gel sans caféine + eau', glucides: '25g', note: '' },
  { moment: '~15 km', action: 'Boisson isotonique', glucides: '20g', note: '' },
  { moment: '~25 km', action: 'Gel caféiné', glucides: '25g', note: '' },
]

describe('generateCrewPlan', () => {
  it('returns empty for very short race (<15km) with no ravitos', () => {
    const proj = makeProjection(12)
    const result = generateCrewPlan(proj, noNutrition, [])
    expect(result.length).toBe(0)
  })

  it('returns at least 2 checkpoints for a 42km race with no ravitos', () => {
    const proj = makeProjection(42)
    const result = generateCrewPlan(proj, noNutrition, [])
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('timeCible is between timeAgressif and timePrudent (order)', () => {
    const proj = makeProjection(42)
    const result = generateCrewPlan(proj, noNutrition, [])
    expect(result.length).toBeGreaterThan(0)
    for (const cp of result) {
      const toMinutes = (t: string) => {
        const hMatch = t.match(/(\d+)h(\d+)/)
        if (hMatch) return parseInt(hMatch[1]) * 60 + parseInt(hMatch[2])
        const mMatch = t.match(/(\d+)min/)
        if (mMatch) return parseInt(mMatch[1])
        return 0
      }
      const agg = toMinutes(cp.timeAgressif)
      const cib = toMinutes(cp.timeCible)
      const pru = toMinutes(cp.timePrudent)
      expect(agg).toBeLessThanOrEqual(cib)
      expect(cib).toBeLessThanOrEqual(pru)
    }
  })

  it('ravito checkpoints have kind=ravito, auto points have kind=estimated', () => {
    const proj = makeProjection(42)
    const ravitos = [{ km: 15, label: 'Ravito 1', source: 'manual' as const }]
    const result = generateCrewPlan(proj, noNutrition, ravitos)
    const ravitoCheckpoint = result.find(cp => cp.km === 15)
    expect(ravitoCheckpoint).toBeDefined()
    expect(ravitoCheckpoint?.kind).toBe('ravito')
    const autoCheckpoints = result.filter(cp => cp.km !== 15)
    for (const cp of autoCheckpoints) {
      expect(cp.kind).toBe('estimated')
    }
  })

  it('heure de départ → heures d\'arrivée (horloge) en fourchette agressif ≤ cible ≤ prudent', () => {
    const proj = makeProjection(42)
    const ravitos = [{ km: 15, label: 'Ravito 1', source: 'manual' as const }]
    const result = generateCrewPlan(proj, noNutrition, ravitos, '21:00')
    const cp = result.find((c) => c.km === 15)!
    expect(cp.clockCible).toMatch(/^\d{1,2}h\d{2}$/)
    const toMin = (s: string) => { const m = s.match(/(\d+)h(\d+)/)!; return +m[1] * 60 + +m[2] }
    expect(toMin(cp.clockAgressif!)).toBeLessThanOrEqual(toMin(cp.clockCible!))
    expect(toMin(cp.clockCible!)).toBeLessThanOrEqual(toMin(cp.clockPrudent!))
  })

  it('sans heure de départ → pas d\'heure d\'horloge', () => {
    const result = generateCrewPlan(makeProjection(42), noNutrition, [{ km: 15, label: 'R', source: 'manual' as const }])
    expect(result[0].clockCible).toBeUndefined()
  })

  it('vigilance is non-empty before a steep section (grade>12)', () => {
    const proj = makeProjection(42)
    // Make a steep section starting at km 20
    proj.sections.push({
      type: 'up',
      startKm: 20,
      endKm: 23,
      dplus: 450,
      dminus: 0,
      dist: 3000,
      grade: 15,
    })
    proj.sectionTimes.push(1800)
    const ravitos = [{ km: 16, label: 'Ravito avant montée', source: 'manual' as const }]
    const result = generateCrewPlan(proj, noNutrition, ravitos)
    const cpBefore = result.find(cp => cp.km === 16)
    expect(cpBefore).toBeDefined()
    expect(cpBefore?.vigilance).toMatch(/montée/)
  })

  it('nutrition consumed is consistent with row order', () => {
    const proj = makeProjection(42)
    const result = generateCrewPlan(proj, withNutrition, [])
    for (const cp of result) {
      const consumedCount = cp.nutritionConsumed === '—' ? 0 : cp.nutritionConsumed.split(',').length
      const expectedConsumed = withNutrition.filter(r => {
        const k = r.moment.match(/~?(\d+)\s*km/i)
        return k && parseInt(k[1], 10) <= cp.km
      }).length
      expect(consumedCount).toBe(expectedConsumed)
    }
  })

  it('checkpoints are sorted by km', () => {
    const proj = makeProjection(60)
    const ravitos = [
      { km: 30, label: 'Ravito mi-course', source: 'manual' as const },
      { km: 10, label: 'Ravito départ', source: 'manual' as const },
    ]
    const result = generateCrewPlan(proj, noNutrition, ravitos)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].km).toBeGreaterThan(result[i - 1].km)
    }
  })
})
