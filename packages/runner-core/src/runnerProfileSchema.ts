// Version de schéma du profil coureur + contrôle de compatibilité (§2).
//
// Une projection ne doit JAMAIS supposer qu'un ancien profil est compatible : le moteur
// 2026.07-7 lit `bestEfforts`, `criticalSpeed` et `bestClimb`, absents des profils produits
// par l'ancienne Edge Function. Lorsqu'un profil est absent ou incompatible, le moteur
// reste fonctionnel via ses fallbacks, mais la page doit proposer/déclencher un recalcul,
// et aucun ancien profil ne doit écraser silencieusement les nouveaux champs.
//
// 100 % pur (aucune IO) → testable et identique web / mobile / benchmark / Edge Function.

/**
 * Version du schéma du profil coureur. À incrémenter dès que la STRUCTURE du profil
 * stocké change (nouveau champ obligatoire, sémantique modifiée), indépendamment de la
 * version du MOTEUR de projection (`ENGINE_VERSION`).
 *
 *  runner-profile-2026.07-2 : le profil porte désormais explicitement sa provenance
 *  (`schemaVersion`, `computedAt`, `asOfAt`, `historyDays`, `detailedProfileDays`) et
 *  garantit la présence des records découplés (`bestEfforts`), de la vitesse critique
 *  (`criticalSpeed`) et de la meilleure ascension (`bestClimb`) exigés par le moteur.
 */
export const RUNNER_PROFILE_SCHEMA_VERSION = 'runner-profile-2026.07-2'

/** Champs de provenance que TOUT profil au schéma courant doit porter. */
export const REQUIRED_PROFILE_META_FIELDS = [
  'schemaVersion',
  'computedAt',
  'asOfAt',
  'historyDays',
  'detailedProfileDays',
] as const

/** Champs « moteur » que TOUT profil au schéma courant doit exposer (même si null/vide). */
export const REQUIRED_PROFILE_ENGINE_FIELDS = [
  'bestEfforts',
  'criticalSpeed',
  'bestClimb',
  'buckets',
] as const

/**
 * Vrai si `profile` est un profil coureur au SCHÉMA COURANT, exploitable sans risque par
 * le moteur 2026.07-7. Conservateur : un profil absent, sans `schemaVersion`, à une
 * version antérieure, ou dépourvu d'un champ obligatoire est déclaré INCOMPATIBLE (le
 * moteur bascule alors sur ses fallbacks et la page propose un recalcul).
 */
export function isRunnerProfileCompatible(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false
  const p = profile as Record<string, unknown>
  if (p.schemaVersion !== RUNNER_PROFILE_SCHEMA_VERSION) return false
  for (const f of REQUIRED_PROFILE_META_FIELDS) {
    if (p[f] === undefined || p[f] === null) return false
  }
  // Les champs moteur doivent être PRÉSENTS (une clé absente signale un profil partiel,
  // typiquement écrit par l'ancienne Edge Function) — mais `criticalSpeed`/`bestClimb`
  // peuvent légitimement valoir `null` (athlète sans donnée), donc on teste la présence
  // de la clé, pas la nullité.
  for (const f of REQUIRED_PROFILE_ENGINE_FIELDS) {
    if (!(f in p)) return false
  }
  return true
}

/**
 * Décide si le profil coureur doit être RECONSTRUIT automatiquement (recalcul silencieux
 * en tâche de fond, côté client). Vrai si : absent, INCOMPATIBLE (ancien schéma), périmé
 * (activité plus récente que le calcul), ou couverture de streams quasi nulle. Pur → même
 * décision web/mobile, testable. AUCUNE écriture de masse : chaque profil se répare seul à
 * la première visite de son propriétaire.
 */
export function shouldRebuildRunnerProfile(
  profile: unknown,
  opts: { latestActivityAt?: string | null; minStreamCoverage?: number } = {},
): boolean {
  const p = profile && typeof profile === 'object' ? (profile as Record<string, unknown>) : null
  const computedAt = typeof p?._computedAt === 'string' ? (p._computedAt as string) : null
  const streamCoverage = typeof p?.streamCoverage === 'number' ? (p.streamCoverage as number) : 0
  const minCov = opts.minStreamCoverage ?? 0.01
  if (!computedAt) return true
  if (!isRunnerProfileCompatible(profile)) return true
  if (opts.latestActivityAt && new Date(opts.latestActivityAt).getTime() > new Date(computedAt).getTime()) return true
  if (streamCoverage < minCov) return true
  return false
}

/**
 * Métadonnées de schéma à apposer sur tout profil fraîchement calculé. Centralisé ici
 * pour que web, mobile, benchmark et Edge Function produisent EXACTEMENT le même en-tête.
 */
export function buildProfileSchemaMeta(input: {
  computedAtMs?: number
  asOfMs?: number
  historyDays: number
  detailedProfileDays: number
}): {
  schemaVersion: string
  computedAt: string
  asOfAt: string
  historyDays: number
  detailedProfileDays: number
} {
  const computedAt = new Date(input.computedAtMs ?? Date.now()).toISOString()
  const asOfAt = new Date(input.asOfMs ?? input.computedAtMs ?? Date.now()).toISOString()
  return {
    schemaVersion: RUNNER_PROFILE_SCHEMA_VERSION,
    computedAt,
    asOfAt,
    historyDays: input.historyDays,
    detailedProfileDays: input.detailedProfileDays,
  }
}
