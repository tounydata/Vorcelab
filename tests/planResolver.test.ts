import { describe, it, expect } from 'vitest'
import { resolvePlanTier, resolveExpiry } from '../src/lib/planResolver'

const NOW = new Date('2026-07-11T00:00:00Z')
const future = new Date('2026-08-11T00:00:00Z').toISOString()
const past = new Date('2026-06-11T00:00:00Z').toISOString()

describe('resolvePlanTier', () => {
  it('admin → pro (permanent)', () => {
    expect(resolvePlanTier({ isAdmin: true, entitlement: null, profile: null, now: NOW })).toBe('pro')
  })

  it('entitlement actif → pro (source de vérité)', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: { status: 'active', current_period_end: future }, profile: null, now: NOW })).toBe('pro')
  })

  it('entitlement résilié mais période valide → pro (période payée respectée)', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: { status: 'canceled', current_period_end: future }, profile: null, now: NOW })).toBe('pro')
  })

  it('entitlement expiré → free', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: { status: 'canceled', current_period_end: past }, profile: null, now: NOW })).toBe('free')
  })

  it('pas d’entitlement mais profiles pro valide → pro (repli transitoire, pas de régression)', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: null, profile: { plan_tier: 'pro', plan_expires_at: future }, now: NOW })).toBe('pro')
  })

  it('pas d’entitlement et profiles pro expiré → free', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: null, profile: { plan_tier: 'pro', plan_expires_at: past }, now: NOW })).toBe('free')
  })

  it('entitlement free mais profiles encore pro → pro (le repli élargit, jamais ne restreint)', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: { status: 'expired', current_period_end: null }, profile: { plan_tier: 'pro', plan_expires_at: future }, now: NOW })).toBe('pro')
  })

  it('rien → free', () => {
    expect(resolvePlanTier({ isAdmin: false, entitlement: null, profile: null, now: NOW })).toBe('free')
  })
})

describe('resolveExpiry', () => {
  it('préfère la période de l’entitlement', () => {
    expect(resolveExpiry({ entitlement: { status: 'active', current_period_end: future }, profile: { plan_tier: 'pro', plan_expires_at: past } })?.toISOString()).toBe(future)
  })
  it('repli sur profiles si pas d’entitlement', () => {
    expect(resolveExpiry({ entitlement: null, profile: { plan_tier: 'pro', plan_expires_at: past } })?.toISOString()).toBe(past)
  })
  it('null si aucune source', () => {
    expect(resolveExpiry({ entitlement: null, profile: null })).toBeNull()
  })
})
