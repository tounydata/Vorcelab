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
import { motivationBias, type CoachMotivation } from './motivation'
import { computePostRaceRecovery, type CompletedRace } from './postRaceRecovery'

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
  /** Orientation d'entraînement (plaisir/mix/performance) — biaise volume & intensité. */
  motivation?: CoachMotivation
  /** Courses secondaires (B/C) tombant dans la fenêtre du plan — intégrées comme
   *  rodage (C) ou mini-affûtage (B), sans casser la prépa de la course principale. */
  secondaryRaces?: SecondaryRace[]
  /** Dernière course TERMINÉE (récente) — déclenche un bloc de récup post-course en
   *  début de plan (reverse taper) ; durée ∝ distance + D+ (cf. postRaceRecovery). */
  recentRace?: CompletedRace
}

/** Course secondaire dans la fenêtre du plan (priorité B = objectif secondaire, C = rodage). */
export interface SecondaryRace {
  name: string
  dateISO: string
  priority: 'B' | 'C'
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
  /** Objectif de D+ (m) pour les séances en côte/longue trail — fourchette indicative,
   *  progressant vers le D+ de la course (cf. climbTargetBandM). null hors trail. */
  climbTargetM?: { min: number; max: number } | null
  description: string
}

export interface PlanWeek {
  weekIndex: number
  weekStartISO: string
  phase: Phase
  isRecovery: boolean
  /** Semaine de récupération POST-COURSE (reverse taper après une course terminée). */
  isPostRaceRecovery?: boolean
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

/** Phase macro de la SEMAINE COURANTE pour une course (sans générer tout le plan). */
export function currentPlanPhase(raceDateISO: string, distanceKm: number, todayISO: string): Phase {
  return allocatePhases(weeksUntil(todayISO, raceDateISO), distanceKm)[0]
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
 * L'affûtage dure plusieurs semaines (cf. `taperWeeks`) pour que le PIC de charge
 * tombe ~3 semaines avant la course, puis réduction progressive jusqu'au jour J.
 */
export function allocatePhases(n: number, distanceKm = 0): Phase[] {
  if (n <= 1) return ['race']
  if (n === 2) return ['taper', 'race']
  if (n === 3) return ['build', 'taper', 'race']
  if (n === 4) return ['base', 'build', 'taper', 'race']
  if (n === 5) return ['base', 'build', 'specific', 'taper', 'race']

  // n >= 6 : proportions (base ≈ 30%, spécifique ≈ 20%, build = reste), + taper + course.
  const taper = taperWeeks(distanceKm, n)
  const trainingWeeks = n - taper - 1 // hors taper + course
  let base = Math.max(1, Math.round(n * 0.3))
  let specific = Math.max(1, Math.round(n * 0.2))
  let build = trainingWeeks - base - specific
  while (build < 1 && specific > 1) { specific--; build++ }
  while (build < 1 && base > 1) { base--; build++ }

  const phases: Phase[] = []
  for (let i = 0; i < base; i++) phases.push('base')
  for (let i = 0; i < build; i++) phases.push('build')
  for (let i = 0; i < specific; i++) phases.push('specific')
  for (let i = 0; i < taper; i++) phases.push('taper')
  phases.push('race')
  return phases
}

/**
 * Durée de l'affûtage selon la distance (périodisation, références grand public) :
 * courte/semi = 2 semaines, marathon (≥ 35 km) = 3. Le pic de charge tombe ainsi
 * ~3 semaines avant la course. `distanceKm = 0` (défaut) → 1 (compat. interne).
 * Plafonné pour toujours laisser base + build + spécifique + course ailleurs.
 */
function taperWeeks(distanceKm: number, n: number): number {
  const wanted = distanceKm >= 35 ? 3 : distanceKm > 0 ? 2 : 1
  const maxTaper = Math.max(1, n - 4)
  return Math.min(wanted, maxTaper)
}

/**
 * Coefficient d'affûtage selon le nombre de semaines avant la course :
 * dernière semaine ≈ 55 % du pic, l'avant-dernière ≈ 72 %, une 3e (marathon) ≈ 85 %.
 * Réduction progressive du volume tout en gardant la fraîcheur (cf. périodisation).
 */
function taperVolumeFactor(weeksToGo: number): number {
  if (weeksToGo <= 1) return 0.55
  if (weeksToGo === 2) return 0.72
  return 0.85
}
function taperDurationFactor(weeksToGo: number): number {
  if (weeksToGo <= 1) return 0.6
  if (weeksToGo === 2) return 0.75
  return 0.85
}

/** Volume hebdo cible (heures) selon course, phase, semaine de décharge et CTL. */
function weekVolumeHours(
  phase: Phase,
  isRecovery: boolean,
  distanceKm: number,
  currentCTL: number | null | undefined,
  weeksToGo = 0,
  volumeScale = 1,
): number {
  // Volume de pic dérivé de la distance (4 h pour une courte, jusqu'à 14 h pour un ultra).
  let peak = 4 + distanceKm * 0.06
  peak = Math.min(14, Math.max(4, peak))
  // Prudence GRADUÉE selon la charge chronique réelle (CTL) : un athlète peu
  // chargé ne reçoit pas d'emblée le volume de pic théorique (0.8 à CTL≤20 → 1.0 à CTL≥40).
  if (currentCTL != null && currentCTL > 0) {
    peak *= Math.max(0.8, Math.min(1, 0.8 + (currentCTL - 20) * (0.2 / 20)))
  }

  const phaseFactor: Record<Phase, number> = {
    base: 0.8, build: 0.95, specific: 1.0, taper: 0.6, race: 0.4,
  }
  const factor = phase === 'taper' ? taperVolumeFactor(weeksToGo) : phaseFactor[phase]
  let h = peak * factor
  if (isRecovery) h *= 0.65
  h *= volumeScale // orientation plaisir/perf
  return Math.round(h * 10) / 10
}

/** Ordre de placement des séances dans la semaine (1=lun … 7=dim). */
const DAY_SLOTS = [7, 2, 4, 3, 6, 1, 5] // dimanche=longue, mardi/jeudi=qualité, etc.

function scaleDuration(baseMin: number, phase: Phase, isRecovery: boolean, weeksToGo = 0): number {
  const f: Record<Phase, number> = { base: 0.85, build: 1.0, specific: 1.05, taper: 0.7, race: 0.6 }
  const factor = phase === 'taper' ? taperDurationFactor(weeksToGo) : f[phase]
  let m = baseMin * factor
  if (isRecovery) m *= 0.75
  return Math.round(m / 5) * 5
}

/**
 * Objectif de D+ (m) de la SORTIE LONGUE trail, en fourchette indicative, exprimé
 * comme un % du D+ de la course qui MONTE vers le pic en spécifique puis redescend
 * en affûtage (Uphill Athlete : « longue = % du D+ course », pics 50→100 % des totaux ;
 * progression élévation ≤ +20 %/sem). Renvoie null hors trail (D+ course nul).
 */
export function longRunClimbBandM(phase: Phase, raceElevationM: number, isRecovery = false): { min: number; max: number } | null {
  if (raceElevationM <= 0) return null
  const frac: Record<Phase, number> = { base: 0.30, build: 0.45, specific: 0.58, taper: 0.35, race: 0 }
  const f = frac[phase]
  if (f <= 0) return null
  const center = raceElevationM * f * (isRecovery ? 0.7 : 1)
  const round10 = (x: number) => Math.max(0, Math.round(x / 10) * 10)
  return { min: round10(center * 0.85), max: round10(center * 1.15) }
}

function toSession(workoutId: string, dayOfWeek: number, phase: Phase, isRecovery: boolean, weeksToGo = 0): PlannedSession {
  const w = getWorkout(workoutId)!
  return {
    dayOfWeek,
    workoutId: w.id,
    title: w.name,
    system: w.system,
    intensity: w.intensity,
    targetDurationMin: scaleDuration(w.baseDurationMin, phase, isRecovery, weeksToGo),
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
 * Systèmes INTERDITS en affûtage, quelle que soit l'intensité affichée :
 * - vo2max / threshold : aucun gain de forme en < 2 semaines, ils n'ajoutent que de
 *   la fatigue qui gâche la surcompensation (Bosquet 2007 ; Mujika & Padilla ;
 *   PLOS One 2023 — aucune Δ VO2max/économie en affûtage).
 * - descent : charge excentrique → dommages musculaires ; la fenêtre de protection
 *   (repeated-bout effect) se construit AVANT, jamais dans les 10 derniers jours
 *   (Millet/Giandolini ; Uphill Athlete).
 * - strength : le renfo lourd se réalise ~10 j plus tard et risque la fatigue/courbatures.
 */
const TAPER_FORBIDDEN_SYSTEMS: WorkoutSystem[] = ['vo2max', 'threshold', 'descent', 'strength']

/**
 * Garde-fou d'affûtage : en taper, on coupe le VOLUME mais on garde l'intensité
 * BRÈVE (règle « cut volume, keep intensity » — Bosquet 2007). Concrètement on ne
 * place AUCUNE séance de développement (VO2max/seuil), aucune descente (excentrique)
 * ni renfo : seuls les rappels neuromusculaires légers (strides à plat, rappels en
 * côte sur terrain trail — système 'speed', intensité ≤ moderate) sont autorisés,
 * le temps que la fatigue tombe sans perdre l'affûtage nerveux (Daniels/Pfitzinger).
 */
function isTaperSafe(t: WorkoutTemplate): boolean {
  if (TAPER_FORBIDDEN_SYSTEMS.includes(t.system)) return false
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
    title: input.raceName,
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
    volumeHours: weekVolumeHours('race', false, input.raceDistanceKm, input.currentCTL, 0, motivationBias(input.motivation).volumeScale),
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
  weeksToGo: number,
  weekRace?: SecondaryRace,
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

  // 0) Course secondaire dans la semaine (B = objectif secondaire, C = rodage) :
  //    on réserve son jour et on l'intègre comme séance dure de la semaine.
  if (weekRace) {
    const dow = (new Date(weekRace.dateISO + 'T00:00:00').getDay() + 6) % 7 + 1
    usedSlots.add(dow)
    sessions.push({
      dayOfWeek: dow, workoutId: 'secondary_race',
      title: `${weekRace.name} (course ${weekRace.priority})`,
      system: 'race', intensity: 'hard', targetDurationMin: 0, climbing: isTrail,
      description: weekRace.priority === 'C'
        ? 'Course de préparation — à courir comme une grosse séance qualité (test allure, ravito, matériel). Pas d’affûtage.'
        : 'Course objectif secondaire — mini-affûtage cette semaine, sans casser la prépa principale.',
    })
  }

  // 1) Sortie longue (sauf B : mini-affûtage → pas de charge en plus de la course).
  if (weekRace?.priority !== 'B') {
    const longId = isTrail ? 'long_run_dplus' : 'long_run_flat'
    const longSession = toSession(longId, nextSlot(), phase, isRecovery, weeksToGo)
    if (isTrail) longSession.climbTargetM = longRunClimbBandM(phase, input.raceElevationM, isRecovery)
    sessions.push(longSession)
  }

  // 2) Séances de qualité selon la phase (réduites en semaine de décharge),
  //    biaisées par l'ORIENTATION (plaisir = moins de qualité, pas d'intensité dure).
  const bias = motivationBias(input.motivation)
  const pool0 = qualityPool(phase, isTrail, input)
  const pool = bias.allowHardIntensity ? pool0 : pool0.filter((id) => getWorkout(id)?.intensity !== 'hard')
  let nQuality = isRecovery ? Math.min(1, qualityCount(phase)) : qualityCount(phase)
  nQuality = Math.max(0, nQuality + bias.qualityDelta)  // orientation décale (plaisir −1 / perf +1)
  nQuality = Math.min(nQuality, bias.maxQualityPerWeek) // puis plafonne
  if (weekRace) nQuality = weekRace.priority === 'B' ? 0 : Math.max(0, nQuality - 1) // la course EST une séance dure
  nQuality = Math.min(nQuality, Math.max(0, days - 1)) // garder au moins de la place
  for (let i = 0; i < nQuality && pool.length > 0; i++) {
    // Rotation par semaine pour varier les stimuli.
    const id = pool[(weekIndex + i) % pool.length]
    sessions.push(toSession(id, nextSlot(), phase, isRecovery, weeksToGo))
  }

  // 3) Le reste en endurance / récupération.
  while (sessions.length < days) {
    const easyId = sessions.length === days - 1 && isRecovery ? 'recovery_jog' : 'endurance_easy'
    sessions.push(toSession(easyId, nextSlot(), phase, isRecovery, weeksToGo))
  }

  sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek)

  const focusByPhase: Record<Phase, string> = {
    base: 'Construction aérobie + force en côte.',
    build: 'Développement seuil/VO2 et spécificité montée.',
    specific: 'Spécificité course : allure objectif sur profil proche.',
    taper: 'Affûtage : volume en forte baisse, seulement de courts rappels d\'allure.',
    race: 'Semaine de course.',
  }

  let volumeHours = weekVolumeHours(phase, isRecovery, input.raceDistanceKm, input.currentCTL, weeksToGo, bias.volumeScale)
  let focus = isRecovery ? 'Semaine de décharge — récupération et assimilation.' : focusByPhase[phase]
  if (weekRace) {
    if (weekRace.priority === 'B') volumeHours = Math.round(volumeHours * 0.7 * 10) / 10 // mini-affûtage
    focus = weekRace.priority === 'C'
      ? `Course de prépa (${weekRace.name}) intégrée comme séance qualité.`
      : `Objectif secondaire (${weekRace.name}) — mini-affûtage cette semaine.`
  }

  return { weekIndex, weekStartISO, phase, isRecovery, volumeHours, focus, sessions }
}

/**
 * Semaine de RÉCUPÉRATION POST-COURSE (reverse taper) : que des footings très faciles,
 * aucune intensité, volume réduit qui remonte progressivement (1re semaine la plus légère).
 * `offset` = 0 pour la 1re semaine post-course (la plus douce), `total` = nb de semaines de récup.
 */
function buildPostRaceRecoveryWeek(
  input: PlanInput,
  weekIndex: number,
  weekStartISO: string,
  phase: Phase,
  offset: number,
  total: number,
  isTrail: boolean,
): PlanWeek {
  // Reverse taper : la 1re semaine est la plus légère, on remonte ensuite.
  const ramp = total <= 1 ? 0.55 : offset === 0 ? 0.4 : Math.min(0.75, 0.6 + (offset - 1) * 0.15)
  const days = Math.max(3, Math.min(6, input.daysPerWeek) - 1) // un jour de moins qu'à l'habitude
  const sessions: PlannedSession[] = []
  const slots = DAY_SLOTS.slice(0, days).sort((a, b) => a - b)
  let totalMin = 0
  for (let i = 0; i < days; i++) {
    // Que du facile : surtout récup, un footing d'endurance possible en milieu de bloc.
    const id = (offset === 0 || i === 0 || i === days - 1)
      ? 'recovery_jog'
      : (isTrail ? 'hike_recovery' : 'endurance_easy')
    const w = getWorkout(id)!
    const dur = Math.max(20, Math.round((w.baseDurationMin * ramp) / 5) * 5)
    totalMin += dur
    sessions.push({
      dayOfWeek: slots[i], workoutId: w.id, title: w.name, system: w.system,
      intensity: w.intensity, targetDurationMin: dur, climbing: false, description: w.description,
    })
  }
  sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  return {
    weekIndex, weekStartISO, phase, isRecovery: true, isPostRaceRecovery: true,
    volumeHours: Math.round((totalMin / 60) * 10) / 10,
    focus: `Récupération post-course (semaine ${offset + 1}/${total}) — footings très faciles, zéro intensité. On laisse cicatriser muscles, SNC et immunité avant de relancer la charge.`,
    sessions,
  }
}

export function generateTrainingPlan(input: PlanInput): TrainingPlan {
  const isTrail = isTrailRace(input.raceType, input.raceElevationM)
  const weeksToRace = weeksUntil(input.todayISO, input.raceDateISO)
  const phases = allocatePhases(weeksToRace, input.raceDistanceKm)

  // Lundi de la semaine de course, puis on remonte semaine par semaine.
  const raceWeekMonday = mondayOf(input.raceDateISO)
  const firstWeekMonday = addDaysISO(raceWeekMonday, -7 * (phases.length - 1))

  const weeks: PlanWeek[] = phases.map((phase, i) => {
    const weekStartISO = addDaysISO(firstWeekMonday, 7 * i)
    if (phase === 'race') return buildRaceWeek(input, i, weekStartISO)
    // Nombre de semaines avant la course (course = 0) → pilote l'affûtage progressif.
    const weeksToGo = phases.length - 1 - i
    // Décharge toutes les 4 semaines, jamais en taper/course.
    const isRecovery = (i + 1) % 4 === 0
    // Course secondaire (B/C) tombant dans cette semaine ?
    const weekEndISO = addDaysISO(weekStartISO, 6)
    const weekRace = (input.secondaryRaces ?? []).find((r) => r.dateISO >= weekStartISO && r.dateISO <= weekEndISO)
    return buildTrainingWeek(input, i, weekStartISO, phase, isRecovery, isTrail, weeksToGo, weekRace)
  })

  // ── Récupération POST-COURSE : si une course vient d'être terminée et qu'on est
  // encore dans sa fenêtre de récup, on convertit les 1res semaines (hors taper/course)
  // en récup (reverse taper). La récup « mange » donc sur le début de la prépa suivante.
  let postRaceWeeksApplied = 0
  if (input.recentRace) {
    const rec = computePostRaceRecovery(input.recentRace, input.todayISO)
    if (rec?.inWindow) {
      for (let i = 0; i < weeks.length && postRaceWeeksApplied < rec.recoveryWeeks; i++) {
        if (weeks[i].phase === 'taper' || weeks[i].phase === 'race') break // ne jamais écraser un affûtage imminent
        weeks[i] = buildPostRaceRecoveryWeek(input, i, weeks[i].weekStartISO, weeks[i].phase, postRaceWeeksApplied, rec.recoveryWeeks, isTrail)
        postRaceWeeksApplied++
      }
    }
  }

  const phaseBreakdown = phases.reduce(
    (acc, p) => { acc[p] = (acc[p] ?? 0) + 1; return acc },
    { base: 0, build: 0, specific: 0, taper: 0, race: 0 } as Record<Phase, number>,
  )

  const rationale: string[] = []
  if (postRaceWeeksApplied > 0 && input.recentRace) {
    rationale.push(
      `Récupération post-course : ${postRaceWeeksApplied} semaine${postRaceWeeksApplied > 1 ? 's' : ''} de reverse taper ` +
      `après ${input.recentRace.distanceKm} km / ${input.recentRace.elevationM} m D+ ` +
      `(durée de récup ∝ distance + dénivelé excentrique) avant de relancer la charge.`,
    )
  }
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
  const secs = (input.secondaryRaces ?? []).filter((r) => r.dateISO > input.todayISO && r.dateISO < input.raceDateISO)
  if (secs.length > 0) {
    rationale.push(
      `Course${secs.length > 1 ? 's' : ''} secondaire${secs.length > 1 ? 's' : ''} intégrée${secs.length > 1 ? 's' : ''} : ` +
      `${secs.map((r) => `${r.name} (${r.priority})`).join(', ')} — rodage (C) ou mini-affûtage (B), sans casser la prépa de la course principale.`,
    )
  }
  if (input.motivation && input.motivation !== 'mix') {
    const b = motivationBias(input.motivation)
    rationale.push(`Orientation ${b.label} : ${b.note}`)
  }
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
