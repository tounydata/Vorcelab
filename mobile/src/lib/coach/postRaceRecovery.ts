// Récupération post-course — règle déterministe (cf. docs/coach/session-analysis.md).
// Après une course terminée, le coach doit démarrer le nouveau programme par un bloc
// de récupération (reverse taper) AVANT de relancer la charge. La durée dépend de la
// distance ET du dénivelé (la descente = dommages excentriques qui allongent la récup).
//
// Science : la récup post-compétition n'est pas un forfait fixe — elle est proportionnelle
// à la demande de la course. Repères grand public + littérature :
//  - 5K-10K : quelques jours (~3-5 j).
//  - semi : ~1 semaine.
//  - marathon : ~2 semaines (« reverse taper » ; dommages musculaires, baisse immunitaire,
//    fatigue du SNC). C'est le repère « 2 semaines » classique.
//  - ultra (50 mi → 100 mi+) : ~3-4 semaines, d'autant plus que le D− est important.
//  Le dénivelé (contractions excentriques en descente : perte de force ~4 j, CK élevé)
//  rallonge la récupération musculaire → surcharge ajoutée au prorata du D+.
// Réf : Galloway (reverse taper) · Daniels/Pfitzinger (récup marathon) · dommages
//       descente (PMC11129977) · durabilité/immunité post-effort prolongé.

export interface CompletedRace {
  /** Date de la course (ISO yyyy-mm-dd). */
  dateISO: string
  distanceKm: number
  elevationM: number
}

const DAY_MS = 86_400_000

/**
 * Jours de récupération recommandés selon la distance et le D+ de la course.
 * Buckets de distance + surcharge excentrique liée au dénivelé.
 */
export function recoveryDaysForRace(distanceKm: number, elevationM = 0): number {
  let days =
    distanceKm <= 12 ? 4 :   // 5K-10K
    distanceKm <= 25 ? 8 :   // ~semi
    distanceKm <= 35 ? 11 :  // 30K
    distanceKm <= 50 ? 14 :  // marathon / 50K  → repère « 2 semaines »
    distanceKm <= 90 ? 21 :  // 50 mi / 80K
    28                       // 100K+
  // Surcharge excentrique : le D+ (donc le D−) allonge la récup musculaire.
  if (elevationM >= 2500) days += 7
  else if (elevationM >= 1200) days += 4
  else if (elevationM >= 500) days += 2
  return days
}

export interface PostRaceRecovery {
  /** Durée totale de récup recommandée (jours). */
  totalDays: number
  /** Jours écoulés depuis la course (≥ 0). */
  daysElapsed: number
  /** Jours de récup restants à intégrer dans le plan. */
  daysRemaining: number
  /** Nombre de semaines de plan à passer en récup (reverse taper), borné à 3. */
  recoveryWeeks: number
  /** true si on est encore dans la fenêtre de récup post-course. */
  inWindow: boolean
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00').getTime()
  const b = new Date(toISO + 'T00:00:00').getTime()
  return Math.round((b - a) / DAY_MS)
}

/**
 * Calcule l'état de récup post-course à `todayISO`. Renvoie null si la course est
 * dans le futur (non concernée) ou si la distance est inconnue/nulle (pas fiable).
 */
export function computePostRaceRecovery(race: CompletedRace, todayISO: string): PostRaceRecovery | null {
  if (!race.distanceKm || race.distanceKm <= 0) return null
  const daysElapsed = daysBetween(race.dateISO, todayISO)
  if (daysElapsed < 0) return null // course future
  const totalDays = recoveryDaysForRace(race.distanceKm, race.elevationM)
  const daysRemaining = Math.max(0, totalDays - daysElapsed)
  const inWindow = daysRemaining > 0
  const recoveryWeeks = inWindow ? Math.min(3, Math.ceil(daysRemaining / 7)) : 0
  return { totalDays, daysElapsed, daysRemaining, recoveryWeeks, inWindow }
}
