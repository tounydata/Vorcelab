// src/lib/coach/planGenerator.ts
// Générateur de plan d'entraînement — moteur de règles 100% déterministe.
// Aucune IA, aucune donnée envoyée à l'extérieur. À partir d'une course cible
// et de l'état du coureur, produit une périodisation semaine par semaine et
// sélectionne les séances dans la bibliothèque (workouts.ts).

import {
  WORKOUTS, getWorkout,
  type Phase, type WorkoutSystem, type Intensity, type Level, type WorkoutTarget, type WorkoutTemplate,
} from './workouts'
import { adaptCatalog, distanceFocusFromKm, type AdaptProfile } from './adaptCatalog'

export interface PlanInput {
  raceName: string
  /** Date de la course (ISO, ex "2026-09-12"). */
  raceDateISO: string
  raceDistanceKm: number
  raceElevationM: number
  /** Type de course tel que stocké ("Trail", "Route", …) ; null = inconnu. */
  raceType: string | null
  /** Date du jour (ISO). Injectée pour rester pure/testable. */
  todayISO: string
  /** Jours d'entraînement course disponibles par semaine (3–6). */
  daysPerWeek: number
  /** CTL (fitness) actuel, optionnel — affine le volume si fourni. */
  currentCTL?: number | null
  /** Niveau d'expérience (gating du choix des séances). Défaut : intermediate. */
  level?: Level
  /** Points faibles détectés (runnerProfile) — boostent les séances ciblées. */
  weaknesses?: WorkoutTarget[]
}

export interface PlannedSession {
  /** 1 = lundi … 7 = dimanche. */
  dayOfWeek: number
  workoutId: string
  title: string
  system: WorkoutSystem
  intensity: Intensity
  targetDurationMin: number
  climbing: boolean
  description: string
}

export interface PlanWeek {
  weekIndex: number
  weekStartISO: string
  phase: Phase
  isRecovery: boolean
  /** Volume course indicatif de la semaine, en heures. */
  volumeHours: number
  focus: string
  sessions: PlannedSession[]
}

export interface TrainingPlan {
  race: {
    name: string
    dateISO: string
    distanceKm: number
    elevationM: number
    isTrail: boolean
  }
  weeksToRace: number
  daysPerWeek: number
  /** Répartition macro : nb de semaines par phase. */
  phaseBreakdown: Record<Phase, number>
  weeks: PlanWeek[]
  /** Explications déterministes des choix (transparence). */
  rationale: string[]
}

const DAY_MS = 86_400_000

/** Une course est « trail » si typée Trail ou si elle présente un D+ significatif. */
export function isTrailRace(raceType: string | null, elevationM: number): boolean {
  if (raceType && /trail|montagne|ultra|skyrace/i.test(raceType)) return true
  return elevationM >= 800
}

/** Nombre de semaines (pleines, arrondi au supérieur) entre aujourd'hui et la course. Min 1. */
export function weeksUntil(todayISO: string, raceISO: string): number {
  const today = new Date(todayISO + 'T00:00:00')
  const race = new Date(raceISO + 'T00:00:00')
  const days = Math.round((race.getTime() - today.getTime()) / DAY_MS)
  if (days <= 0) return 1
  return Math.max(1, Math.ceil(days / 7))
}

/** Lundi de la semaine contenant `iso`, au format ISO date. */
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Répartit les semaines en phases (base → build → specific → taper → race).
 * Les 2 dernières semaines sont toujours affûtage + course (1 seule si horizon court).
 */
