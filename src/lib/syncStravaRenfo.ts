// Backfill renfo : importe dans le module renfo (renfo_session_log) les séances de
// renforcement déjà présentes dans strava_activities — musculation, workout, yoga,
// pilates, cross-training, HIIT. Le webhook Strava n'auto-importe QUE les nouvelles
// activités (aspect_type === 'create') ; cette passe rattrape tout l'historique déjà
// synchronisé. Idempotente : on ne ré-importe jamais une date déjà loggée.
import { supabase } from './supabase'

const RENFO_TYPES = new Set([
  'WeightTraining', 'Workout', 'CrossTraining', 'Crossfit', 'Yoga', 'Pilates',
  'HighIntensityIntervalTraining',
])

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

interface ExerciseSet { exercise_type?: string }

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

function isRenfo(type?: string | null, sportType?: string | null): boolean {
  return RENFO_TYPES.has(type ?? '') || RENFO_TYPES.has(sportType ?? '')
}

function inferRenfoFocus(type: string, sportType: string, sets?: ExerciseSet[]): string | null {
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

/**
 * Importe les séances renfo Strava manquantes des `sinceDays` derniers jours.
 * Retourne le nombre de séances effectivement ajoutées (0 si rien à faire).
 */
export async function syncStravaRenfo(userId: string, sinceDays = 90): Promise<number> {
  const cutoffISO = new Date(Date.now() - sinceDays * 86400000).toISOString()

  const { data: acts, error: aErr } = await supabase
    .from('strava_activities')
    .select('type,sport_type,start_date,start_date_local,moving_time,raw_data')
    .gte('start_date_local', cutoffISO)
  if (aErr || !acts) return 0

  const renfoActs = acts.filter((a) => isRenfo(a.type, a.sport_type))
  if (renfoActs.length === 0) return 0

  // Toute date ayant déjà UNE séance renfo (peu importe la source) est ignorée :
  // on n'écrase ni ne double une séance manuelle ou déjà importée.
  const { data: existing } = await supabase
    .from('renfo_session_log')
    .select('session_date')
    .eq('user_id', userId)
    .gte('session_date', cutoffISO.slice(0, 10))
  const seen = new Set((existing ?? []).map((e) => e.session_date as string))

  const rows: Record<string, unknown>[] = []
  for (const a of renfoActs) {
    const date = String(a.start_date_local ?? a.start_date ?? '').slice(0, 10)
    if (!date || seen.has(date)) continue
    seen.add(date) // une séance renfo Strava par jour max
    const dayKey = DAY_KEYS[new Date(date + 'T12:00:00').getDay()]
    const movingMin = a.moving_time ? Math.round((a.moving_time as number) / 60) : null
    const sets = (a.raw_data as { exercise_sets?: ExerciseSet[] } | null)?.exercise_sets
    rows.push({
      user_id: userId,
      session_date: date,
      day_key: dayKey,
      focus: inferRenfoFocus(a.type ?? '', a.sport_type ?? '', sets),
      duration_min: movingMin && movingMin > 0 ? movingMin : null,
      completed_exercises: {},
      source: 'strava',
    })
  }
  if (rows.length === 0) return 0

  const { error } = await supabase.from('renfo_session_log').insert(rows)
  if (error) {
    console.error('[VL] syncStravaRenfo insert error:', error.message)
    return 0
  }
  return rows.length
}
