// Persistance d'un SNAPSHOT prospectif de projection (§4, branchement app).
//
// La CRÉATION est désormais faite CÔTÉ SERVEUR par l'Edge Function `lock-projection-snapshot`
// (le client n'a plus le droit d'INSERT — cf. migration). Le client se contente d'ENVOYER
// l'artefact à figer (prédictions + drapeaux + versions) ; le serveur, faisant autorité :
//   • vérifie que la course n'a pas commencé (depuis `race_calendar`) ;
//   • reconstruit le MANIFESTE COMPLET des entrées + l'empreinte ;
//   • insère avec le service_role, idempotent.
// Fire-and-forget : ne lève jamais, renvoie un code de résultat.

import { supabase } from './supabase'
import { ENGINE_VERSION } from './engineVersion'

export interface LockSnapshotInput {
  /** Conservé pour compat des appels ; le serveur fait autorité sur le départ. */
  userId?: string
  raceId: string
  raceStartAtMs: number
  predictionCentralS: number
  predictionPrudentS: number
  predictionAggressiveS: number
  /** Conservés pour compat ; le serveur relit distance/D+ depuis `race_calendar`. */
  raceDistanceM: number
  raceDplusM: number
  /** Conservé pour compat ; le serveur reconstruit le manifeste (activity_count réel). */
  activityCount: number
  usedPersonalFade: boolean
  usedSteepnessCalibration: boolean
  usedFallback: boolean
  fallbackSources: string[]
  profileVersion: string
  profileSchemaVersion: string
}

export type LockSnapshotResult =
  | 'created' | 'exists' | 'race_started' | 'race_not_found' | 'invalid' | 'error'

/**
 * Demande au serveur de figer un snapshot pour une course FUTURE. Ne lève jamais.
 */
export async function maybeLockProjectionSnapshot(input: LockSnapshotInput): Promise<LockSnapshotResult> {
  try {
    if (!input.raceId) return 'invalid'
    if (!(input.predictionCentralS > 0)) return 'invalid'
    // Garde-fou client (évite un appel inutile) — le serveur re-vérifie de façon autoritaire.
    if (Number.isFinite(input.raceStartAtMs) && input.raceStartAtMs <= Date.now()) return 'race_started'

    const { data, error } = await supabase.functions.invoke('lock-projection-snapshot', {
      body: {
        raceId: input.raceId,
        predictionCentralS: input.predictionCentralS,
        predictionPrudentS: input.predictionPrudentS,
        predictionAggressiveS: input.predictionAggressiveS,
        usedPersonalFade: input.usedPersonalFade,
        usedSteepnessCalibration: input.usedSteepnessCalibration,
        usedFallback: input.usedFallback,
        fallbackSources: input.fallbackSources,
        engineVersion: ENGINE_VERSION,
        profileVersion: input.profileVersion,
        profileSchemaVersion: input.profileSchemaVersion,
      },
    })
    if (error) return 'error'
    const result = (data as { result?: LockSnapshotResult } | null)?.result
    return result ?? 'created'
  } catch {
    return 'error'
  }
}
