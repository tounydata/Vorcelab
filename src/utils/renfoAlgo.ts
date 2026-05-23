// Pure renfo algorithms — TypeScript version, no Supabase dependency
// Mirrors renfo-program.js but safe to import in the React SPA.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — allowJs covers this import
import {
  RENFO_EXERCISES, SESSION_EXERCISES, FOCUS_META, RENFO_LOAD_WEIGHTS, DAYS,
} from '../../renfo-data.js'

// ── Types ──────────────────────────────────────────────────────────────────

export interface RenfoEquipment {
  barbell?: boolean; leg_press?: boolean; bench?: boolean
  pullup_bar?: boolean; step?: boolean; anchor_point?: boolean
  bands?: string[]; dumbbells_max_kg?: number; kettlebell_max_kg?: number
  has_gym_access?: boolean
}
export interface RenfoProfile {
  user_id?: string
  sessions_per_week: number
  objective_weight: number
  equipment?: RenfoEquipment
  onboarding_completed?: boolean
}
export interface RenfoExerciseSlot {
  exercise_id: string; variant_id: string
  sets: number; reps: number; target_rpe: number
  rest_seconds: number; load_type: string
}
export interface RenfoSession {
  rest?: false; focus: string; label: string
  duration_min: number; timing_notes: string[]; location: string
  exercises: RenfoExerciseSlot[]
  dup_phase?: number; dup_label?: string
}
export interface RenfoRestSlot { rest: true; focus: null; exercises: [] }
export type WeekSchedule = Record<string, RenfoSession | RenfoRestSlot>

// ── Pure algorithms ────────────────────────────────────────────────────────

export function epley1RM(load_kg: number, reps: number): number | null {
  if (!load_kg || reps <= 0) return null
  if (reps === 1) return load_kg
  return Math.round(load_kg * (1 + reps / 30) * 10) / 10
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBestVariant(exercise: any, profile: Partial<RenfoProfile>): any {
  const eq = profile.equipment || {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants = [...exercise.variants].sort((a: any, b: any) => a.priority - b.priority)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of variants) {
    if (v.required_equipment) {
      if (v.required_equipment.has_gym_access && !eq.has_gym_access) continue
      if (v.required_equipment.barbell && !eq.barbell) continue
      if (v.required_equipment.leg_press && !eq.leg_press) continue
      if (v.required_equipment.bench && !eq.bench) continue
      if (v.required_equipment.pullup_bar && !eq.pullup_bar) continue
      if (v.required_equipment.step && !eq.step) continue
      if (v.required_equipment.anchor_point && !eq.anchor_point) continue
      if (v.required_equipment.bands && (!eq.bands || eq.bands.length === 0)) continue
    }
    if (v.required_equipment_any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = v.required_equipment_any.some((req: any) => {
        if (req.dumbbells_max_kg) return (eq.dumbbells_max_kg || 0) >= req.dumbbells_max_kg
        if (req.kettlebell_max_kg) return (eq.kettlebell_max_kg || 0) >= req.kettlebell_max_kg
        return false
      })
      if (!ok) continue
    }
    return v
  }
  return variants[variants.length - 1]
}

export function buildSession(focus: string, profile: Partial<RenfoProfile>): RenfoSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (FOCUS_META as any)[focus] || (FOCUS_META as any)['tronc']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allExoIds: string[] = (SESSION_EXERCISES as any)[focus] || []
  const maxExos = (focus === 'tronc' || focus === 'mobilite') ? 5 : 4
  const weekNum = Math.floor(Date.now() / (7 * 86400000))
  const offset = weekNum % Math.max(1, allExoIds.length - maxExos + 1)
  const exoIds = allExoIds.slice(offset, offset + maxExos)
  const exercises: RenfoExerciseSlot[] = exoIds.map(id => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exo = (RENFO_EXERCISES as any)[id]
    if (!exo) return null
    const variant = getBestVariant(exo, profile)
    return {
      exercise_id: id, variant_id: variant.id,
      sets: variant.default_sets, reps: variant.default_reps,
      target_rpe: variant.target_rpe, rest_seconds: variant.rest_seconds,
      load_type: variant.load_type,
    }
  }).filter((x): x is RenfoExerciseSlot => x !== null)

  const duration = (profile.sessions_per_week || 3) >= 5 ? meta.duration_short : meta.duration_min

  return { focus, label: meta.label, duration_min: duration, timing_notes: meta.timing_notes || [], location: meta.location, exercises }
}

