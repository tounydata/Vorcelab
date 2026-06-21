// Appariement séance prévue ↔ activité Strava (V1) — PUR et testable.
// Ne décide jamais seul : renvoie des candidates classées que l'athlète CONFIRME.
// Semaine bornée lundi → dimanche (règle produit).

export interface MatchableActivity {
  start_date: string
  sport_type?: string | null
  type?: string | null
  moving_time?: number | null // secondes
  distance?: number | null     // mètres
}

export interface ActivityCandidate<T> {
  activity: T
  /** Jour de la semaine de l'activité (1=lundi … 7=dimanche). */
  dayOfWeek: number
  /** Score de pertinence décroissant (proximité jour + durée plausible). */
  score: number
}

const RUN_SPORTS = new Set(['run', 'trailrun', 'virtualrun'])

function isRun(a: MatchableActivity): boolean {
  const s = (a.sport_type ?? a.type ?? '').toLowerCase()
  return RUN_SPORTS.has(s)
}

/** 1=lundi … 7=dimanche, à partir d'une date ISO (locale du navigateur). */
function dow(iso: string): number {
  return ((new Date(iso).getDay() + 6) % 7) + 1
}

/** Nombre de jours (entiers) entre deux dates ISO. */
function dayDiff(aISO: string, bISO: string): number {
  const a = new Date(aISO).getTime()
  const b = new Date(bISO).getTime()
  return Math.abs(a - b) / 86_400_000
}

/**
 * Candidates d'activités pour une séance prévue, classées par pertinence.
 * - Filtre : course à pied uniquement, dans la semaine [lundi, lundi+7j[.
 * - Classe : proximité au jour prévu (poids fort) + durée plausible vs attendue.
 * `plannedDayOfWeek` : 1..7 ; `expectedDurationMin` : null si inconnu.
 */
export function matchCandidates<T extends MatchableActivity>(
  weekStartISO: string,
  plannedDayOfWeek: number,
  expectedDurationMin: number | null,
  activities: readonly T[],
): ActivityCandidate<T>[] {
  const weekStart = new Date(weekStartISO + (weekStartISO.length <= 10 ? 'T00:00:00' : '')).getTime()
  const weekEnd = weekStart + 7 * 86_400_000
  const plannedISO = new Date(weekStart + (plannedDayOfWeek - 1) * 86_400_000).toISOString()

  const out: ActivityCandidate<T>[] = []
  for (const a of activities) {
    if (!isRun(a)) continue
    const t = new Date(a.start_date).getTime()
    if (Number.isNaN(t) || t < weekStart || t >= weekEnd) continue

    // Pénalité de proximité jour (0 = même jour) puis de durée.
    const dDay = dayDiff(a.start_date, plannedISO)
    let score = 100 - dDay * 15
    if (expectedDurationMin && a.moving_time) {
      const actualMin = a.moving_time / 60
      const ratio = actualMin / expectedDurationMin
      // Pénalise les écarts de durée importants (séance bien plus courte/longue).
      score -= Math.min(30, Math.abs(1 - ratio) * 30)
    }
    out.push({ activity: a, dayOfWeek: dow(a.start_date), score: Math.round(score) })
  }
  return out.sort((x, y) => y.score - x.score)
}
