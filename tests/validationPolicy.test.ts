import { describe, it, expect } from 'vitest'
import {
  VALIDATION_CAMPAIGN,
  isEngineFrozenForValidation,
  classifyDataSplit,
} from '../src/lib/validationPolicy'
import { ENGINE_VERSION } from '../src/lib/engineVersion'

describe('validationPolicy (§9)', () => {
  const startMs = Date.parse(VALIDATION_CAMPAIGN.startAtISO)

  it('la version gelée == la version courante du moteur (anti-dérive)', () => {
    // Garantit qu'on gèle bien la version en production au moment de la campagne.
    expect(VALIDATION_CAMPAIGN.frozenEngineVersion).toBe(ENGINE_VERSION)
  })

  it('isEngineFrozenForValidation : vrai seulement pour la version gelée', () => {
    expect(isEngineFrozenForValidation(VALIDATION_CAMPAIGN.frozenEngineVersion)).toBe(true)
    expect(isEngineFrozenForValidation('2099.99-0')).toBe(false)
  })

  it('validation UNIQUEMENT si version gelée ET course après début de campagne', () => {
    const frozen = VALIDATION_CAMPAIGN.frozenEngineVersion
    // Version gelée + course future → validation.
    expect(classifyDataSplit({ engineVersion: frozen, raceStartAtMs: startMs + 86_400_000 })).toBe('validation')
    // Version gelée mais course AVANT la campagne → développement (pas de requalification).
    expect(classifyDataSplit({ engineVersion: frozen, raceStartAtMs: startMs - 86_400_000 })).toBe('development')
    // Course future mais AUTRE version (moteur dégelé) → développement.
    expect(classifyDataSplit({ engineVersion: '2099.99-0', raceStartAtMs: startMs + 86_400_000 })).toBe('development')
  })

  it('la borne de début de campagne est inclusive', () => {
    expect(classifyDataSplit({ engineVersion: VALIDATION_CAMPAIGN.frozenEngineVersion, raceStartAtMs: startMs })).toBe('validation')
  })

  it('entrées invalides → développement (jamais validation par défaut)', () => {
    expect(classifyDataSplit({ engineVersion: VALIDATION_CAMPAIGN.frozenEngineVersion, raceStartAtMs: NaN })).toBe('development')
  })
})
