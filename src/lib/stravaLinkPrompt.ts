import { hasRequiredStravaActivityScope } from './stravaScopes'

// État du lien Strava d'un athlète, du point de vue du MOTEUR : ce qui compte n'est pas
// « a-t-il cliqué sur Strava ? » mais « Vorcelab peut-il lire ses sorties ? ».
//
// Deux façons distinctes de rater le lien, constatées en production :
//   • `not_connected`   — aucun jeton. Le flux OAuth n'est jamais allé au bout, ou
//                          l'athlète a lié Strava sur un AUTRE compte Vorcelab.
//   • `missing_scope`   — compte lié, mais la case « activités » n'a pas été cochée.
//                          Le compte apparaît connecté alors que rien n'est lisible :
//                          c'est le cas le plus trompeur, et le plus silencieux.
//
// Dans les deux cas l'athlète voit une app vide sans comprendre pourquoi, et rien dans
// le produit ne le lui disait. D'où l'invite ci-dessous.

export type StravaLinkState = 'ok' | 'not_connected' | 'missing_scope'

export interface StravaLinkStatus {
  connected?: boolean | null
  /** Renseigné par `strava-status` ; on retombe sur le scope brut s'il manque. */
  activity_access_granted?: boolean | null
  scope?: string | null
}

export function classifyStravaLink(status: StravaLinkStatus | null | undefined): StravaLinkState {
  if (!status || status.connected !== true) return 'not_connected'

  // `activity_access_granted` fait autorité quand le serveur le renvoie. Sinon on
  // retombe sur le scope brut : un jeton `read` seul ne donne accès à aucune activité.
  const granted = status.activity_access_granted === true
    || (status.activity_access_granted == null && hasRequiredStravaActivityScope(status.scope))

  return granted ? 'ok' : 'missing_scope'
}

/** L'invite ne s'affiche que si le moteur ne peut RIEN lire. */
export function shouldPromptStravaLink(state: StravaLinkState): boolean {
  return state !== 'ok'
}
