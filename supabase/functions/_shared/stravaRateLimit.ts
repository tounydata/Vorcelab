// Lecture des en-têtes de quota Strava et arrêt PRÉVENTIF.
//
// Strava publie l'état du quota sur chaque réponse :
//   X-RateLimit-Limit:      "100,1000"   → plafond 15 min, plafond quotidien
//   X-RateLimit-Usage:      "23,412"     → consommation 15 min, consommation du jour
//   X-ReadRateLimit-Limit / X-ReadRateLimit-Usage : mêmes valeurs pour les lectures
//
// La documentation « Adjustment Requests » de Strava désigne nommément le défaut que
// ce module corrige : « Backfill is causing you to hit your 15-minute rate limits →
// Check API response headers and throttle back requests when necessary. »
//
// Avant : le code ne lisait aucun de ces en-têtes. Il fonçait jusqu'à provoquer un 429,
// puis s'arrêtait. Atteindre le 429 EST le symptôme que Strava reproche — un client
// correct n'y arrive jamais, il ralentit avant.
//
// Après : chaque réponse met à jour l'état du quota, et l'appelant demande
// `shouldStop()` avant chaque nouvel appel. On s'arrête à une marge du plafond, ce qui
// laisse de la place aux appels INTERACTIFS (un utilisateur qui ouvre une activité) —
// un backfill de fond ne doit jamais consommer le dernier pourcent du quota.

/** Part du quota réservée aux appels interactifs. Le fond s'arrête à 90 %. */
export const BACKGROUND_BUDGET_RATIO = 0.9

export interface RateLimitState {
  /** Consommation sur la fenêtre de 15 minutes. */
  shortUsage: number
  /** Plafond sur la fenêtre de 15 minutes. */
  shortLimit: number
  /** Consommation sur la journée. */
  dailyUsage: number
  /** Plafond quotidien. */
  dailyLimit: number
  /** Instant de la dernière lecture d'en-tête. */
  readAt: string
}

/** `"23,412"` → `[23, 412]`. Renvoie `null` si l'en-tête est absent ou illisible. */
function parsePair(raw: string | null): [number, number] | null {
  if (!raw) return null
  const parts = raw.split(',').map((p) => Number(p.trim()))
  if (parts.length < 2) return null
  if (!Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return [parts[0], parts[1]]
}

/**
 * Extrait l'état du quota d'une réponse Strava.
 *
 * Les en-têtes de LECTURE sont préférés quand ils sont présents : le backfill ne fait
 * que lire, et ce quota-là est celui qui le concerne. À défaut, on retombe sur les
 * en-têtes globaux.
 *
 * Renvoie `null` si la réponse ne porte aucun en-tête exploitable — l'appelant
 * conserve alors son état précédent plutôt que de repartir de zéro.
 */
export function readRateLimit(res: Response): RateLimitState | null {
  const limit =
    parsePair(res.headers.get('x-readratelimit-limit')) ??
    parsePair(res.headers.get('x-ratelimit-limit'))
  const usage =
    parsePair(res.headers.get('x-readratelimit-usage')) ??
    parsePair(res.headers.get('x-ratelimit-usage'))

  if (!limit || !usage) return null

  return {
    shortLimit: limit[0],
    dailyLimit: limit[1],
    shortUsage: usage[0],
    dailyUsage: usage[1],
    readAt: new Date().toISOString(),
  }
}

/**
 * Faut-il arrêter les appels de fond ?
 *
 * `true` dès que l'une des deux fenêtres dépasse la part allouée au fond. Un état
 * absent (aucun en-tête lu pour l'instant) ne bloque pas : on laisse partir le premier
 * appel, c'est lui qui renseignera l'état.
 */
export function shouldStopBackground(
  state: RateLimitState | null,
  ratio = BACKGROUND_BUDGET_RATIO,
): boolean {
  if (!state) return false
  if (state.shortLimit > 0 && state.shortUsage >= state.shortLimit * ratio) return true
  if (state.dailyLimit > 0 && state.dailyUsage >= state.dailyLimit * ratio) return true
  return false
}

/** Résumé compact pour les journaux et la réponse d'une fonction de maintenance. */
export function describeRateLimit(state: RateLimitState | null): Record<string, unknown> | null {
  if (!state) return null
  return {
    short: `${state.shortUsage}/${state.shortLimit}`,
    daily: `${state.dailyUsage}/${state.dailyLimit}`,
    read_at: state.readAt,
  }
}
