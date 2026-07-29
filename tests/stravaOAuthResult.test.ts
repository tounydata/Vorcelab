import { describe, expect, it } from 'vitest'
import {
  classifyStravaOAuthFailure,
  parseStoredStravaOAuthFailure,
  stravaOAuthFailureMessage,
} from '../src/lib/stravaOAuthResult'

describe('retour OAuth Strava actionnable', () => {
  it('distingue un mauvais athlète d’une permission manquante', () => {
    expect(classifyStravaOAuthFailure({ code: 'different_strava_athlete' }))
      .toBe('wrong_athlete')
    expect(classifyStravaOAuthFailure({ code: 'missing_activity_scope' }))
      .toBe('missing_scope')
    expect(classifyStravaOAuthFailure({ code: 'strava_athlete_already_linked' }))
      .toBe('already_linked')
  })

  it('retombe sur une erreur générique si le serveur ne fournit pas de code connu', () => {
    expect(classifyStravaOAuthFailure({ error: 'Internal server error' })).toBe('error')
    expect(classifyStravaOAuthFailure(null)).toBe('error')
  })

  it('refuse toute valeur de sessionStorage inconnue', () => {
    expect(parseStoredStravaOAuthFailure('wrong_athlete')).toBe('wrong_athlete')
    expect(parseStoredStravaOAuthFailure('connected')).toBeNull()
    expect(parseStoredStravaOAuthFailure('<script>')).toBeNull()
  })

  it('explique qu’aucune donnée n’a été modifiée en cas de mauvais compte', () => {
    const message = stravaOAuthFailureMessage('wrong_athlete')
    expect(message).toContain('autre compte Strava')
    expect(message).toContain('Aucun compte ni aucune donnée n’ont été modifiés')
  })
})
