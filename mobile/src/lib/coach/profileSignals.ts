// src/lib/coach/profileSignals.ts
// Traduit le profil coureur (runner_profile persisté + VDOT) en signaux
// d'adaptation consommés par le plan : niveau d'expérience + points faibles.
// Pur, déterministe. Aucune IA.

import { getBucketType, type BucketKey, type RunnerProfileComputed } from '../runnerProfile'
import type { Level, WorkoutTarget } from './workouts'

/** Niveau d'expérience déduit du VDOT (gating du choix des séances). */
export function levelFromVdot(vdot: number | null | undefined): Level {
  if (vdot == null || !Number.isFinite(vdot)) return 'intermediate'
  if (vdot < 40) return 'beginner'
  if (vdot < 52) return 'intermediate'
  return 'advanced'
}

/**
 * Points faibles déduits du profil par-gradient (montée/plat/descente),
 * de la dérive cardiaque et de la fatigue en descente. Les buckets « weak »
 * deviennent des cibles d'entraînement prioritaires pour adaptCatalog.
 */
export function weaknessesFromRunnerProfile(
  rp: RunnerProfileComputed | null | undefined,
): WorkoutTarget[] {
  const out = new Set<WorkoutTarget>()
  if (!rp) return []

  for (const [key, stats] of Object.entries(rp.buckets ?? {})) {
    if (!stats || stats.status !== 'weak') continue
    const type = getBucketType(key as BucketKey)
    if (type === 'up') out.add('climbing')
    else if (type === 'down') out.add('descending')
    else out.add('economy')
  }

  if (rp.hrDriftStatus === 'marked') out.add('durability')
  if (rp.postClimbRecoveryStatus === 'weak') out.add('climbing')
  if (rp.downhillFatigue?.status === 'high') out.add('descending')

  return [...out]
}
