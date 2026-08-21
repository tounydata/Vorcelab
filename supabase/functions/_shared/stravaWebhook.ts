// Décisions PURES prises sur un événement webhook Strava.
//
// Deux défauts sont corrigés ici, tous deux cités par Strava sous « API usage is not
// optimized for the requests being made » :
//
//  1. Un événement `update` déclenchait systématiquement un GET /activities/{id}.
//     Or Strava JOINT le détail de la modification dans `updates` (titre, type,
//     visibilité). Renommer une sortie coûtait un appel d'API pour ré-obtenir un objet
//     dont on connaissait déjà le seul champ modifié. Le renommage est le plus fréquent
//     des événements `update` : il est désormais appliqué en base, sans appel.
//
//  2. Strava REJOUE un événement tant qu'il n'a pas reçu de 200 (et peut le rejouer
//     malgré un 200 perdu en route). Sans clé d'idempotence, chaque rejeu refaisait
//     l'appel. La clé (owner, object, aspect, event_time) identifie l'événement de
//     façon stable et rend le traitement idempotent.
//
// Ces fonctions ne touchent ni le réseau ni la base : elles sont directement testables.

export type WebhookUpdates = Record<string, unknown> | undefined | null

export interface ActivityUpdatePlan {
  /** Colonnes de `strava_activities` applicables SANS appel Strava. */
  patch: Record<string, unknown>
  /** L'activité vient de passer en privé côté Strava. */
  becamePrivate: boolean
  /** Vrai si un GET /activities/{id} reste nécessaire pour rester exact. */
  needsFetch: boolean
}

/** Champs de `updates` que l'on sait appliquer localement, sans rien redemander. */
const LOCALLY_APPLICABLE = new Set(['title', 'type', 'private', 'authorized'])

/**
 * Que faire d'un événement `activity/update` ?
 *
 * `updates` absent ou vide → Strava signale un changement sans le décrire : il FAUT
 * relire l'activité. Un champ inconnu → prudence, on relit aussi. Sinon, tout est
 * applicable en base et aucun appel n'est émis.
 */
export function planActivityUpdate(updates: WebhookUpdates): ActivityUpdatePlan {
  const patch: Record<string, unknown> = {}
  let becamePrivate = false

  const keys = updates ? Object.keys(updates) : []
  if (keys.length === 0) return { patch, becamePrivate, needsFetch: true }

  for (const key of keys) {
    const value = (updates as Record<string, unknown>)[key]
    if (key === 'title' && typeof value === 'string' && value.length > 0) {
      patch.name = value
    } else if (key === 'type' && typeof value === 'string' && value.length > 0) {
      // Strava n'envoie qu'un libellé : il alimente les deux colonnes, que le reste de
      // l'app lit indifféremment (`sport_type ?? type`).
      patch.type = value
      patch.sport_type = value
    } else if (key === 'private') {
      becamePrivate = String(value) === 'true'
    }
  }

  const needsFetch = keys.some((k) => !LOCALLY_APPLICABLE.has(k))
  return { patch, becamePrivate, needsFetch }
}

/**
 * L'événement provient-il de NOTRE abonnement webhook ?
 *
 * L'URL du webhook est publique et non signée : n'importe qui peut y poster un JSON.
 * Sans ce filtre, un tiers pouvait faire émettre des appels vers l'API Strava en notre
 * nom — consommation de quota déclenchée de l'extérieur, et écritures en base sur des
 * athlètes choisis par l'appelant.
 *
 * `STRAVA_SUBSCRIPTION_ID` non renseigné → on accepte (déploiement pas encore
 * configuré), en le signalant à l'appelant pour journalisation.
 */
export function isTrustedSubscription(
  eventSubscriptionId: unknown,
  expected: string | undefined | null,
): { trusted: boolean; unconfigured: boolean } {
  const raw = (expected ?? '').trim()
  if (!raw) return { trusted: true, unconfigured: true }
  return { trusted: String(eventSubscriptionId) === raw, unconfigured: false }
}

/**
 * Clé d'idempotence d'un événement. `event_time` en fait partie : deux modifications
 * successives de la MÊME activité sont deux événements distincts à traiter, alors que
 * le rejeu de l'une d'elles porte exactement la même clé.
 */
export function webhookEventKey(event: {
  owner_id: number | string
  object_id: number | string
  aspect_type: string
  event_time?: number | string | null
}): string {
  return [event.owner_id, event.object_id, event.aspect_type, event.event_time ?? ''].join(':')
}
