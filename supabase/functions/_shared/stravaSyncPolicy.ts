// Politique d'appel de la synchronisation Strava manuelle.
//
// Les nouvelles activités arrivent par WEBHOOK, en temps réel : la synchronisation
// manuelle n'est qu'un filet de sécurité. Sans garde, le bouton « Synchroniser »
// relançait une pagination complète à chaque clic — plusieurs appels d'API pour
// re-télécharger des activités déjà en base, déclenchés par un simple double-clic.
// C'est précisément le motif « API usage is not optimized for the requests being made ».
//
// Une synchronisation manuelle est donc ignorée si une autre vient d'avoir lieu. La
// synchronisation COMPLÈTE (première connexion, réparation explicite) n'est jamais
// bridée : elle est rare et intentionnelle.

/** Délai minimal entre deux synchronisations manuelles incrémentales. */
export const MANUAL_SYNC_COOLDOWN_MS = 5 * 60 * 1000

export interface SyncDecision {
  /** Vrai si l'appel doit être ignoré sans toucher à l'API Strava. */
  skip: boolean
  /** Secondes restantes avant qu'une nouvelle synchronisation soit utile. */
  retryAfterSeconds: number
}

export function decideManualSync(
  lastSyncAt: string | null | undefined,
  options: { full?: boolean; now?: number; cooldownMs?: number } = {},
): SyncDecision {
  const { full = false, now = Date.now(), cooldownMs = MANUAL_SYNC_COOLDOWN_MS } = options

  if (full) return { skip: false, retryAfterSeconds: 0 }
  if (!lastSyncAt) return { skip: false, retryAfterSeconds: 0 }

  const last = Date.parse(lastSyncAt)
  // Horodatage illisible : on ne bride pas sur une valeur qu'on ne sait pas lire.
  if (!Number.isFinite(last)) return { skip: false, retryAfterSeconds: 0 }

  // Un `last_sync_at` dans le futur (horloge décalée) ne doit pas bloquer indéfiniment :
  // seul un écart positif et inférieur au délai déclenche l'attente.
  const elapsed = now - last
  if (elapsed < 0 || elapsed >= cooldownMs) return { skip: false, retryAfterSeconds: 0 }

  return { skip: true, retryAfterSeconds: Math.ceil((cooldownMs - elapsed) / 1000) }
}
