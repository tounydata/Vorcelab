import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'

export type PlanTier = 'free' | 'pro'

export function usePlanTier(): { tier: PlanTier; isLoading: boolean } {
  const user = useVLStore((s) => s.user)
  const { data, isLoading } = useQuery<PlanTier>({
    queryKey: ['plan-tier', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('plan_tier')
        .eq('id', user!.id)
        .single()
      if (error) return 'free'
      return (data?.plan_tier ?? 'free') as PlanTier
    },
  })
  return { tier: data ?? 'free', isLoading }
}
