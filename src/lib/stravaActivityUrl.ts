/**
 * URL publique d'une activité sur Strava.
 *
 * Séparée du composant pour être testable : les Brand Guidelines Strava exigent que
 * toute donnée d'activité affichée renvoie vers l'activité d'origine, et un lien
 * silencieusement mal formé (identifiant nul, `bigint` arrondi) casserait cette
 * exigence sans que rien ne le signale.
 *
 * L'identifiant n'est JAMAIS converti en `number` : au-delà de 2^53 la conversion
 * perdrait des chiffres et pointerait vers l'activité d'un autre athlète.
 */
const STRAVA_ACTIVITY_BASE = 'https://www.strava.com/activities'

export function stravaActivityUrl(
  id: number | string | bigint | null | undefined,
): string | null {
  if (id === null || id === undefined) return null
  const raw = String(id).trim()
  // Un identifiant Strava est un entier positif : tout le reste (chaîne vide, `NaN`,
  // fragment d'URL) est rejeté plutôt que concaténé.
  if (!/^\d{1,20}$/.test(raw)) return null
  if (/^0+$/.test(raw)) return null
  return `${STRAVA_ACTIVITY_BASE}/${raw}`
}
