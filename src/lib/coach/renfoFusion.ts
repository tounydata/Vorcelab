// src/lib/coach/renfoFusion.ts
// FUSION RENFO ↔ COURSE — place les séances de renforcement DANS la semaine du
// plan course, en respectant l'entraînement concurrent. 100 % déterministe, pur.
//
// Fondements (entraînement concurrent force ↔ endurance) :
//  • La force lourde / pliométrie crée de la fatigue neuromusculaire : on ne la
//    place JAMAIS la veille d'une séance clé (qualité, sortie longue, course) —
//    l'interférence dégraderait la séance course (Hickson ; recommandations ≥ 6 h /
//    idéalement jours distincts).
//  • Principe « jours durs durs, jours faciles faciles » (Seiler / Uphill Athlete) :
//    on EMPILE le renfo lourd sur un jour de qualité (renfo APRÈS la course), pour
//    garder les jours faciles réellement faciles.
//  • Synchronisation à la périodisation course (co-périodisation, runningPhaseToDUP) :
//    force en base, volume en build, puissance en spécifique, DÉCHARGE en taper/course
//    — aucun nouveau stimulus de force lourde près du jour J.
//  • Bénéfice établi : force + pliométrie améliorent l'économie de course et
//    réduisent les blessures (méta-analyse Lauersen 2014 ; Blagrove ; Beattie).

import type { Phase, WorkoutSystem } from './workouts'
import type { PlanWeek, PlannedSession } from './planGenerator'
import { runningPhaseToDUP } from '../renfoUtils'

export interface RenfoSlot {
  /** 1 = lundi … 7 = dimanche. */
  dayOfWeek: number
  /** Clé FOCUS_META (force_lourde, pliometrie, tronc, mobilite, …). */
  focus: string
  /** Renfo lourd bas-corps (contraintes de placement) vs léger (souple). */
  heavy: boolean
  /** Pourquoi ce jour (transparence). */
  rationale: string
}

export interface RenfoFusion {
  /** Phase DUP renfo dérivée de la phase course. */
  dupPhase: 'force' | 'volume' | 'puissance' | 'deload'
  slots: RenfoSlot[]
  /** Note d'ensemble (placement / co-périodisation). */
  note: string
}

const DAY_NAMES = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

// Systèmes course « clés » (à protéger d'un renfo lourd la veille).
const KEY_SYSTEMS = new Set<WorkoutSystem>([
  'threshold', 'vo2max', 'tempo', 'hills', 'descent', 'speed', 'race_pace', 'race', 'long',
])

function isKeyRun(s: PlannedSession): boolean {
  return s.intensity === 'hard' || KEY_SYSTEMS.has(s.system)
}

const HEAVY_FOCUS: Record<'force' | 'volume' | 'puissance', string> = {
  force: 'force_lourde',
  volume: 'force_lourde',
  puissance: 'pliometrie',
}
const LIGHT_FILLERS = ['tronc', 'mobilite', 'yoga_coureur']
const DELOAD_FOCUSES = ['mobilite', 'yoga_coureur', 'stretching']
const HEAVY_FOCUSES = new Set(['force_lourde', 'pliometrie', 'excentrique'])

/**
 * Construit la liste des focus renfo de la semaine selon la phase course et le
 * nombre de séances/semaine.
 *  • `recovery` (décharge/affûtage OU récup post-course) : UNIQUEMENT du léger —
 *    on est en DOMS/fatigue, donc pas de force lourde, pliométrie ni excentrique
 *    (knowledge §9 : « pas de plio/excentrique en état de fatigue/DOMS »).
 *  • `avoid` (co-périodisation, fatigue récente) : on ne programme jamais un focus
 *    à éviter cette semaine — c'est la MÊME source que les badges « à éviter ».
 *  • Lourd plafonné à **1×/sem** (knowledge §9 : maintien ~1×/sem ; le 2×/sem n'est
 *    réservé qu'au bloc force-max dédié, pas un défaut imposé à tous).
 */
function weeklyFocuses(phase: Phase, sessionsPerWeek: number, opts: { recovery: boolean; avoid: Set<string> }): { focus: string; heavy: boolean }[] {
  const dup = runningPhaseToDUP(phase)
  const n = Math.max(0, Math.min(6, sessionsPerWeek))
  if (n === 0) return []

  const lightPool = LIGHT_FILLERS.filter((f) => !opts.avoid.has(f))
  const fillers = lightPool.length > 0 ? lightPool : LIGHT_FILLERS
  const light = (i: number) => ({ focus: fillers[i % fillers.length], heavy: false })

  if (opts.recovery || dup === 'deload') {
    const dl = DELOAD_FOCUSES.filter((f) => !opts.avoid.has(f))
    const pool = dl.length > 0 ? dl : DELOAD_FOCUSES
    return Array.from({ length: n }, (_, i) => ({ focus: pool[i % pool.length], heavy: false }))
  }

  const heavyFocus = HEAVY_FOCUS[dup]
  // Un seul créneau lourd par semaine, et zéro si la fatigue récente l'interdit.
  const heavyCount = opts.avoid.has(heavyFocus) ? 0 : 1
  const out: { focus: string; heavy: boolean }[] = []
  for (let i = 0; i < n; i++) {
    out.push(i < heavyCount ? { focus: heavyFocus, heavy: true } : light(i - heavyCount))
  }
  return out
}

