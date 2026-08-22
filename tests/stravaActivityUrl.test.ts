import { describe, it, expect } from 'vitest'
import { stravaActivityUrl } from '../src/lib/stravaActivityUrl'

describe('stravaActivityUrl', () => {
  it('construit le lien profond vers l’activité Strava', () => {
    expect(stravaActivityUrl(1234567890)).toBe('https://www.strava.com/activities/1234567890')
  })

  it('accepte un identifiant reçu en chaîne (bigint sérialisé par Postgres)', () => {
    // Au-delà de 2^53, passer par `number` perdrait des chiffres et pointerait vers
    // l'activité d'un autre athlète : la chaîne doit être reprise telle quelle.
    const big = '19007199254740993'
    expect(stravaActivityUrl(big)).toBe(`https://www.strava.com/activities/${big}`)
  })

  it('accepte un bigint', () => {
    expect(stravaActivityUrl(9007199254740993n)).toBe(
      'https://www.strava.com/activities/9007199254740993',
    )
  })

  it('renvoie null quand il n’y a pas d’identifiant', () => {
    expect(stravaActivityUrl(null)).toBeNull()
    expect(stravaActivityUrl(undefined)).toBeNull()
    expect(stravaActivityUrl('')).toBeNull()
    expect(stravaActivityUrl('   ')).toBeNull()
  })

  it('refuse tout ce qui n’est pas un entier positif', () => {
    // Rien de ce qui vient de la base ne doit pouvoir être concaténé dans l'URL.
    expect(stravaActivityUrl('12/../../evil')).toBeNull()
    expect(stravaActivityUrl('abc')).toBeNull()
    expect(stravaActivityUrl(-42)).toBeNull()
    expect(stravaActivityUrl(12.5)).toBeNull()
    expect(stravaActivityUrl(Number.NaN)).toBeNull()
    expect(stravaActivityUrl(0)).toBeNull()
  })
})
