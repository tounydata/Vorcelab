// Évalue l'état de PRÉPARATION avec lequel le coureur abordait une course, à partir
// de sa charge d'entraînement AVANT le jour J. Sert au débrief à distinguer un
// résultat qui reflète un manque de fond récent (désentraînement) d'une vraie
// faiblesse structurelle à travailler. 100 % pur, testable, sans réseau.
//
// Méthode : on compare la charge des 6 semaines précédant la course (fenêtre
// « affûtage/spécifique ») à la charge habituelle de l'athlète sur les ~4 mois
// d'avant (sa base), ramenée à 42 j. Un ratio bas = arrivé sous-préparé.

import { computeActivityLoad, type ActivityForLoad } from './trainingLoad'

export type PreparationStatus = 'undertrained' | 'ready' | 'high' | 'unknown'

export interface RacePreparation {
  status: PreparationStatus
  /** Charge des 42 j avant la course vs ta base habituelle (100 = ton niveau normal). */
  loadRatioPct: number | null
  /** Nombre de courses à pied dans les 42 j avant la course. */
  runCount42: number
  /** Plus longue course (km) dans les 42 j avant la course — spécificité distance. */
  longestRunKm: number | null
  /** true = nettement sous ta base habituelle (préparation légère). */
  weeksLow: boolean
}

const D = 86_400_000
function isRun(t?: string | null): boolean {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(t ?? '')
}

export function assessRacePreparation(
  activities: ActivityForLoad[],
  raceDateISO: string,
  fcMax?: number | null,
): RacePreparation {
  const unknown: RacePreparation = { status: 'unknown', loadRatioPct: null, runCount42: 0, longestRunKm: null, weeksLow: false }
  const raceMs = new Date(raceDateISO).getTime()
  if (!Number.isFinite(raceMs)) return unknown

  const runs = (activities ?? [])
    .filter((a) => isRun(a.sport_type ?? a.type) && a.start_date)
    .map((a) => ({ a, t: new Date(a.start_date).getTime() }))
    .filter((x) => Number.isFinite(x.t) && x.t < raceMs) // uniquement AVANT la course

  const pre = runs.filter((x) => raceMs - x.t <= 42 * D)                       // 6 sem avant
  const base = runs.filter((x) => raceMs - x.t > 42 * D && raceMs - x.t <= 182 * D) // 4 mois d'avant

  const sum = (arr: typeof runs) => arr.reduce((s, x) => s + computeActivityLoad(x.a, fcMax), 0)
  const preLoad = sum(pre)
  const runCount42 = pre.length
  const longestRunKm = pre.length ? Math.max(...pre.map((x) => (x.a.distance ?? 0) / 1000)) : null

  // Base insuffisante (peu d'historique) → on ne juge pas la préparation (pas d'invention).
  const baseSum = sum(base)
  if (base.length < 8 || baseSum <= 0) return { ...unknown, runCount42, longestRunKm }

  const base42 = baseSum * (42 / 140) // base ramenée à une fenêtre de 42 j
  const loadRatioPct = Math.round((preLoad / base42) * 100)
  let status: PreparationStatus = 'ready'
  if (loadRatioPct < 65) status = 'undertrained'
  else if (loadRatioPct > 150) status = 'high'
  return { status, loadRatioPct, runCount42, longestRunKm, weeksLow: loadRatioPct < 75 }
}
