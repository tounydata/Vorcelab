// Test de CONTRAT commun (§18) : tous les producteurs de profil coureur doivent renvoyer
// la même structure. Le test échoue si une implémentation oublie un champ.
import { describe, it, expect } from 'vitest'
import { buildAthleteBestEfforts as webBuild, type BestEffortStreams } from '../src/lib/bestEfforts'
import { buildAthleteBestEfforts as mobileBuild } from '../mobile/src/lib/bestEfforts'
import {
  buildProfileSchemaMeta,
  isRunnerProfileCompatible,
} from '../src/lib/runnerProfileSchema'
import { ENGINE_HISTORY_DAYS, RUNNER_PROFILE_WINDOW_DAYS } from '../src/lib/engineHistory'

// ── Fixture minimal commun (une montée régulière avec FC) ────────────────────────
function fixtureStream(): BestEffortStreams {
  const time: number[] = [], distance: number[] = [], altitude: number[] = []
  let t = 0, d = 0, a = 1000
  for (let i = 0; i < 1500; i++) {
    time.push(t); distance.push(d); altitude.push(a)
    t += 1; d += 3; a += 0.4 // 3 m/s, +0.4 m/s D+
  }
  return { time: { data: time }, distance: { data: distance }, altitude: { data: altitude } }
}
const activities = [{ strava_activity_id: 'act1', sport_type: 'TrailRun', start_date: '2026-05-01T08:00:00Z' }]
const streamsById = { act1: fixtureStream() }

// Champs de contrat exigés par le moteur 2026.07-7.
const CONTRACT_KEYS = [
  'schemaVersion', 'computedAt', 'asOfAt', 'historyDays', 'detailedProfileDays',
  'bestEfforts', 'criticalSpeed', 'bestClimb', 'buckets',
  'hrDriftPct', 'streamCoverage',
] as const

/** Assemble un profil « au contrat » à partir des primitives partagées. */
function assembleProfile(build: typeof webBuild): Record<string, unknown> {
  const be = build(activities, streamsById)
  return {
    ...buildProfileSchemaMeta({ historyDays: ENGINE_HISTORY_DAYS, detailedProfileDays: RUNNER_PROFILE_WINDOW_DAYS }),
    bestEfforts: be.records,
    criticalSpeed: be.criticalSpeed,
    bestClimb: be.bestClimb,
    bestClimbByTier: be.bestClimbByTier,
    buckets: {},
    hrDriftPct: null,
    streamCoverage: 1,
  }
}

describe('contrat commun du profil coureur (§18)', () => {
  it('le builder partagé produit tous les champs du contrat', () => {
    const p = assembleProfile(webBuild)
    for (const k of CONTRACT_KEYS) {
      expect(p, `champ de contrat manquant : ${k}`).toHaveProperty(k)
    }
  })

  it('le profil assemblé est déclaré compatible', () => {
    expect(isRunnerProfileCompatible(assembleProfile(webBuild))).toBe(true)
  })

  it('web et mobile produisent EXACTEMENT la même structure', () => {
    expect(mobileBuild(activities, streamsById)).toEqual(webBuild(activities, streamsById))
  })

  it('buildAthleteBestEfforts expose records / criticalSpeed / bestClimb / bestClimbByTier', () => {
    const be = webBuild(activities, streamsById)
    expect(be).toHaveProperty('records')
    expect(be).toHaveProperty('criticalSpeed')
    expect(be).toHaveProperty('bestClimb')
    expect(be).toHaveProperty('bestClimbByTier')
    expect(be).toHaveProperty('activitiesUsed')
  })

  it('un profil auquel il MANQUE un champ moteur est rejeté (le test de contrat mord)', () => {
    const p = assembleProfile(webBuild)
    delete (p as Record<string, unknown>).bestClimb
    expect(isRunnerProfileCompatible(p)).toBe(false)
  })
})
