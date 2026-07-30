import { supabase } from './supabase'
import {
  computeProjectionAccuracy,
  type AccuracySnapshot,
  type AccuracyOptions,
  type ProjectionAccuracyReport,
} from './projectionAccuracy'

// Chargement des snapshots prospectifs de l'utilisateur courant (RLS : `user_id = auth.uid()`)
// et agrégation en métriques d'erreur. Aucune donnée GPS n'est lue : uniquement des
// prédictions figées et des temps réels.

/** Colonnes réellement nécessaires — jamais `select('*')`. */
const ACCURACY_COLUMNS =
  'engine_version,prediction_central_s,prediction_prudent_s,prediction_aggressive_s,' +
  'result_moving_s,result_elapsed_s,status,data_split'

export async function loadProjectionAccuracy(
  options: AccuracyOptions = {},
): Promise<ProjectionAccuracyReport> {
  const { data, error } = await supabase
    .from('projection_validation_snapshots')
    .select(ACCURACY_COLUMNS)
    .order('race_start_at', { ascending: false })
  if (error) throw error

  const snapshots: AccuracySnapshot[] = (data ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>
    return {
      engineVersion: String(row.engine_version ?? '?'),
      predictionCentralS: Number(row.prediction_central_s),
      predictionPrudentS: row.prediction_prudent_s == null ? null : Number(row.prediction_prudent_s),
      predictionAggressiveS: row.prediction_aggressive_s == null ? null : Number(row.prediction_aggressive_s),
      resultMovingS: row.result_moving_s == null ? null : Number(row.result_moving_s),
      resultElapsedS: row.result_elapsed_s == null ? null : Number(row.result_elapsed_s),
      status: row.status == null ? null : String(row.status),
      dataSplit: row.data_split == null ? null : String(row.data_split),
    }
  })

  return computeProjectionAccuracy(snapshots, options)
}
