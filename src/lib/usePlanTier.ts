import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'

export type PlanTier = 'free' | 'pro'

interface PlanRow {
  plan_tier: string | null
  plan_expires_at: string | null
  is_admin: boolean | null
}

export function usePlanTier(): { tier: PlanTier; isAdmin: boolean; expiresAt: Date | null; isLoading: boolean } {
  const user = useVLStore((s) => s.user)
  const viewAs = useVLStore((s) => s.viewAs)

  const { data, isLoading } = useQuery<PlanRow | null>({
    queryKey: ['plan-tier', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('plan_tier, plan_expires_at, is_admin')
        .eq('id', user!.id)
        .single()
      if (error) return null
      return data as PlanRow
    },
  })

  // En mode "Vue en tant que", on utilise les données du user simulé.
  const source: PlanRow | null = viewAs
    ? { plan_tier: viewAs.plan_tier, plan_expires_at: viewAs.plan_expires_at, is_admin: viewAs.is_admin }
    : (data ?? null)

  const isAdmin = source?.is_admin === true
  const rawTier = (source?.plan_tier ?? 'free') as PlanTier
  const expires = source?.plan_expires_at ? new Date(source.plan_expires_at) : null
  // Admin = PRO permanent · PRO expiré → free auto
  const tier: PlanTier = isAdmin ? 'pro'
    : rawTier === 'pro' && expires && expires < new Date() ? 'free'
    : rawTier

  return { tier, isAdmin, expiresAt: expires, isLoading: viewAs ? false : isLoading }
}
