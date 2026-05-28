// Pure wrappers around renfo-program.js logic — no Supabase calls.
// These functions receive data already fetched by TanStack Query and apply
// the same algorithms as the vanilla JS counterparts.

export interface Activity {
  start_date_local?: string
  type?: string
  sport_type?: string
  distance?: number
  moving_time?: number
  total_elevation_gain?: number
}

export interface CoPerioWarning {
  type: 'avoid_force' | 'post_long' | 'quality_session'
  message: string
  avoid: string[]
  prefer: string[]
  severity: 'warn' | 'alert' | 'info'
}

export interface ExerciseLog {
  session_date: string
  exercise_id: string
  load_kg: number | null
  reps_completed: number | null
  rpe: number | null
  e1rm: number | null
  completed_all_reps: boolean | null
}

export interface SessionLog {
  id?: string
  focus: string
  duration_min?: number | null
  session_date?: string
}

// ── DUP 4 SEMAINES ────────────────────────────────────────────────────────────
// Extension du getDUPPhase() de renfo-program.js : ajoute une 4e semaine de décharge.

export type DUPPhase4 = 'force' | 'volume' | 'puissance' | 'deload'
const DUP4_PHASES: DUPPhase4[] = ['force', 'volume', 'puissance', 'deload']

export function get4WeekPhase(): DUPPhase4 {
  return DUP4_PHASES[Math.floor(Date.now() / (7 * 86400000)) % 4]
}

export const DUP4_LABELS: Record<DUPPhase4, string> = {
  force:     'FORCE',
  volume:    'VOLUME',
  puissance: 'PUISSANCE',
  deload:    'DÉCHARGE',
}

export const DUP4_COLORS: Record<DUPPhase4, string> = {
  force:     'var(--vl-ember)',
  volume:    'var(--vl-amber)',
  puissance: 'var(--vl-growth)',
  deload:    'var(--vl-text-3)',
}

// Applique les modificateurs décharge : -1 série, RPE max 7
export function applyDeloadModifiers<T extends { sets: number; target_rpe?: number }>(
  exercises: T[]
): T[] {
  return exercises.map((e) => ({
    ...e,
    sets: Math.max(1, e.sets - 1),
    target_rpe: Math.min(7, e.target_rpe ?? 8),
  }))
}

// ── CO-PÉRIODISATION ──────────────────────────────────────────────────────────
// Logique identique à getCoPerioWarnings() de renfo-program.js sans le fetch Supabase.

const RUN_SPORT_TYPES = new Set(['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun'])

function isRunActivity(a: Activity): boolean {
  return RUN_SPORT_TYPES.has(a.type ?? '') || RUN_SPORT_TYPES.has(a.sport_type ?? '')
}

export function computeCoPerioWarnings(activities: Activity[]): CoPerioWarning[] {
  if (!activities || activities.length === 0) return []

  const warnings: CoPerioWarning[] = []
  const now = Date.now()
  const cutoffMs = now - 3 * 86400000

  for (const act of activities) {
    if (!isRunActivity(act)) continue  // ignore vélo, marche, etc.

    const actMs = new Date(act.start_date_local ?? '').getTime()
    if (!actMs || actMs < cutoffMs) continue

    const daysAgo = Math.round((now - actMs) / 86400000)
    const distKm = (act.distance ?? 0) / 1000
    const dp = act.total_elevation_gain ?? 0
    const pace = distKm > 0 ? ((act.moving_time ?? 0) / 60) / distKm : 99

    if (daysAgo <= 2 && distKm > 15) {
      warnings.push({
        type: 'avoid_force',
        message: `Sortie longue ${distKm.toFixed(0)} km (il y a ${daysAgo}j) → évite la force lourde et la pliométrie`,
        avoid: ['force_lourde', 'pliometrie'],
        prefer: ['yoga_coureur', 'stretching', 'tronc'],
        severity: 'warn',
      })
    }
    if (daysAgo <= 3 && (distKm > 25 || dp > 1500)) {
      warnings.push({
        type: 'post_long',
        message: `Course exigeante ${distKm.toFixed(0)} km / D+${dp} m → priorité récupération`,
        avoid: ['force_lourde', 'pliometrie', 'excentrique'],
        prefer: ['mobilite', 'yoga_coureur', 'stretching'],
        severity: 'alert',
      })
    }
    if (daysAgo <= 1 && distKm > 3 && pace < 5) {
      warnings.push({
        type: 'quality_session',
        message: `Séance rapide hier (${pace.toFixed(2)} min/km) → préfère tronc ou yoga aujourd'hui`,
        avoid: ['pliometrie'],
        prefer: ['tronc', 'haut_corps', 'yoga_coureur'],
        severity: 'info',
      })
    }
  }

  // Dédoublonnage par type
  const seen = new Set<string>()
  return warnings.filter((w) => {
    if (seen.has(w.type)) return false
    seen.add(w.type)
    return true
  })
}

// ── SUGGESTION DE CHARGE ──────────────────────────────────────────────────────
// Logique identique à suggestNextLoad() de renfo-program.js sans le fetch Supabase.
// Reçoit les derniers logs d'un exercice (déjà triés par session_date DESC).

export function computeNextLoad(logs: ExerciseLog[]): number | null {
  if (!logs || logs.length === 0) return null
  const last = logs[0]
  const currentLoad = last.load_kg
  if (!currentLoad) return null

  if (!last.completed_all_reps) {
    if (logs.length >= 2 && !logs[1].completed_all_reps)
      return Math.round((currentLoad * 0.95) / 1.25) * 1.25
    return currentLoad
  }

  const rpe = last.rpe ?? 8
  if (rpe <= 7) {
    const raw = currentLoad * 1.04
    const inc = Math.max(1.25, Math.round((raw - currentLoad) / 1.25) * 1.25)
    return currentLoad + inc
  }
  if (rpe === 8) return currentLoad
  if (rpe === 9) return Math.round((currentLoad * 0.975) / 1.25) * 1.25
  return Math.round((currentLoad * 0.95) / 1.25) * 1.25
}

// ── IMPACT SCORE ──────────────────────────────────────────────────────────────
// Wrappeur typé autour de weeklyImpactScore / weeklyImpactZone de renfo-program.js

export function computeImpactZone(sessions: SessionLog[]): {
  score: number
  zone: string
  label: string
  color: string
} {
  const WEIGHTS: Record<string, number> = {
    force_lourde: 1.5, pliometrie: 1.3, excentrique: 1.2,
    haut_corps: 1.0, tronc: 0.8, mobilite: 0.5,
    yoga_coureur: 0.3, stretching: 0.2, pilates_coureur: 0.3,
    excentrique_pliometrie: 1.25,
  }
  const score = sessions.reduce((sum, s) => sum + (s.duration_min ?? 30) * (WEIGHTS[s.focus] ?? 1.0), 0)
  if (score < 60)  return { score, zone: 'sous_dose',  label: 'Sous-dosé',           color: '#e74c3c' }
  if (score < 120) return { score, zone: 'maintien',   label: 'Maintien',            color: '#f39c12' }
  if (score < 180) return { score, zone: 'adaptation', label: 'Adaptation',          color: '#2ecc71' }
  if (score < 240) return { score, zone: 'optimal',    label: 'Optimal coureur',     color: '#27ae60' }
  return            { score, zone: 'surcharge',         label: 'Risque interférence', color: '#e67e22' }
}

// ── UTILITAIRES ───────────────────────────────────────────────────────────────

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function fmtRestTimer(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`
}

export function calcE1rm(loadKg: number, reps: number): number {
  return Math.round(loadKg * (1 + reps / 30) * 10) / 10
}
