import { describe, it, expect } from 'vitest'
import {
  decideManualSync,
  MANUAL_SYNC_COOLDOWN_MS,
} from '../supabase/functions/_shared/stravaSyncPolicy.ts'

const NOW = Date.parse('2026-08-21T12:00:00.000Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

describe('decideManualSync', () => {
  it('ignore une synchro manuelle qui suit de trop près la précédente', () => {
    // Les nouvelles activités arrivent par webhook : re-paginer n'apprend rien.
    const d = decideManualSync(iso(60_000), { now: NOW })
    expect(d.skip).toBe(true)
    expect(d.retryAfterSeconds).toBe((MANUAL_SYNC_COOLDOWN_MS - 60_000) / 1000)
  })

  it('laisse passer une fois le délai écoulé', () => {
    expect(decideManualSync(iso(MANUAL_SYNC_COOLDOWN_MS), { now: NOW })).toEqual({
      skip: false,
      retryAfterSeconds: 0,
    })
  })

  it('ne bride JAMAIS une synchronisation complète', () => {
    // Première connexion ou réparation explicite : rare et intentionnelle.
    expect(decideManualSync(iso(1000), { now: NOW, full: true }).skip).toBe(false)
  })

  it('laisse passer quand aucune synchro n’a jamais eu lieu', () => {
    expect(decideManualSync(null, { now: NOW }).skip).toBe(false)
    expect(decideManualSync(undefined, { now: NOW }).skip).toBe(false)
  })

  it('ne bloque pas sur un horodatage illisible', () => {
    expect(decideManualSync('pas une date', { now: NOW }).skip).toBe(false)
  })

  it('ne bloque pas sur un horodatage dans le futur (horloge décalée)', () => {
    // Un `last_sync_at` futur bloquerait sinon la synchro indéfiniment.
    expect(decideManualSync(iso(-3_600_000), { now: NOW }).skip).toBe(false)
  })
})