export function allocatePhases(n: number): Phase[] {
  if (n <= 1) return ['race']
  if (n === 2) return ['taper', 'race']
  if (n === 3) return ['build', 'taper', 'race']
  if (n === 4) return ['base', 'build', 'taper', 'race']
  if (n === 5) return ['base', 'build', 'specific', 'taper', 'race']

  // n >= 6 : proportions (base ≈ 30%, spécifique ≈ 20%, build = reste), + taper + course.
  const trainingWeeks = n - 2 // hors taper + race
  let base = Math.max(1, Math.round(n * 0.3))
  let specific = Math.max(1, Math.round(n * 0.2))
  let build = trainingWeeks - base - specific
  while (build < 1 && specific > 1) { specific--; build++ }
  while (build < 1 && base > 1) { base--; build++ }

  const phases: Phase[] = []
  for (let i = 0; i < base; i++) phases.push('base')
  for (let i = 0; i < build; i++) phases.push('build')
  for (let i = 0; i < specific; i++) phases.push('specific')
  phases.push('taper')
  phases.push('race')
  return phases
}

/** Volume hebdo cible (heures) selon course, phase, semaine de décharge et CTL. */
function weekVolumeHours(
  phase: Phase,
  isRecovery: boolean,
  distanceKm: number,
  currentCTL: number | null | undefined,
): number {
  // Volume de pic dérivé de la distance (4 h pour une courte, jusqu'à 14 h pour un ultra).
  let peak = 4 + distanceKm * 0.06
  peak = Math.min(14, Math.max(4, peak))
  // Ajustement prudent si la fitness actuelle est connue et faible.
  if (currentCTL != null && currentCTL > 0 && currentCTL < 30) peak *= 0.85

  const phaseFactor: Record<Phase, number> = {
    base: 0.8, build: 0.95, specific: 1.0, taper: 0.6, race: 0.4,
  }
  let h = peak * phaseFactor[phase]
  if (isRecovery) h *= 0.65
  return Math.round(h * 10) / 10
}

/** Ordre de placement des séances dans la semaine (1=lun … 7=dim). */
const DAY_SLOTS = [7, 2, 4, 3, 6, 1, 5] // dimanche=longue, mardi/jeudi=qualité, etc.

function scaleDuration(baseMin: number, phase: Phase, isRecovery: boolean): number {
  const f: Record<Phase, number> = { base: 0.85, build: 1.0, specific: 1.05, taper: 0.7, race: 0.6 }
  let m = baseMin * f[phase]
  if (isRecovery) m *= 0.75
  return Math.round(m / 5) * 5
}

function toSession(workoutId: string, dayOfWeek: number, phase: Phase, isRecovery: boolean): PlannedSession {
  const w = getWorkout(workoutId)!
  return {
    dayOfWeek,
    workoutId: w.id,
    title: w.name,
    system: w.system,
    intensity: w.intensity,
    targetDurationMin: scaleDuration(w.baseDurationMin, phase, isRecovery),
    climbing: w.climbing,
    description: w.description,
  }
}

/** Combien de séances de qualité (intensité haute) selon la phase. */
function qualityCount(phase: Phase): number {
  switch (phase) {
    case 'base': return 1
    case 'build': return 2
    case 'specific': return 2
    case 'taper': return 1
    default: return 0
  }
}

// Systèmes qui ne sont PAS des séances de « qualité » à insérer dans la semaine :
// la longue, l'easy/récup et le renfo sont placés via leurs propres slots.
const NON_QUALITY_SYSTEMS: WorkoutSystem[] = ['endurance', 'recovery', 'long', 'strength', 'race']

function isQualityTemplate(t: WorkoutTemplate): boolean {
  return !NON_QUALITY_SYSTEMS.includes(t.system) && t.target !== 'recovery'
}

/**
 * Garde-fou d'affûtage : en taper, on coupe le volume mais on ne place AUCUNE
 * séance dure (VO2max/seuil/côtes). Seuls les rappels neuromusculaires légers
 * (strides, accélérations — intensité ≤ moderate) sont autorisés, le temps que
 * la fatigue tombe sans perdre l'affûtage nerveux (Daniels/Pfitzinger).
 */
function isTaperSafe(t: WorkoutTemplate): boolean {
  return t.intensity !== 'hard'
}

/**
 * Pool de séances « qualité » de la phase, ADAPTÉ AU PROFIL (niveau × distance ×
 * route/trail × points faibles) via adaptCatalog, trié par pertinence décroissante.
 * Plafonné pour rester focalisé tout en laissant de la variété à la rotation.
 */
