import { describe, it, expect } from 'vitest'
import { generateCrewPlan } from '../src/utils/crewPlan'
import { getAthleteLabel } from '../src/utils/athleteLabel'
import type { AnalyzeResult } from '../src/utils/gpxAnalyze'
import type { Section, GpxSample } from '../src/utils/gpxCore'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSection(type: 'up' | 'down' | 'flat', startKm: number, endKm: number, dplus: number, dminus: number): Section {
  const dist = (endKm - startKm) * 1000
  const netAlt = type === 'up' ? dplus : type === 'down' ? -dminus : 0
  return { type, startKm, endKm, dplus, dminus, dist, grade: dist > 0 ? (netAlt / dist) * 100 : 0 }
}

function makeResult(sections: Section[], estTimeS: number, rangeMin = 0.96, rangeMax = 1.08): AnalyzeResult {
  const sectionTimes = sections.map(s => (s.dist / 1000) * (estTimeS / sections.reduce((a, s) => a + s.dist, 0) * 1000))
  const totalDist = sections.reduce((a, s) => a + s.dist, 0)
  const samples: GpxSample[] = [{ d: 0, alt: 0 }, { d: totalDist / 1000, alt: 100 }]
  const cumDist = [0, totalDist]
  return {
    totalDist,
    dplus: sections.reduce((a, s) => a + s.dplus, 0),
    dminus: sections.reduce((a, s) => a + s.dminus, 0),
    altMin: 100, altMax: 600,
    samples, sections, sectionTimes,
    estTimeS,
    timeMin: estTimeS * rangeMin,
    timeMax: estTimeS * rangeMax,
    basePaceS: 360,
    projSource: '5 sorties trail · D+ pondéré',
    confidence: 'good',
    isTrail: true,
    cumDist,
  }
}

// ── getAthleteLabel ──────────────────────────────────────────────────────────

describe('getAthleteLabel', () => {
  it('retourne le nom du profil en priorité (mode private)', () => {
    expect(getAthleteLabel({ name: 'Anthony' }, { email: 'tony@example.com' })).toBe('Anthony')
  })

  it('retourne le nom du profil en priorité (mode public)', () => {
    expect(getAthleteLabel({ name: 'Anthony' }, null, { mode: 'public' })).toBe('Anthony')
  })

  it('mode private sans nom → retourne la partie locale de l\'email', () => {
    expect(getAthleteLabel({}, { email: 'tony.b@example.com' })).toBe('tony.b')
  })

  it('mode public sans nom → retourne "l\'athlète" (jamais l\'email)', () => {
    expect(getAthleteLabel({}, { email: 'tony@example.com' }, { mode: 'public' })).toBe("l'athlète")
  })

  it('mode private sans profil ni email → retourne "l\'athlète"', () => {
    expect(getAthleteLabel(null, null)).toBe("l'athlète")
  })

  it('mode public sans profil → retourne "l\'athlète"', () => {
    expect(getAthleteLabel(null, { email: 'tony@example.com' }, { mode: 'public' })).toBe("l'athlète")
  })

  it('nom vide après trim → fallback email local (mode private)', () => {
    expect(getAthleteLabel({ name: '   ' }, { email: 'tony@example.com' })).toBe('tony')
  })

  it('athleteName=Anthony → retourne "Anthony"', () => {
    expect(getAthleteLabel({ name: 'Anthony' }, { email: 'x@y.com' })).toBe('Anthony')
  })
})

// ── generateCrewPlan ─────────────────────────────────────────────────────────

