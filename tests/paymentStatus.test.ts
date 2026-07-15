import { describe, it, expect } from 'vitest'
import { derivePaymentState, isConfirmed } from '../src/lib/paymentStatus'

const base = { hasUser: true, isLoading: false, isError: false, planIsPro: false, elapsedMs: 0, timeoutMs: 25000 }

describe('derivePaymentState', () => {
  it('pas de session → not_logged_in (aucune confirmation possible)', () => {
    expect(derivePaymentState({ ...base, hasUser: false, planIsPro: true })).toBe('not_logged_in')
  })

  it('PRO confirmé par le serveur → confirmed (prioritaire sur loading/error)', () => {
    expect(derivePaymentState({ ...base, planIsPro: true, isLoading: true })).toBe('confirmed')
    expect(derivePaymentState({ ...base, planIsPro: true, isError: true })).toBe('confirmed')
  })

  it('pas encore PRO, première charge → loading', () => {
    expect(derivePaymentState({ ...base, isLoading: true })).toBe('loading')
  })

  it('pas encore PRO mais dans la fenêtre → processing (webhook en vol)', () => {
    expect(derivePaymentState({ ...base, elapsedMs: 5000 })).toBe('processing')
  })

  it('toujours pas PRO après le délai → not_found', () => {
    expect(derivePaymentState({ ...base, elapsedMs: 30000 })).toBe('not_found')
  })

  it('erreur serveur (et pas encore PRO, plus en chargement) → error', () => {
    expect(derivePaymentState({ ...base, isError: true })).toBe('error')
  })

  it('ne confirme JAMAIS sans planIsPro (pas de confiance au client)', () => {
    for (const s of ['loading', 'processing', 'not_found', 'not_logged_in', 'error'] as const) {
      // aucun de ces états n'est "confirmed"
      expect(isConfirmed(s)).toBe(false)
    }
    expect(isConfirmed('confirmed')).toBe(true)
  })
})
