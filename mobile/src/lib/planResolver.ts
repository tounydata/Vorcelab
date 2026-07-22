// Résolution PURE du niveau de plan effectif — portage fidèle de
// src/lib/planResolver.ts + supabase/functions/_shared/stripeEntitlement.ts
// (effectiveTier inliné : le chemin _shared n'existe pas côté mobile).
// Source de vérité prioritaire : user_entitlements (écrit uniquement côté
// serveur). Repli transitoire : profiles.plan_tier/plan_expires_at.

export type EntStatus =
  | 'active'
  | 'trialing'
  | 'canceled'
  | 'past_due'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

export interface EntitlementRow {
  status: EntStatus
  current_period_end: string | null
}
export interface ProfileFallback {
  plan_tier: string | null
  plan_expires_at: string | null
}

/** Identique à _shared/stripeEntitlement.effectiveTier. */
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

export function resolvePlanTier(args: {
  isAdmin: boolean
  entitlement: EntitlementRow | null
  profile: ProfileFallback | null
  now?: Date
}): 'free' | 'pro' {
  const now = args.now ?? new Date()
  // Admin = PRO permanent.
  if (args.isAdmin) return 'pro'
  // Source de vérité : entitlement serveur (respecte la période payée).
  if (args.entitlement && effectiveTier(args.entitlement, now) === 'pro') return 'pro'
  // Repli transitoire : profiles (jusqu'à ce que le webhook peuple entitlements).
  if (args.profile?.plan_tier === 'pro') {
    const exp = args.profile.plan_expires_at ? new Date(args.profile.plan_expires_at) : null
    if (!exp || exp > now) return 'pro'
  }
  return 'free'
}

/** Date d'expiration à afficher : période de l'entitlement sinon repli profiles. */
export function resolveExpiry(args: {
  entitlement: EntitlementRow | null
  profile: ProfileFallback | null
}): Date | null {
  if (args.entitlement?.current_period_end) return new Date(args.entitlement.current_period_end)
  if (args.profile?.plan_expires_at) return new Date(args.profile.plan_expires_at)
  return null
}
