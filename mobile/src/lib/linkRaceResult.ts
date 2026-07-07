import { supabase } from './supabase'

// Lie (ou délie) l'activité Strava réelle d'une course du calendrier.
// Règle produit : lier une activité à un ÉVÉNEMENT la marque automatiquement « course »
// (is_race) — c'est une course, donc elle sert de référence d'allure aux projections.
export async function linkRaceResult(raceId: string, activityId: string | null): Promise<void> {
  const { error } = await supabase
    .from('race_calendar')
    .update({ result_activity_id: activityId })
    .eq('id', raceId)
  if (error) throw error
  if (activityId) {
    // Best-effort : ne bloque pas la liaison si le marquage échoue.
    await supabase.from('strava_activities').update({ is_race: true }).eq('id', activityId)
  }
}
