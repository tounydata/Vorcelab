import { describe, it, expect } from 'vitest'
import {
  RUNNER_PROFILE_SCHEMA_VERSION,
  isRunnerProfileCompatible,
  buildProfileSchemaMeta,
} from '../src/lib/runnerProfileSchema'
import {
  RUNNER_PROFILE_SCHEMA_VERSION as MOBILE_VERSION,
  isRunnerProfileCompatible as mobileCompatible,
} from '../mobile/src/lib/runnerProfileSchema'

function currentProfile(): Record<string, unknown> {
  return {
    ...buildProfileSchemaMeta({ historyDays: 183, detailedProfileDays: 56 }),
    bestEfforts: [],
    criticalSpeed: null,
    bestClimb: null,
    buckets: {},
  }
}

describe('runner profile schema — compatibilité (§2)', () => {
  it('la version de schéma est celle attendue', () => {
    expect(RUNNER_PROFILE_SCHEMA_VERSION).toBe('runner-profile-2026.07-2')
    expect(MOBILE_VERSION).toBe(RUNNER_PROFILE_SCHEMA_VERSION)
  })

  it('un profil au schéma courant complet est compatible', () => {
    expect(isRunnerProfileCompatible(currentProfile())).toBe(true)
  })

  it('un profil absent est incompatible (→ fallback + recalcul)', () => {
    expect(isRunnerProfileCompatible(null)).toBe(false)
    expect(isRunnerProfileCompatible(undefined)).toBe(false)
  })

  it('un ancien profil sans schemaVersion est incompatible', () => {
    const old = { buckets: {}, _computedAt: '2026-01-01T00:00:00Z', hrDriftPct: 3 }
    expect(isRunnerProfileCompatible(old)).toBe(false)
  })

  it('un profil à une version antérieure est incompatible', () => {
    const p = { ...currentProfile(), schemaVersion: 'runner-profile-2026.07-1' }
    expect(isRunnerProfileCompatible(p)).toBe(false)
  })

  it('un profil partiel (Edge Function ancienne, sans bestEfforts) est incompatible', () => {
    const p = currentProfile()
    delete p.bestEfforts
    expect(isRunnerProfileCompatible(p)).toBe(false)
  })

  it('criticalSpeed/bestClimb null restent compatibles (présence de la clé)', () => {
    const p = { ...currentProfile(), criticalSpeed: null, bestClimb: null }
    expect(isRunnerProfileCompatible(p)).toBe(true)
  })

  it('un champ de provenance manquant (historyDays) rend le profil incompatible', () => {
    const p = currentProfile()
    delete p.historyDays
    expect(isRunnerProfileCompatible(p)).toBe(false)
  })

  it('parité web/mobile de la compatibilité', () => {
    const p = currentProfile()
    expect(mobileCompatible(p)).toBe(isRunnerProfileCompatible(p))
    expect(mobileCompatible(null)).toBe(isRunnerProfileCompatible(null))
  })

  it('buildProfileSchemaMeta expose la version et les deux fenêtres', () => {
    const meta = buildProfileSchemaMeta({ computedAtMs: 0, asOfMs: 0, historyDays: 183, detailedProfileDays: 56 })
    expect(meta.schemaVersion).toBe(RUNNER_PROFILE_SCHEMA_VERSION)
    expect(meta.historyDays).toBe(183)
    expect(meta.detailedProfileDays).toBe(56)
    expect(meta.computedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(meta.asOfAt).toBe('1970-01-01T00:00:00.000Z')
  })
})
