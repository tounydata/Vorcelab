// Sélectionne la course RÉCEMMENT DISPUTÉE qui mérite un pop-up « Comment s'est passée
// ta course ? » : une course du calendrier datée dans les derniers jours, pas encore
// liée à une activité Strava, et non déjà écartée par le coureur. Suggère l'activité
// à lier (auto-détection). 100 % pur, testable, sans réseau ni état global.

import { findRaceActivity, type ActivityLite } from './raceComparison'

export interface RaceCalendarRow {
  id: string
  name?: string | null
  date: string                     // 'YYYY-MM-DD' (jour de la course)
  distance?: number | null         // km
  start_time?: string | null
  result_activity_id?: string | null
}

export interface RacePromptResult {
  race: RaceCalendarRow
  /** Activité Strava auto-détectée à proposer à la liaison (ou null si aucune évidente). */
  suggestion: ActivityLite | null
}

/**
 * Renvoie la course à proposer au débrief, ou null.
 * Critères : course passée (date ≤ aujourd'hui) dans les `windowDays` derniers jours,
 * sans `result_activity_id`, non présente dans `dismissedIds`. La plus RÉCENTE d'abord.
 */
export function pickRacePrompt(
  races: RaceCalendarRow[],
  activities: Record<string, unknown>[],
  dismissedIds: string[],
  now: number = Date.now(),
  windowDays = 10,
): RacePromptResult | null {
  const dismissed = new Set(dismissedIds)
  const todayEnd = now
  const windowStart = now - windowDays * 86_400_000

  const candidates = (races ?? [])
    .filter((r) => {
      if (!r?.id || !r.date) return false
      if (r.result_activity_id) return false      // déjà liée
      if (dismissed.has(r.id)) return false        // déjà écartée
      // Jour de course (fin de journée) : la course est « passée » dès le lendemain 00:00,
      // mais on la propose déjà le soir du jour J.
      const raceDayMs = new Date(r.date + 'T23:59:59').getTime()
      if (!Number.isFinite(raceDayMs)) return false
      return raceDayMs <= todayEnd + 86_400_000 && new Date(r.date + 'T00:00:00').getTime() >= windowStart
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (!candidates.length) return null
  const race = candidates[0]
  const distM = race.distance != null ? race.distance * 1000 : 0
  const suggestion = findRaceActivity(activities, race.date + 'T' + (race.start_time || '09:00') + ':00', distM)
  return { race, suggestion }
}