function qualityPool(phase: Phase, isTrail: boolean, input: PlanInput): string[] {
  const profile: AdaptProfile = {
    level: input.level ?? 'intermediate',
    distance: distanceFocusFromKm(input.raceDistanceKm),
    trail: isTrail,
    phase,
    weaknesses: input.weaknesses,
  }
  return adaptCatalog(profile)
    .filter((s) => isQualityTemplate(s.template))
    .filter((s) => phase !== 'taper' || isTaperSafe(s.template))
    .slice(0, 8)
    .map((s) => s.template.id)
}

function buildRaceWeek(input: PlanInput, weekIndex: number, weekStartISO: string): PlanWeek {
  const raceDow = (new Date(input.raceDateISO + 'T00:00:00').getDay() + 6) % 7 + 1 // 1..7
  const sessions: PlannedSession[] = []
  // Quelques footings faciles en début de semaine.
  const easyDays = [1, 3].filter((d) => d < raceDow - 1)
  for (const d of easyDays) sessions.push(toSession('recovery_jog', d, 'race', false))
  // Déverrouillage la veille (si possible).
  if (raceDow - 1 >= 1) sessions.push(toSession('shakeout', raceDow - 1, 'race', false))
  // La course elle-même.
  sessions.push({
    dayOfWeek: raceDow,
    workoutId: 'race',
    title: `🏁 ${input.raceName}`,
    system: 'race',
    intensity: 'hard',
    targetDurationMin: 0,
    climbing: input.raceElevationM >= 800,
    description: `Jour J — ${input.raceDistanceKm} km / ${input.raceElevationM} m D+. Applique ta stratégie de course.`,
  })
  sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  return {
    weekIndex,
    weekStartISO,
    phase: 'race',
    isRecovery: false,
    volumeHours: weekVolumeHours('race', false, input.raceDistanceKm, input.currentCTL),
    focus: 'Semaine de course — fraîcheur et logistique.',
    sessions,
  }
}

function buildTrainingWeek(
  input: PlanInput,
  weekIndex: number,
  weekStartISO: string,
  phase: Phase,
  isRecovery: boolean,
  isTrail: boolean,
): PlanWeek {
  const days = Math.min(6, Math.max(3, input.daysPerWeek))
  const sessions: PlannedSession[] = []
  const usedSlots = new Set<number>()
  let slotPtr = 0
  const nextSlot = (): number => {
    while (slotPtr < DAY_SLOTS.length && usedSlots.has(DAY_SLOTS[slotPtr])) slotPtr++
    const s = DAY_SLOTS[slotPtr] ?? (1 + (usedSlots.size % 7))
    usedSlots.add(s)
    return s
  }

  // 1) Sortie longue (dimanche) — toujours présente.
  const longId = isTrail ? 'long_run_dplus' : 'long_run_flat'
  sessions.push(toSession(longId, nextSlot(), phase, isRecovery))

  // 2) Séances de qualité selon la phase (réduites en semaine de décharge).
  const pool = qualityPool(phase, isTrail, input)
  let nQuality = isRecovery ? Math.min(1, qualityCount(phase)) : qualityCount(phase)
  nQuality = Math.min(nQuality, Math.max(0, days - 1)) // garder au moins de la place
  for (let i = 0; i < nQuality && pool.length > 0; i++) {
    // Rotation par semaine pour varier les stimuli.
    const id = pool[(weekIndex + i) % pool.length]
    sessions.push(toSession(id, nextSlot(), phase, isRecovery))
  }

  // 3) Le reste en endurance / récupération.
  while (sessions.length < days) {
    const easyId = sessions.length === days - 1 && isRecovery ? 'recovery_jog' : 'endurance_easy'
    sessions.push(toSession(easyId, nextSlot(), phase, isRecovery))
  }

  sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek)

  const focusByPhase: Record<Phase, string> = {
    base: 'Construction aérobie + force en côte.',
    build: 'Développement seuil/VO2 et spécificité montée.',
    specific: 'Spécificité course : allure objectif sur profil proche.',
    taper: 'Affûtage : volume en baisse, intensité préservée.',
    race: 'Semaine de course.',
  }

  return {
    weekIndex,
    weekStartISO,
    phase,
    isRecovery,
    volumeHours: weekVolumeHours(phase, isRecovery, input.raceDistanceKm, input.currentCTL),
    focus: isRecovery ? 'Semaine de décharge — récupération et assimilation.' : focusByPhase[phase],
    sessions,
  }
}

