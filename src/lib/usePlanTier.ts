import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'
import { resolvePlanTier, resolveExpiry, type EntitlementRow, type ProfileFallback } from './planResolver'
import type { EntStatus } from '../../supabase/functions/_shared/stripeEntitlement'

export type PlanTier = 'free' | 'pro'

interface PlanState {
  isAdmin: boolean
  entitlement: EntitlementRow | null
  profile: ProfileFallback | null
}

export function usePlanTier(): { tier: PlanTier; isAdmin: boolean; expiresAt: Date | null; isLoading: boolean } {
  const user = useVLStore((s) => s.user)
  const viewAs = useVLStore((s) => s.viewAs)

  const { data, isLoading } = useQuery<PlanState>({
    queryKey: ['plan-tier', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Repli / admin : lecture de profiles (source historique, non modifiable par
      // le client depuis le durcissement RLS).
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('plan_tier, plan_expires_at, is_admin')
        .eq('id', user!.id)
        .single()

      // Source de vérité : user_entitlements (écrit uniquement côté serveur).
      // Résilient au déploiement progressif : si la table n'existe pas encore
      // (code 42P01), on retombe proprement sur le repli profiles — on ne masque
      // aucune AUTRE erreur (elle laissera entitlement=null → repli).
      const { data: entRow } = await supabase
        .from('user_entitlements')
        .select('status, current_period_end')
        .eq('user_id', user!.id)
        .maybeSingle()

      return {
        isAdmin: profileRow?.is_admin === true,
        entitlement: entRow ? { status: entRow.status as EntStatus, current_period_end: entRow.current_period_end } : null,
        profile: profileRow
          ? { plan_tier: profileRow.plan_tier ?? null, plan_expires_at: profileRow.plan_expires_at ?? null }
          : null,
      }
    },
  })

  // Mode « Vue en tant que » (admin) : on simule le plan du user ciblé via ses
  // champs profiles (l'impersonation reste basée sur la lecture admin).
  if (viewAs) {
    const tier = resolvePlanTier({
      isAdmin: viewAs.is_admin === true,
      entitlement: null,
      profile: { plan_tier: viewAs.plan_tier, plan_expires_at: viewAs.plan_expires_at },
    })
    const expiresAt = resolveExpiry({ entitlement: null, profile: { plan_tier: viewAs.plan_tier, plan_expires_at: viewAs.plan_expires_at } })
    return { tier, isAdmin: viewAs.is_admin === true, expiresAt, isLoading: false }
  }

  const isAdmin = data?.isAdmin === true
  const tier = data
    ? resolvePlanTier({ isAdmin: data.isAdmin, entitlement: data.entitlement, profile: data.profile })
    : 'free'
  const expiresAt = data ? resolveExpiry({ entitlement: data.entitlement, profile: data.profile }) : null

  return { tier, isAdmin, expiresAt, isLoading }
}
