// Chargeur PARTAGÉ de l'historique moteur des six derniers mois (IO Supabase).
//
// Isolé de `engineHistory.ts` (logique PURE) pour que celui-ci reste testable et
// importable côté mobile sans tirer le client Supabase. Web et mobile exposent tous
// deux `./supabase` → ce fichier est portable à l'identique.

import { supabase } from './supabase'
import {
  ENGINE_COLUMNS_SELECT,
  engineHistoryBounds,
  type EngineActivity,
  type EngineHistoryQuery,
} from './engineHistory'

/**
 * Charge l'historique moteur des six derniers mois depuis Supabase :
 *   1. calcule la borne des six mois relativement à `asOfMs ?? Date.now()` ;
 *   2. ne charge QUE les colonnes utiles (jamais `*`) ;
 *   3. exclut les activités supprimées ;
 *   4. exclut les activités futures (borne haute STRICTE) ;
 *   5. retourne les activités triées par date décroissante.
 * La borne athlète est assurée par la RLS (chaque utilisateur ne voit que ses lignes).
 */
export async function fetchEngineHistory(options?: EngineHistoryQuery): Promise<EngineActivity[]> {
  const { asOfISO, sinceISO } = engineHistoryBounds(options?.asOfMs, options?.historyDays)
  const { data, error } = await supabase
    .from('strava_activities')
    .select(ENGINE_COLUMNS_SELECT)
    .lt('start_date', asOfISO)
    .gte('start_date', sinceISO)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as EngineActivity[]
}