describe('generateCrewPlan', () => {
  const shortRace = {
    race: { name: 'Trail Court', date: '2026-06-15' },
    athleteName: 'Anthony',
    raceStartHour: 9,
  }

  it('course courte (< 1h30) → pas de nutrition, des checkpoints', () => {
    const sections = [
      makeSection('up', 0, 3, 200, 0),
      makeSection('down', 3, 6, 0, 200),
    ]
    const result = makeResult(sections, 3600) // 1h exactement
    const plan = generateCrewPlan({ result, ...shortRace })
    expect(plan.checkpoints.length).toBeGreaterThan(0)
    // sous 1h30, pas de nutrition
    expect(plan.checkpoints.every(cp => cp.nutrDonner === '—')).toBe(true)
  })

  it('longue course >2h → checkpoints avec nutrition non vide', () => {
    const sections = [
      makeSection('up', 0, 5, 400, 0),
      makeSection('flat', 5, 12, 50, 50),
      makeSection('down', 12, 16, 0, 350),
      makeSection('up', 16, 20, 300, 0),
    ]
    const result = makeResult(sections, 10800) // 3h
    const plan = generateCrewPlan({ result, ...shortRace, raceStartHour: 8 })
    expect(plan.checkpoints.length).toBeGreaterThan(0)
    const hasNutr = plan.checkpoints.some(cp => cp.nutrDonner !== '—')
    expect(hasNutr).toBe(true)
  })

  it('heures agg / cible / prudent sont dans le bon ordre', () => {
    const sections = [
      makeSection('up', 0, 8, 600, 0),
      makeSection('down', 8, 14, 0, 580),
      makeSection('flat', 14, 20, 20, 20),
    ]
    const result = makeResult(sections, 14400, 0.95, 1.15) // 4h, large range
    const plan = generateCrewPlan({ result, ...shortRace, raceStartHour: 8 })
    for (const cp of plan.checkpoints) {
      // agg = fastest → smallest time → parse and compare
      const toMins = (hhmm: string) => {
        const [h, m] = hhmm.replace('h', ':').split(':').map(Number)
        return h * 60 + m
      }
      expect(toMins(cp.timeAggH)).toBeLessThanOrEqual(toMins(cp.timeCibleH))
      expect(toMins(cp.timeCibleH)).toBeLessThanOrEqual(toMins(cp.timePrudentH))
    }
  })

  it('checkpoint avant grande montée → isHighlight=true', () => {
    const sections = [
      makeSection('flat', 0, 5, 10, 10),
      makeSection('up', 5, 10, 300, 0), // grosse montée
    ]
    const result = makeResult(sections, 7200)
    const plan = generateCrewPlan({ result, ...shortRace })
    // Le checkpoint à la fin de la montée doit être highlight
    const highlightCps = plan.checkpoints.filter(cp => cp.isHighlight)
    expect(highlightCps.length).toBeGreaterThan(0)
  })

  it('nutrition cumulative cohérente : alreadyTaken vide au premier checkpoint', () => {
    const sections = [
      makeSection('up', 0, 6, 400, 0),
      makeSection('flat', 6, 12, 10, 10),
      makeSection('down', 12, 18, 0, 390),
    ]
    const result = makeResult(sections, 10800) // 3h → nutrition activée
    const plan = generateCrewPlan({ result, ...shortRace })
    if (plan.checkpoints.length > 0) {
      // Premier checkpoint : rien pris avant
      expect(plan.checkpoints[0].alreadyTaken).toBe('—')
    }
  })

  it('max 6 checkpoints même avec 12 sections', () => {
    const sections: Section[] = Array.from({ length: 12 }, (_, i) => ({
      type: i % 3 === 0 ? 'up' : i % 3 === 1 ? 'down' : 'flat',
      startKm: i * 4,
      endKm: (i + 1) * 4,
      dplus: i % 3 === 0 ? 150 : 10,
      dminus: i % 3 === 1 ? 140 : 10,
      dist: 4000,
      grade: i % 3 === 0 ? 3.75 : i % 3 === 1 ? -3.5 : 0,
    } as Section))
    const result = makeResult(sections, 18000)
    const plan = generateCrewPlan({ result, ...shortRace })
    expect(plan.checkpoints.length).toBeLessThanOrEqual(6)
  })

  it('pas de sections → retourne plan vide', () => {
    const result = makeResult([], 0)
    const plan = generateCrewPlan({ result, ...shortRace })
    expect(plan.checkpoints).toHaveLength(0)
  })

  it('heures formatées en HHhMM', () => {
    const sections = [makeSection('flat', 0, 10, 0, 0)]
    const result = makeResult(sections, 5400) // 1h30
    const plan = generateCrewPlan({ result, ...shortRace, raceStartHour: 8 })
    for (const cp of plan.checkpoints) {
      expect(cp.timeCibleH).toMatch(/^\d+h\d{2}$/)
      expect(cp.timeAggH).toMatch(/^\d+h\d{2}$/)
      expect(cp.timePrudentH).toMatch(/^\d+h\d{2}$/)
    }
  })

  it('athleteName propagé dans le plan', () => {
    const sections = [makeSection('up', 0, 5, 200, 0)]
    const result = makeResult(sections, 3600)
    const plan = generateCrewPlan({ result, ...shortRace, athleteName: 'Camille' })
    expect(plan.athleteName).toBe('Camille')
  })

  it("athleteName par défaut → fallback getAthleteLabel", () => {
    // Test that getAthleteLabel returns "l'athlète" when no profile/user
    const label = getAthleteLabel(null, null)
    expect(label).toBe("l'athlète")
  })
})
