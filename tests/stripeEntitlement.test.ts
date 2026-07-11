import { describe, it, expect } from 'vitest'
import {
  mapStripeSubscriptionStatus, effectiveTier, entitlementFromSubscription,
  isEntitlementEvent, shouldProcessEvent, type StripeSubscriptionLike,
} from '../supabase/functions/_shared/stripeEntitlement'

const NOW = new Date('2026-07-11T00:00:00Z')
const future = new Date('2026-08-11T00:00:00Z').toISOString()
const past = new Date('2026-06-11T00:00:00Z').toISOString()

describe('mapStripeSubscriptionStatus', () => {
  it('mappe les statuts Stripe connus', () => {
    expect(mapStripeSubscriptionStatus('active')).toBe('active')
    expect(mapStripeSubscriptionStatus('trialing')).toBe('trialing')
    expect(mapStripeSubscriptionStatus('past_due')).toBe('past_due')
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('past_due')
    expect(mapStripeSubscriptionStatus('canceled')).toBe('canceled')
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('expired')
    expect(mapStripeSubscriptionStatus('inconnu')).toBe('inactive')
  })
})

describe('effectiveTier — respecte la période payée', () => {
  it('active/trialing → pro', () => {
    expect(effectiveTier({ status: 'active', current_period_end: null }, NOW)).toBe('pro')
    expect(effectiveTier({ status: 'trialing', current_period_end: null }, NOW)).toBe('pro')
  })
  it('résilié mais période encore valide → reste pro (pas de coupure anticipée)', () => {
    expect(effectiveTier({ status: 'canceled', current_period_end: future }, NOW)).toBe('pro')
    expect(effectiveTier({ status: 'past_due', current_period_end: future }, NOW)).toBe('pro')
  })
  it('résilié et période expirée → free', () => {
    expect(effectiveTier({ status: 'canceled', current_period_end: past }, NOW)).toBe('free')
  })
  it('expiré / inactif → free', () => {
    expect(effectiveTier({ status: 'expired', current_period_end: future }, NOW)).toBe('free')
    expect(effectiveTier({ status: 'inactive', current_period_end: null }, NOW)).toBe('free')
  })
})

describe('entitlementFromSubscription', () => {
  const sub: StripeSubscriptionLike = {
    id: 'sub_1', status: 'active', customer: 'cus_1',
    cancel_at_period_end: true,
    current_period_end: Math.floor(new Date(future).getTime() / 1000),
    items: { data: [{ price: { id: 'price_annual' } }] },
  }
  it('extrait les champs et calcule pro', () => {
    const e = entitlementFromSubscription(sub, NOW)
    expect(e).toMatchObject({
      plan_tier: 'pro', status: 'active', source: 'stripe',
      stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
      stripe_price_id: 'price_annual', cancel_at_period_end: true,
    })
    expect(e.current_period_end).toBe(future)
  })
  it('gère customer objet et absence de prix', () => {
    const e = entitlementFromSubscription({ id: 'sub_2', status: 'canceled', customer: { id: 'cus_2' } }, NOW)
    expect(e.stripe_customer_id).toBe('cus_2')
    expect(e.stripe_price_id).toBeNull()
    expect(e.current_period_end).toBeNull()
    expect(e.plan_tier).toBe('free') // canceled sans période
  })
})

describe('isEntitlementEvent', () => {
  it('reconnaît les événements pertinents et ignore les autres', () => {
    expect(isEntitlementEvent('checkout.session.completed')).toBe(true)
    expect(isEntitlementEvent('invoice.payment_failed')).toBe(true)
    expect(isEntitlementEvent('customer.subscription.deleted')).toBe(true)
    expect(isEntitlementEvent('charge.refunded')).toBe(true)
    expect(isEntitlementEvent('customer.created')).toBe(false)
  })
})

describe('shouldProcessEvent — idempotence', () => {
  it('traite un event jamais vu', () => {
    expect(shouldProcessEvent(null)).toBe(true)
  })
  it('ne retraite pas un event déjà traité (rejeu)', () => {
    expect(shouldProcessEvent({ status: 'processed' })).toBe(false)
    expect(shouldProcessEvent({ status: 'received' })).toBe(false)
  })
  it('rejoue seulement une tentative précédente en erreur', () => {
    expect(shouldProcessEvent({ status: 'error' })).toBe(true)
  })
})
