import { describe, it, expect } from 'vitest'
import { FC_MAX_FALLBACK, estimateFcMaxFromActivities, resolveFcMax, ageFromBirthdate } from '../src/lib/fcMax'

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

  it('3. « 220 − âge » si pas de profil ni de données mais âge connu', () => {
    expect(resolveFcMax(null, [], 30)).toBe(190) // 220 - 30
    expect(resolveFcMax(null, [], 45)).toBe(175)
    // La valeur observée reste prioritaire sur la formule d'âge.
    expect(resolveFcMax(null, [{ max_heartrate: 188 }], 30)).toBe(188)
  })

  it('4. repère fixe en dernier recours absolu (ni profil, ni données, ni âge)', () => {
    expect(resolveFcMax(null, [])).toBe(FC_MAX_FALLBACK)
    expect(resolveFcMax(null)).toBe(FC_MAX_FALLBACK)
    expect(resolveFcMax(null, [], null)).toBe(FC_MAX_FALLBACK)
  })

  it('rejette une valeur de profil aberrante et bascule sur l\'estimation', () => {
    expect(resolveFcMax(999, [{ max_heartrate: 188 }])).toBe(188)
    expect(resolveFcMax(40, [])).toBe(FC_MAX_FALLBACK)
  })

  it('ne fige aucune FCmax personnelle : 205 n\'est pas un défaut', () => {
    expect(resolveFcMax(null, [])).not.toBe(205)
  })
})

describe('ageFromBirthdate', () => {
  it('calcule l\'âge depuis une date de naissance ISO', () => {
    const y2000 = ageFromBirthdate('2000-01-01')
    expect(y2000).toBeGreaterThanOrEqual(25)
    expect(y2000).toBeLessThanOrEqual(27)
  })
  it('rejette les entrées invalides ou aberrantes', () => {
    expect(ageFromBirthdate(null)).toBeNull()
    expect(ageFromBirthdate('pas-une-date')).toBeNull()
    expect(ageFromBirthdate('1850-01-01')).toBeNull()
  })
})
