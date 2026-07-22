// Niveau de plan effectif (free/pro) — portage fidèle de src/lib/usePlanTier.ts,
// adapté au pattern loader natif (Supabase direct + useState au lieu de
// TanStack Query, comme useCoachPlan). Mêmes sources, même résolution.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { resolvePlanTier, resolveExpiry, type EntitlementRow, type ProfileFallback, type EntStatus } from './planResolver'

export type PlanTier = 'free' | 'pro'

interface PlanState {
  userId: string
  isAdmin: boolean
  entitlement: EntitlementRow | null
  profile: ProfileFallback | null
}

export function usePlanTier(): { tier: PlanTier; isAdmin: boolean; expiresAt: Date | null; isLoading: boolean } {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  // On mémorise le userId de l'état pour dériver `isLoading` sans setState
  // synchrone dans l'effet (évite les rendus en cascade — react-hooks).
  const [data, setData] = useState<PlanState | null>(null)

  useEffect(() => {
    if (!userId) return
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
        userId,
        isAdmin: profileRow?.is_admin === true,
        entitlement: entRow ? { status: entRow.status as EntStatus, current_period_end: entRow.current_period_end } : null,
        profile: profileRow
          ? { plan_tier: profileRow.plan_tier ?? null, plan_expires_at: profileRow.plan_expires_at ?? null }
          : null,
      })
    })()
    return () => { cancelled = true }
  }, [userId])

  // État courant seulement si celui-ci correspond au user connecté (sinon on est
  // encore en train de charger, ou déconnecté).
  const current = data && data.userId === userId ? data : null
  const isLoading = userId != null && current == null
  const isAdmin = current?.isAdmin === true
  const tier = current
    ? resolvePlanTier({ isAdmin: current.isAdmin, entitlement: current.entitlement, profile: current.profile })
    : 'free'
  const expiresAt = current ? resolveExpiry({ entitlement: current.entitlement, profile: current.profile }) : null

  return { tier, isAdmin, expiresAt, isLoading }
}
