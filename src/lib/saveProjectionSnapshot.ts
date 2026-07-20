// Persistance d'un SNAPSHOT prospectif de projection (§14, branchement app).
//
// Appelé quand une projection est affichée pour une course FUTURE : fige un instantané
// immuable (prédiction + empreinte SHA-256) via le client Supabase de l'utilisateur → RLS
// `user_id = auth.uid()` + trigger d'immuabilité côté base. Idempotent : on ne recrée pas
// un snapshot si la MÊME prédiction (mêmes versions moteur/profil) est déjà figée pour cette
// course — un nouveau snapshot n'est créé que lorsque la prédiction change réellement.

import { supabase } from './supabase'
import { buildProjectionSnapshot, snapshotToDbRow } from './projectionSnapshot'
import { ENGINE_VERSION } from './engineVersion'
import { ENGINE_HISTORY_DAYS } from './engineHistory'

export interface LockSnapshotInput {
  /** Optionnel : sinon récupéré depuis la session Supabase courante. */
  userId?: string
  raceId: string
  raceStartAtMs: number
  predictionCentralS: number
  predictionPrudentS: number
  predictionAggressiveS: number
  raceDistanceM: number
  raceDplusM: number
  activityCount: number
  usedPersonalFade: boolean
  usedSteepnessCalibration: boolean
  usedFallback: boolean
  fallbackSources: string[]
  profileVersion: string
  profileSchemaVersion: string
}

export type LockSnapshotResult = 'created' | 'exists' | 'race_started' | 'invalid' | 'error'

/**
 * Fige un snapshot pour une course FUTURE si aucune prédiction identique n'est déjà
 * verrouillée. Ne lève jamais : renvoie un code de résultat (usage fire-and-forget).
 */
export async function maybeLockProjectionSnapshot(input: LockSnapshotInput): Promise<LockSnapshotResult> {
  try {
    const nowMs = Date.now()
    if (!input.raceId || !Number.isFinite(input.raceStartAtMs)) return 'invalid'
    if (!(input.predictionCentralS > 0)) return 'invalid'
    // On ne fige QUE les courses à venir (preuve PROSPECTIVE).
    if (input.raceStartAtMs <= nowMs) return 'race_started'

    const userId = input.userId ?? (await supabase.auth.getUser()).data.user?.id
    if (!userId) return 'invalid'

    // Idempotence : même prédiction centrale + mêmes versions déjà figée pour cette course ?
    const { data: existing } = await supabase
      .from('projection_validation_snapshots')
      .select('id')
      .eq('user_id', userId)
      .eq('race_id', input.raceId)
      .eq('engine_version', ENGINE_VERSION)
      .eq('profile_version', input.profileVersion)
      .eq('prediction_central_s', Math.round(input.predictionCentralS))
      .limit(1)
    if (existing && existing.length > 0) return 'exists'

    const snap = buildProjectionSnapshot({
      id: '', // la DB génère l'uuid (colonne `id` retirée avant insert)
      userId,
      raceId: input.raceId,
      raceStartAt: new Date(input.raceStartAtMs).toISOString(),
      engineVersion: ENGINE_VERSION,
      profileVersion: input.profileVersion,
      profileSchemaVersion: input.profileSchemaVersion,
      predictionCentralS: input.predictionCentralS,
      predictionPrudentS: input.predictionPrudentS,
      predictionAggressiveS: input.predictionAggressiveS,
      raceDistanceM: input.raceDistanceM,
      raceDplusM: input.raceDplusM,
      historyStartAt: new Date(nowMs - ENGINE_HISTORY_DAYS * 86_400_000).toISOString(),
      historyEndAt: new Date(nowMs).toISOString(),
      activityCount: input.activityCount,
      usedPersonalFade: input.usedPersonalFade,
      usedSteepnessCalibration: input.usedSteepnessCalibration,
      usedFallback: input.usedFallback,
      fallbackSources: input.fallbackSources,
    })
    const row = snapshotToDbRow(snap)
    delete row.id
    const { error } = await supabase.from('projection_validation_snapshots').insert(row)
    return error ? 'error' : 'created'
  } catch {
    return 'error'
  }
}
