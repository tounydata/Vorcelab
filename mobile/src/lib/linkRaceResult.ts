import { supabase } from './supabase'

// Lie (ou délie) l'activité Strava réelle d'une course du calendrier.
// Règle produit : lier une activité à un ÉVÉNEMENT la marque automatiquement « course »
// (is_race) — c'est une course, donc elle sert de référence d'allure aux projections.

/**
 * Reporte le résultat réel sur les snapshots PROSPECTIFS de la course (§14) : c'est ce
 * qui ferme la boucle de mesure. Sans cela, `projection_validation_snapshots` accumule
 * des prédictions figées que rien ne confronte jamais au réel, et une régression du
 * moteur ne peut être détectée qu'à la main.
 *
 * Écriture UNIQUE (garantie par trigger SQL) : on ne touche qu'aux snapshots encore
 * `locked` et sans résultat. Délier une activité n'efface donc RIEN — une preuve
 * prospective déjà établie ne se rétracte pas.
 *
 * Best-effort : toute erreur est avalée. Enregistrer la mesure ne doit jamais empêcher
 * l'athlète de lier son résultat.
 */
async function recordSnapshotResult(raceId: string, activityId: string): Promise<void> {
  try {
    const { data: activity, error } = await supabase
      .from('strava_activities')
      .select('moving_time,elapsed_time')
      .eq('id', activityId)
      .single()
    if (error || !activity) return

    const movingS = typeof activity.moving_time === 'number' ? Math.round(activity.moving_time) : null
    const elapsedS = typeof activity.elapsed_time === 'number' ? Math.round(activity.elapsed_time) : null
    if (movingS == null && elapsedS == null) return

    await supabase
      .from('projection_validation_snapshots')
      .update({
        result_moving_s: movingS,
        result_elapsed_s: elapsedS,
        result_recorded_at: new Date().toISOString(),
        status: 'evaluated',
      })
      .eq('race_id', raceId)
      .eq('status', 'locked')
      .is('result_recorded_at', null)
  } catch {
    // Silencieux : la liaison du résultat reste l'action prioritaire.
  }
}

export async function linkRaceResult(raceId: string, activityId: string | null): Promise<void> {
  const { error } = await supabase
    .from('race_calendar')
    .update({ result_activity_id: activityId })
    .eq('id', raceId)
  if (error) throw error
  if (activityId) {
    // Best-effort : ne bloque pas la liaison si le marquage échoue.
    await supabase.from('strava_activities').update({ is_race: true }).eq('id', activityId)
    // Ferme la boucle de validation : la prédiction figée rencontre enfin le réel.
    await recordSnapshotResult(raceId, activityId)
  }
}
