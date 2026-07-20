// Validation des courses candidates au backtest (logique PURE, testable, sans IO).
//
// Objectif : ne JAMAIS confirmer aveuglément une activité comme « course » parce
// qu'elle porte `is_race = true` ou `raw_data.workout_type = 1`. Beaucoup d'activités
// étiquetées sont en réalité des échauffements, des décrassages, ou des efforts au
// temps « à confirmer ». Pour ce premier banc, les règles restent PRUDENTES : au
// moindre doute, on place en `pending` (pas confirmé automatiquement) plutôt que de
// polluer les métriques.
//
// Cette fonction ne lit ni n'écrit rien en base : le statut est calculé à la volée
// (aucune écriture en production). Les `reasons` sont des CODES stables (pas de texte
// nominatif, pas de coordonnées) — sûrs à écrire dans un rapport anonymisé.

export type RaceValidationStatus = 'confirmed' | 'pending' | 'rejected'

export interface RaceCandidateInput {
  /** Nom Strava de l'activité (peut contenir « Échauffement », « à confirmer »…). */
  name?: string | null
  sportType?: string | null
  type?: string | null
  /** Date de départ ISO. */
  startDate?: string | null
  distanceM?: number | null
  /** Temps réel principal (moving_time, s). */
  movingTimeS?: number | null
  elapsedTimeS?: number | null
  totalElevationGainM?: number | null
  isRace?: boolean | null
  /** raw_data.workout_type Strava (1 = course). */
  workoutType?: number | string | null
  /** deleted_at : activité supprimée si non nul. */
  deletedAt?: string | null
}

export interface RaceValidation {
  status: RaceValidationStatus
  /** Codes machine (anonymisés) expliquant le statut. */
  reasons: string[]
}

/** Distance minimale pour qu'une activité soit une « vraie » course (m). */
export const MIN_RACE_DISTANCE_M = 3000

/** Familles de sport acceptées (course à pied route ou trail). */
const RUN_SPORTS = new Set(['run', 'trailrun', 'trail run', 'running', 'virtualrun'])

// Bornes de vitesse plausibles pour une course (m/s). En dehors → incohérence.
// 7.5 m/s ≈ 2:13/km (au-delà = record du monde tenu sur la distance → artefact).
// 0.5 m/s ≈ 33:20/km (en deçà = arrêts prolongés/erreur → à inspecter).
const SPEED_HARD_MAX = 7.5
const SPEED_HARD_MIN = 0.5
// Zone de doute (pending) : vitesse crédible mais atypique.
const SPEED_SOFT_MAX = 7.0
const SPEED_SOFT_MIN = 1.0

// Marques diacritiques combinantes (résultat d'une décomposition NFD) : U+0300–U+036F.
const COMBINING_MARKS = /[̀-ͯ]/g

function norm(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '') // « échauffement » → « echauffement »
    .trim()
}

/** Motifs de nom qui excluent d'emblée (ce n'est pas une course chronométrée). */
const REJECT_NAME_PATTERNS = ['echauffement', 'decrassage', 'warm up', 'warm-up', 'cool down', 'recup', 'footing']

/** Motifs de nom qui rendent le résultat INCERTAIN (temps à confirmer) → pending. */
const PENDING_NAME_PATTERNS = ['a confirmer', 'a confirmee', 'a confirme', 'askip', 'temps a', 'non officiel', 'tapis']

function isRaceLabeled(c: RaceCandidateInput): boolean {
  if (c.isRace === true) return true
  const wt = c.workoutType
  return wt === 1 || wt === '1'
}

/**
 * Valide une course candidate. Ne confirme JAMAIS automatiquement au moindre doute.
 * Ordre : rejets durs (données inutilisables) → pending (doute) → confirmed.
 */
export function validateRaceCandidate(c: RaceCandidateInput): RaceValidation {
  const reasons: string[] = []

  // ── Rejets durs : données inutilisables pour un banc de mesure ──────────────
  if (c.deletedAt != null) reasons.push('deleted')

  const startMs = c.startDate ? Date.parse(c.startDate) : NaN
  if (Number.isNaN(startMs)) reasons.push('invalid_date')

  const sport = norm(c.sportType) || norm(c.type)
  if (!RUN_SPORTS.has(sport)) reasons.push('sport_not_run')

  const moving = typeof c.movingTimeS === 'number' && Number.isFinite(c.movingTimeS) ? c.movingTimeS : null
  if (moving == null || moving <= 0) reasons.push('no_real_time')

  const dist = typeof c.distanceM === 'number' && Number.isFinite(c.distanceM) ? c.distanceM : null
  if (dist == null || dist <= 0) reasons.push('no_distance')
  else if (dist < MIN_RACE_DISTANCE_M) reasons.push('distance_too_short')

  const name = norm(c.name)
  if (REJECT_NAME_PATTERNS.some((p) => name.includes(p))) reasons.push('name_not_a_race')

  // Vitesse implicite grossièrement impossible → rejet.
  if (dist != null && dist > 0 && moving != null && moving > 0) {
    const speed = dist / moving
    if (speed > SPEED_HARD_MAX || speed < SPEED_HARD_MIN) reasons.push('incoherent_speed')
  }

  if (reasons.length > 0) return { status: 'rejected', reasons }

  // ── Doute (pending) : jamais confirmé automatiquement ───────────────────────
  const pending: string[] = []
  if (PENDING_NAME_PATTERNS.some((p) => name.includes(p))) pending.push('time_to_confirm')
  if (!isRaceLabeled(c)) pending.push('not_labeled_race')

  if (dist != null && dist > 0 && moving != null && moving > 0) {
    const speed = dist / moving
    if (speed > SPEED_SOFT_MAX || speed < SPEED_SOFT_MIN) pending.push('atypical_speed')
  }

  // Écart moving/elapsed très fort sans mention (arrêts) → à inspecter, pas rejeté.
  if (moving != null && typeof c.elapsedTimeS === 'number' && c.elapsedTimeS > 0) {
    const gap = (c.elapsedTimeS - moving) / moving
    if (gap > 0.20) pending.push('large_stops')
  }

  if (pending.length > 0) return { status: 'pending', reasons: pending }

  return { status: 'confirmed', reasons: [] }
}
