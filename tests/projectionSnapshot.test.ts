import { describe, it, expect } from 'vitest'
import {
  buildProjectionSnapshot,
  computeInputFingerprint,
  computeSnapshotFingerprint,
  normalizeManifest,
  canonicalStringify,
  snapshotToDbRow,
  isSnapshotLockedAt,
  sha256Hex,
  type BuildSnapshotInput,
  type FingerprintInput,
  type ActivityManifestEntry,
} from '../src/lib/projectionSnapshot'
import {
  buildProjectionSnapshot as mobileBuild,
  computeInputFingerprint as mobileFingerprint,
} from '../mobile/src/lib/projectionSnapshot'

const fpInput: FingerprintInput = {
  engineVersion: '2026.07-7',
  profileVersion: 'atDate-2026.07-2',
  profileSchemaVersion: 'runner-profile-2026.07-2',
  raceDistanceM: 42195,
  raceDplusM: 2500,
  historyStartAt: '2026-01-01T00:00:00.000Z',
  historyEndAt: '2026-07-01T00:00:00.000Z',
  activityCount: 120,
  usedPersonalFade: true,
  usedSteepnessCalibration: false,
  usedFallback: false,
  fallbackSources: [],
  predictionCentralS: 14400,
}

const buildInput: BuildSnapshotInput = {
  id: 'snap-1',
  userId: 'user-1',
  raceId: 'race-1',
  raceStartAt: '2026-08-01T06:00:00.000Z',
  engineVersion: '2026.07-7',
  profileVersion: 'atDate-2026.07-2',
  profileSchemaVersion: 'runner-profile-2026.07-2',
  predictionCentralS: 14400,
  predictionPrudentS: 15200,
  predictionAggressiveS: 13800,
  raceDistanceM: 42195,
  raceDplusM: 2500,
  historyStartAt: '2026-01-01T00:00:00.000Z',
  historyEndAt: '2026-07-01T00:00:00.000Z',
  activityCount: 120,
  usedPersonalFade: true,
  usedSteepnessCalibration: false,
  usedFallback: false,
  fallbackSources: [],
  createdAt: '2026-07-15T10:00:00.000Z',
}

describe('SHA-256 pur', () => {
  it('vecteurs de test connus (FIPS 180-4)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('empreinte déterministe (§14)', () => {
  it('mêmes entrées → même empreinte (déterminisme)', () => {
    expect(computeInputFingerprint(fpInput)).toBe(computeInputFingerprint({ ...fpInput }))
  })

  it('l’ordre des clés n’affecte pas l’empreinte (sérialisation canonique)', () => {
    const a = canonicalStringify({ b: 1, a: 2, c: [3, { y: 1, x: 2 }] })
    const b = canonicalStringify({ c: [3, { x: 2, y: 1 }], a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('une entrée différente change l’empreinte (preuve anti-recalcul)', () => {
    const base = computeInputFingerprint(fpInput)
    expect(computeInputFingerprint({ ...fpInput, activityCount: 121 })).not.toBe(base)
    expect(computeInputFingerprint({ ...fpInput, predictionCentralS: 14401 })).not.toBe(base)
    expect(computeInputFingerprint({ ...fpInput, historyEndAt: '2026-07-02T00:00:00.000Z' })).not.toBe(base)
  })

  it('l’ordre des fallbackSources n’affecte pas l’empreinte', () => {
    const a = computeInputFingerprint({ ...fpInput, fallbackSources: ['x', 'y'] })
    const b = computeInputFingerprint({ ...fpInput, fallbackSources: ['y', 'x'] })
    expect(a).toBe(b)
  })
})

describe('buildProjectionSnapshot (§14)', () => {
  it('produit un snapshot verrouillé avec empreinte SHA-256 et sans GPS', () => {
    const s = buildProjectionSnapshot(buildInput)
    expect(s.status).toBe('locked')
    expect(s.inputFingerprint).toMatch(/^[0-9a-f]{64}$/)
    // Aucune clé de type GPS/points/latlng dans le snapshot.
    const keys = Object.keys(s).join(',').toLowerCase()
    expect(keys).not.toMatch(/gps|latlng|points|coord|geojson/)
  })

  it('contient les versions moteur/profil/schéma exigées', () => {
    const s = buildProjectionSnapshot(buildInput)
    expect(s.engineVersion).toBe('2026.07-7')
    expect(s.profileVersion).toBe('atDate-2026.07-2')
    expect(s.profileSchemaVersion).toBe('runner-profile-2026.07-2')
  })

  it('mappe vers des colonnes snake_case cohérentes avec la table', () => {
    const row = snapshotToDbRow(buildProjectionSnapshot(buildInput))
    for (const col of [
      'user_id', 'race_id', 'race_start_at', 'engine_version', 'profile_version',
      'profile_schema_version', 'prediction_central_s', 'prediction_prudent_s',
      'prediction_aggressive_s', 'history_start_at', 'history_end_at', 'activity_count',
      'used_personal_fade', 'used_steepness_calibration', 'used_fallback',
      'fallback_sources', 'input_fingerprint', 'status',
    ]) {
      expect(row).toHaveProperty(col)
    }
    // Pas de colonne inattendue de type GPS.
    expect(Object.keys(row).join(',')).not.toMatch(/gps|latlng|points/)
  })

  it('isSnapshotLockedAt : verrouillé une fois la course commencée', () => {
    const s = buildProjectionSnapshot(buildInput)
    const start = Date.parse('2026-08-01T06:00:00.000Z')
    expect(isSnapshotLockedAt(s, start - 1000)).toBe(false)
    expect(isSnapshotLockedAt(s, start + 1000)).toBe(true)
  })

  it('parité web/mobile (empreinte + snapshot)', () => {
    expect(mobileFingerprint(fpInput)).toBe(computeInputFingerprint(fpInput))
    expect(mobileBuild(buildInput)).toEqual(buildProjectionSnapshot(buildInput))
  })

  // ── Manifeste complet (§4) ──────────────────────────────────────────────────────
  const manifest: ActivityManifestEntry[] = [
    { activityId: 2, startDate: '2026-05-02T07:00:00Z', movingTimeS: 3600.4, distanceM: 10000.7, dplusM: 120.9 },
    { activityId: 1, startDate: '2026-05-01T07:00:00Z', movingTimeS: 1800, distanceM: 5000, dplusM: 50 },
  ]
  const fp2 = (m: ActivityManifestEntry[]) =>
    computeSnapshotFingerprint({
      engineVersion: '2026.07-7', profileVersion: 'p', profileSchemaVersion: 's',
      raceDistanceM: 21097, raceDplusM: 400, historyStartAt: 'a', historyEndAt: 'b',
      predictionCentralS: 6000, usedPersonalFade: false, usedSteepnessCalibration: false,
      usedFallback: false, fallbackSources: [], manifest: m,
    })

  it('normalizeManifest : arrondit et trie par activityId (déterministe)', () => {
    const n = normalizeManifest(manifest)
    expect(n.map((e) => e.activityId)).toEqual([1, 2])
    expect(n[1]).toEqual({ activityId: 2, startDate: '2026-05-02T07:00:00Z', movingTimeS: 3600, distanceM: 10001, dplusM: 121 })
  })

  it('computeSnapshotFingerprint : indépendant de l’ordre du manifeste', () => {
    expect(fp2([...manifest].reverse())).toBe(fp2(manifest))
  })

  it('computeSnapshotFingerprint : change si une entrée change', () => {
    const altered = [{ ...manifest[0], distanceM: 9999 }, manifest[1]]
    expect(fp2(altered)).not.toBe(fp2(manifest))
  })
})
