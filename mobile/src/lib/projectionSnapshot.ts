// Snapshots PROSPECTIFS de projection (§14) — cœur PUR (aucune IO).
//
// Quand une projection est générée pour une course FUTURE, on peut en figer un instantané
// immuable : versions du moteur/profil, prédiction (central/prudent/agressif), fenêtre
// d'historique, drapeaux d'explicabilité, et une EMPREINTE DÉTERMINISTE des entrées. Cette
// empreinte permet de prouver a posteriori que la projection n'a pas été recalculée après la
// course (mêmes entrées → même empreinte). AUCUNE donnée GPS brute n'est stockée.
//
// La persistance (insert/lock, ajout du résultat réel) passe par le client Supabase de
// l'utilisateur → RLS `user_id = auth.uid()` + trigger d'immuabilité (cf. migration
// 20260719000000_projection_validation_snapshots.sql). Ici : uniquement la logique pure.

export type ProjectionSnapshotStatus = 'locked' | 'evaluated' | 'invalidated'

export interface ProjectionValidationSnapshot {
  id: string
  userId: string
  raceId: string
  createdAt: string
  raceStartAt: string
  engineVersion: string
  profileVersion: string
  profileSchemaVersion: string
  predictionCentralS: number
  predictionPrudentS: number
  predictionAggressiveS: number
  historyStartAt: string
  historyEndAt: string
  activityCount: number
  usedPersonalFade: boolean
  usedSteepnessCalibration: boolean
  usedFallback: boolean
  fallbackSources: string[]
  inputFingerprint: string
  status: ProjectionSnapshotStatus
}

/**
 * Sérialisation CANONIQUE : clés triées récursivement → même objet ⇒ même chaîne, quel que
 * soit l'ordre d'insertion. Indispensable pour une empreinte déterministe.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`
}

/** Hash déterministe cyrb53 (dépendance-free, stable web/mobile) → hex 64 bits. */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hi = (h2 >>> 0).toString(16).padStart(8, '0')
  const lo = (h1 >>> 0).toString(16).padStart(8, '0')
  return hi + lo
}

/** Entrées PERTINENTES d'une projection (jamais de GPS brut : uniquement des agrégats). */
export interface FingerprintInput {
  engineVersion: string
  profileVersion: string
  profileSchemaVersion: string
  /** Distance totale de la course (m). */
  raceDistanceM: number
  /** Dénivelé positif total (m). */
  raceDplusM: number
  /** Fenêtre d'historique. */
  historyStartAt: string
  historyEndAt: string
  activityCount: number
  usedPersonalFade: boolean
  usedSteepnessCalibration: boolean
  usedFallback: boolean
  fallbackSources: string[]
  /** Prédiction produite (fait partie de la preuve). */
  predictionCentralS: number
}

/**
 * Empreinte déterministe des entrées d'une projection. Deux appels aux MÊMES entrées
 * produisent la MÊME empreinte ; toute modification (fenêtre, activités, prédiction…) la
 * change → preuve qu'aucun recalcul n'a eu lieu après la course.
 */
export function computeInputFingerprint(input: FingerprintInput): string {
  // Arrondis stables (évite qu'un bruit flottant change l'empreinte).
  const norm = {
    ...input,
    raceDistanceM: Math.round(input.raceDistanceM),
    raceDplusM: Math.round(input.raceDplusM),
    predictionCentralS: Math.round(input.predictionCentralS),
    fallbackSources: [...input.fallbackSources].sort(),
  }
  return cyrb53(canonicalStringify(norm))
}

export interface BuildSnapshotInput {
  id: string
  userId: string
  raceId: string
  raceStartAt: string
  engineVersion: string
  profileVersion: string
  profileSchemaVersion: string
  predictionCentralS: number
  predictionPrudentS: number
  predictionAggressiveS: number
  raceDistanceM: number
  raceDplusM: number
  historyStartAt: string
  historyEndAt: string
  activityCount: number
  usedPersonalFade: boolean
  usedSteepnessCalibration: boolean
  usedFallback: boolean
  fallbackSources: string[]
  createdAt?: string
}

/**
 * Assemble un snapshot `locked` à partir d'une projection + métadonnées. Calcule l'empreinte
 * déterministe. 100 % pur — la persistance (RLS + immuabilité) est faite ailleurs.
 */
export function buildProjectionSnapshot(input: BuildSnapshotInput): ProjectionValidationSnapshot {
  const inputFingerprint = computeInputFingerprint({
    engineVersion: input.engineVersion,
    profileVersion: input.profileVersion,
    profileSchemaVersion: input.profileSchemaVersion,
    raceDistanceM: input.raceDistanceM,
    raceDplusM: input.raceDplusM,
    historyStartAt: input.historyStartAt,
    historyEndAt: input.historyEndAt,
    activityCount: input.activityCount,
    usedPersonalFade: input.usedPersonalFade,
    usedSteepnessCalibration: input.usedSteepnessCalibration,
    usedFallback: input.usedFallback,
    fallbackSources: input.fallbackSources,
    predictionCentralS: input.predictionCentralS,
  })
  return {
    id: input.id,
    userId: input.userId,
    raceId: input.raceId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    raceStartAt: input.raceStartAt,
    engineVersion: input.engineVersion,
    profileVersion: input.profileVersion,
    profileSchemaVersion: input.profileSchemaVersion,
    predictionCentralS: Math.round(input.predictionCentralS),
    predictionPrudentS: Math.round(input.predictionPrudentS),
    predictionAggressiveS: Math.round(input.predictionAggressiveS),
    historyStartAt: input.historyStartAt,
    historyEndAt: input.historyEndAt,
    activityCount: input.activityCount,
    usedPersonalFade: input.usedPersonalFade,
    usedSteepnessCalibration: input.usedSteepnessCalibration,
    usedFallback: input.usedFallback,
    fallbackSources: [...input.fallbackSources].sort(),
    inputFingerprint,
    status: 'locked',
  }
}

/** Mappe le snapshot (camelCase) vers une ligne DB (snake_case) prête à insérer. */
export function snapshotToDbRow(s: ProjectionValidationSnapshot): Record<string, unknown> {
  return {
    id: s.id,
    user_id: s.userId,
    race_id: s.raceId,
    created_at: s.createdAt,
    race_start_at: s.raceStartAt,
    engine_version: s.engineVersion,
    profile_version: s.profileVersion,
    profile_schema_version: s.profileSchemaVersion,
    prediction_central_s: s.predictionCentralS,
    prediction_prudent_s: s.predictionPrudentS,
    prediction_aggressive_s: s.predictionAggressiveS,
    history_start_at: s.historyStartAt,
    history_end_at: s.historyEndAt,
    activity_count: s.activityCount,
    used_personal_fade: s.usedPersonalFade,
    used_steepness_calibration: s.usedSteepnessCalibration,
    used_fallback: s.usedFallback,
    fallback_sources: s.fallbackSources,
    input_fingerprint: s.inputFingerprint,
    status: s.status,
  }
}

/** Vrai si la course a commencé (le snapshot ne doit alors plus être modifiable, hors résultat). */
export function isSnapshotLockedAt(snapshot: Pick<ProjectionValidationSnapshot, 'raceStartAt'>, nowMs: number): boolean {
  return nowMs >= Date.parse(snapshot.raceStartAt)
}
