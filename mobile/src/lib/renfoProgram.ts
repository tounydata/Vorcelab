// src/lib/renfoProgram.ts
// Port TypeScript 1-pour-1 des fonctions PURES de renfo-program.js consommées
// par l'app React (buildSession + applyDUP, et leurs dépendances pures).
// Les fonctions async couplées à Supabase (getCoPerioWarnings, suggestNextLoad,
// suggestNextVariant, checkPlateau, weeklyImpact*) ne sont PAS portées ici :
// elles ne sont pas consommées par React, qui utilise leurs équivalents typés
// dans renfoUtils.ts. Le fichier legacy les conserve pour legacy.html.

import { RENFO_EXERCISES, SESSION_EXERCISES, FOCUS_META } from './renfoData'

interface RenfoProfile {
  has_gym_access?: boolean
  equipment?: Record<string, unknown>
  sessions_per_week?: number
  [k: string]: unknown
}

// Variantes/exercices : vrais types (les données renfoData arrivent en `any` et
// « entrent » sans risque ; les accès ci-dessous sont désormais typés).
export interface RequiredEquipment {
  has_gym_access?: boolean
  barbell?: boolean
  leg_press?: boolean
  bench?: boolean
  pullup_bar?: boolean
  step?: boolean
  anchor_point?: boolean
  bands?: unknown[]
  [k: string]: unknown
}
export interface Variant {
  id: string
  priority: number
  required_equipment?: RequiredEquipment
  required_equipment_any?: Array<Record<string, number>>
  default_sets: number
  default_reps: number | string
  target_rpe: number
  rest_seconds: number
  load_type: string
  unit?: string | null
  [k: string]: unknown
}
export interface Exercise {
  id?: string
  variants: Variant[]
  [k: string]: unknown
}

// Une variante est-elle réalisable avec le matériel du profil ?
export function isVariantFeasible(v: Variant, profile: RenfoProfile): boolean {
  const eq: Record<string, any> = profile.equipment || {}
  if (v.required_equipment) {
    if (v.required_equipment.has_gym_access && !profile.has_gym_access) return false
    if (v.required_equipment.barbell && !eq.barbell) return false
    if (v.required_equipment.leg_press && !eq.leg_press) return false
    if (v.required_equipment.bench && !eq.bench) return false
    if (v.required_equipment.pullup_bar && !eq.pullup_bar) return false
    if (v.required_equipment.step && !eq.step) return false
    if (v.required_equipment.anchor_point && !eq.anchor_point) return false
    if (v.required_equipment.bands && (!eq.bands || eq.bands.length === 0)) return false
  }
  if (v.required_equipment_any) {
    const ok = v.required_equipment_any.some((req: Record<string, any>) => {
      if (req.dumbbells_max_kg) return (eq.dumbbells_max_kg || 0) >= req.dumbbells_max_kg
      if (req.kettlebell_max_kg) return (eq.kettlebell_max_kg || 0) >= req.kettlebell_max_kg
      return false
    })
    if (!ok) return false
  }
  return true
}

// Meilleure variante réalisable (priorité croissante), ou null si AUCUNE ne l'est —
// on n'invente plus une variante impossible (ex. face pull poulie proposé à la maison).
export function getBestVariant(exercise: Exercise, profile: RenfoProfile): Variant | null {
  const variants = [...exercise.variants].sort((a: Variant, b: Variant) => a.priority - b.priority)
  for (const v of variants) {
    if (isVariantFeasible(v, profile)) return v
  }
  return null
}

export interface BuiltSessionExercise {
  exercise_id: string
  variant_id: string
  sets: number
  reps: number | string
  target_rpe: number
  rest_seconds: number
  load_type: string
  unit: string | null
}

export interface BuiltSession {
  focus: string
  label: string
  duration_min: number
  timing_notes: string[]
  location: string
  exercises: BuiltSessionExercise[]
  dup_phase?: number
  dup_label?: string
}

export function buildSession(focus: string, profile: RenfoProfile): BuiltSession {
  const meta = FOCUS_META[focus] || FOCUS_META['tronc']
  // On ne retient que les exercices ayant AU MOINS une variante réalisable avec le
  // matériel du lieu choisi (sinon : face pull poulie proposé à la maison, etc.).
  const allExoIds: string[] = (SESSION_EXERCISES[focus] || []).filter((id: string) => {
    const exo = RENFO_EXERCISES[id]
    return exo && getBestVariant(exo, profile) != null
  })
  const maxExos = (focus === 'tronc' || focus === 'mobilite') ? 5 : 4
  const weekNum = Math.floor(Date.now() / (7 * 86400000))
  const offset = weekNum % Math.max(1, allExoIds.length - maxExos + 1)
  const exoIds = allExoIds.slice(offset, offset + maxExos)
  const exercises = exoIds.map(id => {
    const exo = RENFO_EXERCISES[id]
    if (!exo) return null
    const variant = getBestVariant(exo, profile)
    if (!variant) return null
    return {
      exercise_id: id,
      variant_id: variant.id,
      sets: variant.default_sets,
      reps: variant.default_reps,
      target_rpe: variant.target_rpe,
      rest_seconds: variant.rest_seconds,
      load_type: variant.load_type,
      unit: variant.unit ?? null,
    }
  }).filter(Boolean) as BuiltSessionExercise[]

  const duration = ((profile.sessions_per_week ?? 0) >= 5) ? meta.duration_short : meta.duration_min

  return {
    focus,
    label: meta.label,
    duration_min: duration,
    timing_notes: meta.timing_notes || [],
    location: meta.location,
    exercises,
  }
}

// ── DUP (Daily Undulating Periodization) ──────────────────────────────────

// 3-week rotating cycle: 0=force, 1=volume, 2=puissance
export function getDUPPhase(): number {
  return Math.floor(Date.now() / (7 * 86400000)) % 3
}

export const DUP_PHASE_LABELS = ['FORCE', 'VOLUME', 'PUISSANCE']

const _DUP_SCHEMA: Record<string, { sets: number; reps: number; target_rpe: number; rest_seconds: number }[]> = {
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

export function applyDUP(session: BuiltSession): BuiltSession {
  if (!session || !session.focus) return session
  const schema = _DUP_SCHEMA[session.focus]
  if (!schema) return session
  const params = schema[getDUPPhase()]
  return {
    ...session,
    dup_phase: getDUPPhase(),
    dup_label: DUP_PHASE_LABELS[getDUPPhase()],
    exercises: session.exercises.map(e => ({
      ...e,
      sets: params.sets,
      reps: params.reps,
      target_rpe: params.target_rpe,
      rest_seconds: params.rest_seconds,
    })),
  }
}
