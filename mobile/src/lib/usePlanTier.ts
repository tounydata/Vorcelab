// Niveau de plan effectif (free/pro) — portage fidèle de src/lib/usePlanTier.ts,
// adapté au pattern loader natif (Supabase direct + useState au lieu de
// TanStack Query, comme useCoachPlan). Mêmes sources, même résolution.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { resolvePlanTier, resolveExpiry, type EntitlementRow, type ProfileFallback, type EntStatus } from './planResolver'

export type PlanTier = 'free' | 'pro'

interface PlanState {
  isAdmin: boolean
  entitlement: EntitlementRow | null
  profile: ProfileFallback | null
}

export function usePlanTier(): { tier: PlanTier; isAdmin: boolean; expiresAt: Date | null; isLoading: boolean } {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [data, setData] = useState<PlanState | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setData(null); setIsLoading(false); return }
    let cancelled = false
    ;(async () => {
      // Repli / admin : lecture de profiles (source historique, non modifiable
      // par le client depuis le durcissement RLS).
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('plan_tier, plan_expires_at, is_admin')
        .eq('id', userId)
        .single()

      // Source de vérité : user_entitlements (écrit uniquement côté serveur).
      const { data: entRow } = await supabase
        .from('user_entitlements')
        .select('status, current_period_end')
        .eq('user_id', userId)
        .maybeSingle()

      if (cancelled) return
      setData({
        isAdmin: profileRow?.is_admin === true,
        entitlement: entRow ? { status: entRow.status as EntStatus, current_period_end: entRow.current_period_end } : null,
        profile: profileRow
          ? { plan_tier: profileRow.plan_tier ?? null, plan_expires_at: profileRow.plan_expires_at ?? null }
          : null,
      })
      setIsLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId])

  const isAdmin = data?.isAdmin === true
  const tier = data
    ? resolvePlanTier({ isAdmin: data.isAdmin, entitlement: data.entitlement, profile: data.profile })
    : 'free'
  const expiresAt = data ? resolveExpiry({ entitlement: data.entitlement, profile: data.profile }) : null

  return { tier, isAdmin, expiresAt, isLoading }
}
