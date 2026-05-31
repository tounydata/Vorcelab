import { describe, it, expect } from 'vitest'
import { FC_MAX_FALLBACK, estimateFcMaxFromActivities, resolveFcMax } from '../src/lib/fcMax'

describe('estimateFcMaxFromActivities', () => {
  it('retient la plus haute FC max plausible observée', () => {
    const acts = [{ max_heartrate: 178 }, { max_heartrate: 191 }, { max_heartrate: 185 }]
    expect(estimateFcMaxFromActivities(acts)).toBe(191)
  })

  it('ignore les valeurs aberrantes (artefacts)', () => {
    const acts = [{ max_heartrate: 184 }, { max_heartrate: 250 }, { max_heartrate: 0 }]
    expect(estimateFcMaxFromActivities(acts)).toBe(184)
  })

  it('retourne null sans donnée de FC', () => {
    expect(estimateFcMaxFromActivities([{ distance: 10000 }])).toBeNull()
    expect(estimateFcMaxFromActivities([])).toBeNull()
  })
})

describe('resolveFcMax — ordre de priorité', () => {
  it('1. utilise la valeur du profil si plausible', () => {
    expect(resolveFcMax(205, [{ max_heartrate: 180 }])).toBe(205)
  })

  it('2. estime depuis les activités si pas de profil', () => {
    expect(resolveFcMax(null, [{ max_heartrate: 192 }])).toBe(192)
    expect(resolveFcMax(undefined, [{ max_heartrate: 192 }])).toBe(192)
  })

  it('3. repère de population en dernier recours', () => {
    expect(resolveFcMax(null, [])).toBe(FC_MAX_FALLBACK)
    expect(resolveFcMax(null)).toBe(FC_MAX_FALLBACK)
  })

  it('rejette une valeur de profil aberrante et bascule sur l\'estimation', () => {
    expect(resolveFcMax(999, [{ max_heartrate: 188 }])).toBe(188)
    expect(resolveFcMax(40, [])).toBe(FC_MAX_FALLBACK)
  })

  it('ne fige aucune FCmax personnelle : 205 n\'est pas un défaut', () => {
    expect(resolveFcMax(null, [])).not.toBe(205)
  })
})
