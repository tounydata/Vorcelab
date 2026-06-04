import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'
import Onboarding from './Onboarding'

/**
 * Affiche l'onboarding tant que profiles.onboarding_done est false.
 * Monté dans le shell authentifié ; ne bloque pas l'app pendant le chargement.
 */
export default function OnboardingGate() {
  const { user } = useVLStore()
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['onboarding-done', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('onboarding_done').eq('id', user!.id).maybeSingle()
      return data?.onboarding_done ?? null
    },
  })

  // On n'affiche QUE si on sait avec certitude que l'onboarding n'est pas fait.
  if (!user || data !== false) return null
  return <Onboarding onDone={() => {
    qc.invalidateQueries({ queryKey: ['onboarding-done', user.id] })
    qc.invalidateQueries({ queryKey: ['tour-state', user.id] }) // débloque l'auto-tuto post-onboarding
  }} />
}
