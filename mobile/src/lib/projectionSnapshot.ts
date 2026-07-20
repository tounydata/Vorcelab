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

// ── SHA-256 pur (dépendance-free, isomorphe web / mobile RN / Deno) ─────────────────
// Empreinte CRYPTOGRAPHIQUE (256 bits) : résistante aux collisions, contrairement à un hash
// non cryptographique. Implémentation standard FIPS 180-4, opérant sur une chaîne UTF-8.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function utf8Bytes(str: string): number[] {
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = str.charCodeAt(++i)
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff)
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return bytes
}

/** SHA-256 d'une chaîne → hex (64 caractères). Pur, isomorphe. */
export function sha256Hex(str: string): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const bytes = utf8Bytes(str)
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / 2 ** (8 * i)) & 0xff)

  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3]
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  let out = ''
  for (let i = 0; i < 8; i++) out += (h[i] >>> 0).toString(16).padStart(8, '0')
  return out
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
  return sha256Hex(canonicalStringify(norm))
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
