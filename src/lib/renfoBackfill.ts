// Logique PURE du rattrapage renfo (aucun import Supabase → testable sous Node sans
// WebSocket). syncStravaRenfo.ts l'utilise en y branchant les accès base.
//
// Importe dans le module renfo les séances de renforcement déjà présentes dans
// strava_activities — musculation, workout, yoga, pilates, cross-training, HIIT.
// Déduplication par (date + focus) : la contrainte d'unicité est (user, date, focus),
// donc deux séances de TYPES différents le même jour coexistent (ex. haut du corps +
// pilates). On ne saute qu'un doublon exact.

export const RENFO_TYPES = new Set([
  'WeightTraining', 'Workout', 'CrossTraining', 'Crossfit', 'Yoga', 'Pilates',
  'HighIntensityIntervalTraining',
])

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export interface ExerciseSet { exercise_type?: string }

// Map Strava exercise_type → focus renfo (identique à l'edge function strava-webhook).
const EXERCISE_FOCUS_MAP: Record<string, string> = {
  back_squat: 'force_lourde', front_squat: 'force_lourde', goblet_squat: 'force_lourde',
  deadlift: 'force_lourde', romanian_deadlift: 'force_lourde', sumo_deadlift: 'force_lourde',
  lunge: 'force_lourde', reverse_lunge: 'force_lourde', split_squat: 'force_lourde',
  step_up: 'force_lourde', leg_press: 'force_lourde', hip_thrust: 'force_lourde',
  box_jump: 'pliometrie', jump_squat: 'pliometrie', broad_jump: 'pliometrie',
  burpee: 'pliometrie', single_leg_jump: 'pliometrie', jumping_lunge: 'pliometrie',
  nordic_curl: 'excentrique', single_leg_deadlift: 'excentrique',
  bench_press: 'haut_corps', incline_bench_press: 'haut_corps', push_up: 'haut_corps',
  pull_up: 'haut_corps', chin_up: 'haut_corps', lat_pulldown: 'haut_corps',
  row: 'haut_corps', seated_row: 'haut_corps', shoulder_press: 'haut_corps',
  overhead_press: 'haut_corps', dumbbell_row: 'haut_corps',
  plank: 'tronc', side_plank: 'tronc', dead_bug: 'tronc', hollow_body: 'tronc',
  sit_up: 'tronc', russian_twist: 'tronc', bird_dog: 'tronc', pallof_press: 'tronc',
}

export function isRenfo(type?: string | null, sportType?: string | null): boolean {
  return RENFO_TYPES.has(type ?? '') || RENFO_TYPES.has(sportType ?? '')
}

export function inferRenfoFocus(type: string, sportType: string, sets?: ExerciseSet[]): string | null {
  const t = (type + ' ' + sportType).toLowerCase()
  if (t.includes('yoga')) return 'yoga_coureur'
  if (t.includes('pilates')) return 'pilates_coureur'
  if (!sets?.length) return null
  const counts: Record<string, number> = {}
  for (const s of sets) {
    const f = EXERCISE_FOCUS_MAP[s.exercise_type?.toLowerCase() ?? '']
    if (f) counts[f] = (counts[f] ?? 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export interface StravaActLite {
  type?: string | null
  sport_type?: string | null
  start_date?: string | null
  start_date_local?: string | null
  moving_time?: number | null
  raw_data?: { exercise_sets?: ExerciseSet[] } | null
}

export interface RenfoLogRow {
  user_id: string
  session_date: string
  day_key: string
  focus: string | null
  duration_min: number | null
  completed_exercises: Record<string, never>
  source: 'strava'
}

/**
 * À partir des activités Strava et des séances déjà loggées, construit les lignes
 * renfo manquantes (déduplication par date + focus).
 */
export function buildRenfoRows(
  userId: string,
  acts: StravaActLite[],
  existing: { session_date: string; focus: string | null }[],
): RenfoLogRow[] {
  const keyOf = (date: string, focus: string | null) => `${date}|${focus ?? ''}`
  const seen = new Set(existing.map((e) => keyOf(e.session_date, e.focus)))
  const rows: RenfoLogRow[] = []
  for (const a of acts) {
    if (!isRenfo(a.type, a.sport_type)) continue
    const date = String(a.start_date_local ?? a.start_date ?? '').slice(0, 10)
    if (!date) continue
    const focus = inferRenfoFocus(a.type ?? '', a.sport_type ?? '', a.raw_data?.exercise_sets)
    const key = keyOf(date, focus)
    if (seen.has(key)) continue
    seen.add(key)
    const movingMin = a.moving_time ? Math.round(a.moving_time / 60) : null
    rows.push({
      user_id: userId,
      session_date: date,
      day_key: DAY_KEYS[new Date(date + 'T12:00:00').getDay()],
      focus,
      duration_min: movingMin && movingMin > 0 ? movingMin : null,
      completed_exercises: {},
      source: 'strava',
    })
  }
  return rows
}
