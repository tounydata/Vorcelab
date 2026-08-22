/**
 * Lien profond « Voir sur Strava » vers l'activité d'origine.
 *
 * Les Brand Guidelines Strava demandent que toute donnée d'activité affichée hors de
 * Strava renvoie vers l'activité correspondante sur Strava. C'est aussi ce que l'API
 * Agreement appelle une expérience *complémentaire* : Vorcelab analyse, Strava reste
 * le lieu de l'activité elle-même — l'athlète y retourne d'un clic depuis chaque
 * sortie affichée ici.
 *
 * `stravaActivityId` peut arriver en `bigint` sérialisé (chaîne) depuis Postgres :
 * l'identifiant n'est jamais converti en `number` (perte de précision au-delà de
 * 2^53), il est repris tel quel.
 */
import { stravaActivityUrl } from '../lib/stravaActivityUrl'

export { stravaActivityUrl }

export function ViewOnStrava({
  stravaActivityId,
  compact = false,
}: {
  stravaActivityId: number | string | bigint | null | undefined
  compact?: boolean
}) {
  const href = stravaActivityUrl(stravaActivityId)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // Dans une liste, la carte entière est déjà un lien interne : on empêche le
      // clic de remonter, sans quoi ouvrir Strava déclencherait aussi la navigation.
      onClick={(e) => e.stopPropagation()}
      title="Ouvrir cette activité sur Strava"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
        padding: compact ? '3px 8px' : '7px 13px',
        borderRadius: 999,
        border: '1px solid color-mix(in srgb, #FC4C02 45%, transparent)',
        background: 'color-mix(in srgb, #FC4C02 12%, transparent)',
        color: '#FC4C02',
        fontFamily: 'var(--vl-mono)',
        fontSize: compact ? 10 : 12,
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
      }}
    >
      Voir sur Strava ↗
    </a>
  )
}

export default ViewOnStrava
