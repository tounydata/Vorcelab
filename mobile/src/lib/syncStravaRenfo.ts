// Rattrapage renfo : importe dans le module renfo (renfo_session_log) les séances de
// renforcement déjà présentes dans strava_activities. Le webhook Strava n'auto-importe
// QUE les nouvelles activités (aspect_type === 'create') ; cette passe rattrape tout
// l'historique déjà synchronisé. Idempotente. Logique pure dans ./renfoBackfill.
import { supabase } from './supabase'
import { buildRenfoRows, isRenfo, type StravaActLite } from './renfoBackfill'

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
  if (!acts.some((a) => isRenfo(a.type, a.sport_type))) return 0

  // La contrainte d'unicité est (user, date, focus) → plusieurs séances de types
  // différents le même jour sont valides (ex. « haut du corps » + pilates).
  const { data: existing } = await supabase
    .from('renfo_session_log')
    .select('session_date,focus')
    .eq('user_id', userId)
    .gte('session_date', cutoffISO.slice(0, 10))

  const rows = buildRenfoRows(
    userId,
    acts as StravaActLite[],
    (existing ?? []) as { session_date: string; focus: string | null }[],
  )
  if (rows.length === 0) return 0

  const { error } = await supabase.from('renfo_session_log').insert(rows)
  if (error) {
    console.error('[VL] syncStravaRenfo insert error:', error.message)
    return 0
  }
  return rows.length
}