export function allocateFocuses(spw: number, ow: number): string[] {
  if (spw === 1) return ['force_lourde']
  if (spw === 2) {
    if (ow <= 30) return ['force_lourde', 'excentrique']
    if (ow >= 70) return ['force_lourde', 'pliometrie']
    return ['force_lourde', 'excentrique_pliometrie']
  }
  if (spw === 3) return ['force_lourde', 'excentrique', 'yoga_coureur']
  if (spw === 4) {
    if (ow >= 70) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc']
    return ['force_lourde', 'excentrique', 'tronc', 'yoga_coureur']
  }
  if (spw === 5) {
    if (ow >= 70) return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps']
    return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'yoga_coureur']
  }
  if (ow <= 35) return ['force_lourde', 'excentrique', 'pliometrie', 'tronc', 'yoga_coureur', 'stretching']
  return ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps', 'yoga_coureur']
}

export function pickDays(spw: number): string[] {
  const patterns: Record<number, string[]> = {
    1: ['tuesday'],
    2: ['tuesday', 'friday'],
    3: ['monday', 'wednesday', 'friday'],
    4: ['monday', 'tuesday', 'thursday', 'friday'],
    5: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'],
    6: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  }
  return patterns[spw] || patterns[3]
}

export function generateWeekSchedule(profile: RenfoProfile): WeekSchedule {
  const spw = Math.min(6, Math.max(1, profile.sessions_per_week))
  const ow = profile.objective_weight || 50
  const focuses = allocateFocuses(spw, ow)
  const sessionDays = pickDays(spw)
  const schedule: WeekSchedule = {}
  ;(DAYS as string[]).forEach(day => {
    const idx = sessionDays.indexOf(day)
    if (idx === -1) {
      schedule[day] = { rest: true, focus: null, exercises: [] }
    } else {
      schedule[day] = buildSession(focuses[idx], profile)
    }
  })
  return schedule
}

export function getDUPPhase(): number {
  return Math.floor(Date.now() / (7 * 86400000)) % 3
}

export const DUP_PHASE_LABELS = ['FORCE', 'VOLUME', 'PUISSANCE']

const _DUP_SCHEMA: Record<string, Array<{ sets: number; reps: number; target_rpe: number; rest_seconds: number }>> = {
  force_lourde: [
    { sets: 5, reps: 5, target_rpe: 8, rest_seconds: 180 },
    { sets: 4, reps: 10, target_rpe: 7, rest_seconds: 90 },
    { sets: 4, reps: 4, target_rpe: 8, rest_seconds: 150 },
  ],
  excentrique: [
    { sets: 3, reps: 8, target_rpe: 8, rest_seconds: 120 },
    { sets: 3, reps: 12, target_rpe: 7, rest_seconds: 90 },
    { sets: 4, reps: 6, target_rpe: 9, rest_seconds: 120 },
  ],
  pliometrie: [
    { sets: 4, reps: 6, target_rpe: 8, rest_seconds: 150 },
    { sets: 3, reps: 12, target_rpe: 7, rest_seconds: 90 },
    { sets: 5, reps: 4, target_rpe: 8, rest_seconds: 150 },
  ],
}

export function applyDUP(session: RenfoSession): RenfoSession {
  if (!session?.focus) return session
  const schema = _DUP_SCHEMA[session.focus]
  if (!schema) return session
  const params = schema[getDUPPhase()]
  return {
    ...session,
    dup_phase: getDUPPhase(),
    dup_label: DUP_PHASE_LABELS[getDUPPhase()],
    exercises: session.exercises.map(e => ({
      ...e, sets: params.sets, reps: params.reps,
      target_rpe: params.target_rpe, rest_seconds: params.rest_seconds,
    })),
  }
}

export function weeklyImpactScore(sessionsLast7: Array<{ focus: string; duration_min?: number }>): number {
  return sessionsLast7.reduce((sum, s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (RENFO_LOAD_WEIGHTS as any)[s.focus] || 1.0
    return sum + (s.duration_min || 30) * w
  }, 0)
}

export function weeklyImpactZone(score: number): { zone: string; label: string; color: string } {
  if (score < 60)  return { zone: 'sous_dose',  label: 'Sous-dosé',           color: '#e74c3c' }
  if (score < 120) return { zone: 'maintien',   label: 'Maintien',            color: '#f39c12' }
  if (score < 180) return { zone: 'adaptation', label: 'Adaptation',          color: '#2ecc71' }
  if (score < 240) return { zone: 'optimal',    label: 'Optimal coureur',     color: '#27ae60' }
  return           { zone: 'surcharge',         label: 'Risque interférence', color: '#e67e22' }
}
