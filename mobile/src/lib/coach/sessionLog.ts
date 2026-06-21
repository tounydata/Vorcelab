// Lecture/écriture du journal des séances (table `session_log`).
// Thin wrapper Supabase — la logique de verdict vit dans sessionVerdict.ts (pur).

import { supabase } from '../supabase'
import type { SessionVerdict, VerdictConfidence, AxisStatus } from './sessionVerdict'

export interface SessionLogEntry {
  plannedWorkoutId: string
  plannedDateISO: string // YYYY-MM-DD
  weekPhase?: string | null
  stravaActivityId?: string | null
  verdict: SessionVerdict
  confidence: VerdictConfidence
  compliancePace?: AxisStatus | null
  avgHrPctMax?: number | null
  hrDriftPct?: number | null
  dplusM?: number | null
  durationMin?: number | null
  feeling?: 'too_easy' | 'good' | 'meh' | 'too_hard' | 'ok' | 'bad' | null
  rpe?: number | null
  reasons?: string[]
  pain?: boolean
}

/** Enregistre (ou met à jour) le verdict d'une séance pour l'utilisateur courant. */
export async function saveSessionLog(entry: SessionLogEntry): Promise<{ error: string | null }> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { error: 'not_authenticated' }

  const { error } = await supabase.from('session_log').upsert(
    {
      user_id: userId,
      planned_workout_id: entry.plannedWorkoutId,
      planned_date: entry.plannedDateISO,
      week_phase: entry.weekPhase ?? null,
      strava_activity_id: entry.stravaActivityId ?? null,
      verdict: entry.verdict,
      confidence: entry.confidence,
      compliance_pace: entry.compliancePace ?? null,
      avg_hr_pct_max: entry.avgHrPctMax ?? null,
      hr_drift_pct: entry.hrDriftPct ?? null,
      dplus_m: entry.dplusM ?? null,
      duration_min: entry.durationMin ?? null,
      feeling: entry.feeling ?? null,
      rpe: entry.rpe ?? null,
      reasons: entry.reasons ?? [],
      pain: entry.pain ?? false,
    },
    { onConflict: 'user_id,planned_workout_id,planned_date' },
  )
  return { error: error?.message ?? null }
}

/** Historique récent des verdicts (le plus récent d'abord). */
export async function listSessionLog(limit = 30): Promise<SessionLogRow[]> {
  const { data, error } = await supabase
    .from('session_log')
    .select('*')
    .order('planned_date', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data as SessionLogRow[]
}

export interface SessionLogRow {
  id: string
  planned_workout_id: string
  planned_date: string
  week_phase: string | null
  strava_activity_id: string | null
  verdict: SessionVerdict
  confidence: VerdictConfidence
  compliance_pace: AxisStatus | null
  avg_hr_pct_max: number | null
  hr_drift_pct: number | null
  dplus_m: number | null
  duration_min: number | null
  feeling: 'too_easy' | 'good' | 'meh' | 'too_hard' | 'ok' | 'bad' | null
  rpe: number | null
  reasons: string[]
  pain: boolean
  created_at: string
}
