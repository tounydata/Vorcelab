import { effectiveTier, type EntStatus } from '../../supabase/functions/_shared/stripeEntitlement'

// Résolution PURE du niveau de plan effectif à partir des sources SERVEUR.
// Source de vérité prioritaire : user_entitlements (écrit uniquement côté serveur).
// Repli transitoire : profiles.plan_tier/plan_expires_at (historique), le temps
// que le webhook alimente user_entitlements pour tout le monde. Le repli ne fait
// qu'ÉLARGIR l'accès (OR) → aucune régression d'accès pendant la transition, et
// les deux sources sont non modifiables par le client (trigger Phase 1 + RLS).

export interface EntitlementRow {
  status: EntStatus
  current_period_end: string | null
}
export interface ProfileFallback {
  plan_tier: string | null
  plan_expires_at: string | null
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