export function generateTrainingPlan(input: PlanInput): TrainingPlan {
  const isTrail = isTrailRace(input.raceType, input.raceElevationM)
  const weeksToRace = weeksUntil(input.todayISO, input.raceDateISO)
  const phases = allocatePhases(weeksToRace)

  // Lundi de la semaine de course, puis on remonte semaine par semaine.
  const raceWeekMonday = mondayOf(input.raceDateISO)
  const firstWeekMonday = addDaysISO(raceWeekMonday, -7 * (phases.length - 1))

  const weeks: PlanWeek[] = phases.map((phase, i) => {
    const weekStartISO = addDaysISO(firstWeekMonday, 7 * i)
    if (phase === 'race') return buildRaceWeek(input, i, weekStartISO)
    // Décharge toutes les 4 semaines, jamais en taper/course.
    const isRecovery = (i + 1) % 4 === 0
    return buildTrainingWeek(input, i, weekStartISO, phase, isRecovery, isTrail)
  })

  const phaseBreakdown = phases.reduce(
    (acc, p) => { acc[p] = (acc[p] ?? 0) + 1; return acc },
    { base: 0, build: 0, specific: 0, taper: 0, race: 0 } as Record<Phase, number>,
  )

  const rationale: string[] = []
  rationale.push(
    `${input.raceName} — ${input.raceDistanceKm} km / ${input.raceElevationM} m D+ ` +
    `(${isTrail ? 'trail' : 'route'}) dans ${weeksToRace} semaine${weeksToRace > 1 ? 's' : ''}.`,
  )
  rationale.push(
    `Périodisation : ${phaseBreakdown.base} base · ${phaseBreakdown.build} développement · ` +
    `${phaseBreakdown.specific} spécifique · ${phaseBreakdown.taper} affûtage · 1 course.`,
  )
  if (isTrail) {
    rationale.push('Course trail → priorité aux sorties longues en D+, côtes longues et descente technique (durabilité).')
  } else {
    rationale.push('Course route → priorité au seuil, VO2max et allure spécifique sur terrain roulant.')
  }
  rationale.push('Une semaine de décharge toutes les 4 semaines pour assimiler la charge.')
  if (input.currentCTL == null) {
    rationale.push('Volume basé sur la distance de la course ; il s\'affinera avec ton CTL (charge chronique) réel.')
  }

  return {
    race: {
      name: input.raceName,
      dateISO: input.raceDateISO,
      distanceKm: input.raceDistanceKm,
      elevationM: input.raceElevationM,
      isTrail,
    },
    weeksToRace,
    daysPerWeek: Math.min(6, Math.max(3, input.daysPerWeek)),
    phaseBreakdown,
    weeks,
    rationale,
  }
}

// Utilitaire d'affichage (réutilisé par la page).
export const PHASE_LABELS: Record<Phase, string> = {
  base: 'BASE', build: 'DÉVELOPPEMENT', specific: 'SPÉCIFIQUE', taper: 'AFFÛTAGE', race: 'COURSE',
}

export const SYSTEM_LABELS: Record<WorkoutSystem, string> = {
  endurance: 'Endurance', recovery: 'Récup', long: 'Sortie longue', tempo: 'Tempo',
  threshold: 'Seuil', vo2max: 'VO2max', speed: 'Vitesse', hills: 'Côtes', descent: 'Descente',
  race_pace: 'Allure course', strength: 'Renfo', race: 'Course',
}

// Référence exportée pour vérifier l'intégrité de la bibliothèque dans les tests.
export const WORKOUT_IDS = WORKOUTS.map((w) => w.id)
