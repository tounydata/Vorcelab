import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'

export type PlanTier = 'free' | 'pro'

interface PlanRow {
  plan_tier: string | null
  plan_expires_at: string | null
  is_admin: boolean | null
}

export function usePlanTier(): { tier: PlanTier; isAdmin: boolean; isLoading: boolean } {
  const user = useVLStore((s) => s.user)
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

  const isAdmin = data?.is_admin === true
  const rawTier = (data?.plan_tier ?? 'free') as PlanTier
  const expires = data?.plan_expires_at ? new Date(data.plan_expires_at) : null
  // Admin = PRO permanent · PRO expiré → free auto
  const tier: PlanTier = isAdmin ? 'pro'
    : rawTier === 'pro' && expires && expires < new Date() ? 'free'
    : rawTier

  return { tier, isAdmin, isLoading }
}
