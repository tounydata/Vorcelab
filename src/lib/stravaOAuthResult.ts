export type StravaRedirectFailureResult =
  | 'denied'
  | 'missing_scope'
  | 'wrong_athlete'
  | 'already_linked'
  | 'error'

export type StravaRedirectResult =
  | 'connected'
  | StravaRedirectFailureResult
  | null

interface OAuthErrorPayload {
  code?: unknown
}

export function classifyStravaOAuthFailure(payload: unknown): StravaRedirectFailureResult {
  const code = payload && typeof payload === 'object'
    ? (payload as OAuthErrorPayload).code
    : null

  if (code === 'missing_activity_scope') return 'missing_scope'
  if (code === 'different_strava_athlete') return 'wrong_athlete'
  if (code === 'strava_athlete_already_linked') return 'already_linked'
  return 'error'
}

export function parseStoredStravaOAuthFailure(
  value: string | null,
): StravaRedirectFailureResult | null {
  if (
    value === 'denied' ||
    value === 'missing_scope' ||
    value === 'wrong_athlete' ||
    value === 'already_linked' ||
    value === 'error'
  ) {
    return value
  }
  return null
}

export function stravaOAuthFailureMessage(
  result: StravaRedirectFailureResult | null,
): string | null {
  if (result === 'denied') {
    return 'Autorisation annulée sur Strava. Réessaie puis valide le bouton Autoriser.'
  }
  if (result === 'missing_scope') {
    return 'La permission activités n’a pas été accordée par Strava.'
  }
  if (result === 'wrong_athlete') {
    return 'Le navigateur est connecté à un autre compte Strava que celui déjà lié à ce profil Vorcelab. Aucun compte ni aucune donnée n’ont été modifiés.'
  }
  if (result === 'already_linked') {
    return 'Ce compte Strava est déjà utilisé par un autre compte Vorcelab. Aucun changement n’a été enregistré.'
  }
  if (result === 'error') {
    return 'Strava a répondu, mais Vorcelab n’a pas pu enregistrer l’autorisation. L’échec est visible dans le journal admin.'
  }
  return null
}