/**
 * Fusionne le renfo dans la semaine course. `sessionsPerWeek` vient du profil renfo.
 * `avoid` = focus à éviter cette semaine (co-périodisation, fatigue récente) — passé
 * pour que la séance PROPOSÉE et le badge « à éviter » ne se contredisent jamais.
 * Renvoie `null` si pas de renfo configuré (rien à afficher).
 */
export function fuseRenfoIntoWeek(
  week: PlanWeek,
  sessionsPerWeek: number | null | undefined,
  avoid: Set<string> = new Set(),
): RenfoFusion | null {
  const n = sessionsPerWeek ?? 0
  if (n <= 0) return null
  const recovery = week.isPostRaceRecovery === true
  const dupPhase: RenfoFusion['dupPhase'] = recovery ? 'deload' : runningPhaseToDUP(week.phase)

  // Cartographie des jours course de la semaine.
  const runByDay = new Map<number, PlannedSession[]>()
  for (const s of week.sessions) {
    const arr = runByDay.get(s.dayOfWeek) ?? []
    arr.push(s)
    runByDay.set(s.dayOfWeek, arr)
  }
  const keyDays = new Set<number>()
  let raceDay: number | null = null
  for (const [d, ss] of runByDay) {
    if (ss.some(isKeyRun)) keyDays.add(d)
    if (ss.some((s) => s.system === 'race')) raceDay = d
  }
  const allDays = [1, 2, 3, 4, 5, 6, 7]
  const restDays = allDays.filter((d) => !runByDay.has(d))
  const easyDays = allDays.filter((d) => runByDay.has(d) && !keyDays.has(d))

  // Un jour est « interdit la veille d'une séance clé » pour le renfo lourd.
  const eveOfKey = (d: number): boolean => d < 7 && keyDays.has(d + 1)
  const usable = (d: number): boolean => d !== raceDay

  const focuses = weeklyFocuses(week.phase, n, { recovery, avoid })
  const assigned = new Set<number>()
  const slots: RenfoSlot[] = []

  const placeOn = (candidates: number[], used: Set<number>): number | null => {
    for (const d of candidates) {
      if (used.has(d) || !usable(d)) continue
      return d
    }
    return null
  }

  for (const f of focuses) {
    let day: number | null = null
    let why = ''
    if (f.heavy) {
      // 1) Empiler sur un jour de qualité (renfo APRÈS la course) — hors course.
      const stack = [...keyDays].filter((d) => d !== raceDay).sort((a, b) => a - b)
      day = placeOn(stack, assigned)
      if (day != null) {
        why = `Couplé à ta séance qualité du ${DAY_NAMES[day]} (renfo APRÈS la course) — on garde les jours faciles faciles.`
      } else {
        // 2) Jour sans course, jamais la veille d'une séance clé.
        const safeRest = restDays.filter((d) => !eveOfKey(d))
        day = placeOn(safeRest, assigned)
        if (day != null) why = `Jour sans course (${DAY_NAMES[day]}) — placé loin de tes séances clés.`
      }
      if (day == null) {
        // 3) Repli : jour facile non suivi d'une séance clé.
        const safeEasy = easyDays.filter((d) => !eveOfKey(d))
        day = placeOn(safeEasy, assigned)
        if (day != null) why = `Après ton footing du ${DAY_NAMES[day]} — pas de séance clé le lendemain.`
      }
    } else {
      // Renfo léger (gainage, mobilité, yoga) : souple, sur jour facile ou repos.
      day = placeOn([...restDays, ...easyDays], assigned)
      if (day != null) why = `Séance légère (récup active) — placée sur un jour calme (${DAY_NAMES[day]}).`
    }
    // Dernier repli : n'importe quel jour libre hors course.
    if (day == null) {
      day = placeOn(allDays, assigned)
      if (day != null) why = `Placé le ${DAY_NAMES[day]} (jour disponible).`
    }
    if (day == null) break // semaine pleine
    assigned.add(day)
    slots.push({ dayOfWeek: day, focus: f.focus, heavy: f.heavy && HEAVY_FOCUSES.has(f.focus), rationale: why })
  }

  slots.sort((a, b) => a.dayOfWeek - b.dayOfWeek)

  const note =
    recovery
      ? 'Récup post-course : renfo léger uniquement (mobilité, gainage, yoga) — pas de force lourde ni pliométrie tant que tes jambes encaissent encore la course.'
      : dupPhase === 'deload'
        ? 'Phase d\'affûtage/décharge : renfo léger uniquement (mobilité, gainage) — aucun nouveau stimulus de force lourde près du jour J.'
        : `Renfo synchronisé à ta phase course (${dupPhase}), 1 créneau lourd max/semaine, placé pour ne jamais fatiguer tes jambes la veille d'une séance clé.`

  return { dupPhase, slots, note }
}

// Libellés courts par focus (pour l'affichage, indépendant de renfoData).
export const RENFO_FOCUS_SHORT: Record<string, string> = {
  force_lourde: 'Force lourde',
  pliometrie: 'Pliométrie',
  excentrique: 'Excentrique',
  tronc: 'Gainage / tronc',
  haut_corps: 'Haut du corps',
  mobilite: 'Mobilité',
  yoga_coureur: 'Yoga coureur',
  stretching: 'Stretching',
  pilates_coureur: 'Pilates',
}
