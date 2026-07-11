// Logique PURE de dérivation d'entitlement depuis les objets Stripe + décision
// d'idempotence. Aucune dépendance (ni Deno, ni réseau) → réutilisable par la
// fonction webhook ET testable en vitest. La fonction Edge reste une fine couche
// d'E/S au-dessus de ces fonctions.

export type EntStatus =
  | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'expired' | 'inactive'

export interface EntitlementPatch {
  plan_tier: 'free' | 'pro'
  status: EntStatus
  source: 'stripe'
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  current_period_end: string | null // ISO 8601
  cancel_at_period_end: boolean
}

export interface StripeSubscriptionLike {
  id: string
  status: string
  customer: string | { id: string } | null
  cancel_at_period_end?: boolean
  current_period_end?: number // unix seconds
  items?: { data?: Array<{ price?: { id?: string } }> }
}

/** Statut d'abonnement Stripe → statut d'entitlement interne. */
export function mapStripeSubscriptionStatus(s: string): EntStatus {
  switch (s) {
    case 'active': return 'active'
    case 'trialing': return 'trialing'
    case 'past_due': return 'past_due'
    case 'unpaid': return 'past_due'
    case 'canceled': return 'canceled'
    case 'incomplete': return 'incomplete'
    case 'incomplete_expired': return 'expired'
    case 'paused': return 'inactive'
    default: return 'inactive'
  }
}

function customerId(customer: StripeSubscriptionLike['customer']): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id ?? null
}

/**
 * Accès EFFECTIF PRO à l'instant `now`, en respectant la période RÉELLEMENT payée :
 * un abonnement résilié ou en impayé reste PRO jusqu'à `current_period_end`.
 * C'est la fonction de vérité que les lecteurs (usePlanTier serveur) doivent
 * utiliser, plutôt que le snapshot `plan_tier`.
 */
export function effectiveTier(
  e: { status: EntStatus; current_period_end: string | null },
  now: Date = new Date(),
): 'free' | 'pro' {
  if (e.status === 'active' || e.status === 'trialing') return 'pro'
  if ((e.status === 'canceled' || e.status === 'past_due') &&
      e.current_period_end && new Date(e.current_period_end) > now) {
    return 'pro'
  }
  return 'free'
}

/** Construit le patch d'entitlement à partir d'un objet subscription Stripe. */
export function entitlementFromSubscription(
  sub: StripeSubscriptionLike,
  now: Date = new Date(),
): EntitlementPatch {
  const status = mapStripeSubscriptionStatus(sub.status)
  const current_period_end = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null
  return {
    status,
    plan_tier: effectiveTier({ status, current_period_end }, now),
    source: 'stripe',
    stripe_customer_id: customerId(sub.customer),
    stripe_subscription_id: sub.id,
    stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
    current_period_end,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  }
}

/** Types d'événements Stripe qui affectent l'entitlement (les autres sont ackés). */
export const ENTITLEMENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
])

export function isEntitlementEvent(type: string): boolean {
  return ENTITLEMENT_EVENT_TYPES.has(type)
}

/**
 * Idempotence : faut-il traiter cet événement ? On ne traite pas deux fois un
 * event déjà `processed` ; on autorise un nouveau passage seulement si la
 * tentative précédente a échoué (`error`).
 */
export function shouldProcessEvent(prior: { status: string } | null | undefined): boolean {
  if (!prior) return true
  return prior.status === 'error'
}
