import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useVLStore } from '../store/vlStore'
import {
  pendingDocuments, LEGAL_DOCS, CURRENT_LEGAL_VERSIONS, LEGAL_INFO_COMPLETE,
  type AcceptanceRecord, type LegalDoc,
} from './legalVersions'

/**
 * État d'acceptation légale de l'utilisateur courant + action d'acceptation.
 * La requête n'est active que si les mentions légales sont complètes
 * (LEGAL_INFO_COMPLETE) : tant que ce n'est pas le cas, le mécanisme reste inerte
 * et ne requête pas la base (ne nuit pas au développement).
 */
export function useLegalAcceptance(): {
  pending: LegalDoc[]
  needsConsent: boolean
  isLoading: boolean
  accept: (context?: Record<string, unknown>) => Promise<void>
} {
  const user = useVLStore((s) => s.user)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<AcceptanceRecord[]>({
    queryKey: ['legal-acceptances', user?.id],
    enabled: !!user && LEGAL_INFO_COMPLETE,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('legal_acceptances')
        .select('document, version')
        .eq('user_id', user!.id)
      return (data ?? []) as AcceptanceRecord[]
    },
  })

  const pending = pendingDocuments(data ?? [])

  async function accept(context: Record<string, unknown> = {}): Promise<void> {
    if (!user) return
    const rows = LEGAL_DOCS.map((doc) => ({
      user_id: user.id,
      document: doc,
      version: CURRENT_LEGAL_VERSIONS[doc],
      context,
    }))
    // Idempotent : ré-accepter une version déjà acceptée ne crée pas de doublon.
    const { error } = await supabase
      .from('legal_acceptances')
      .upsert(rows, { onConflict: 'user_id,document,version', ignoreDuplicates: true })
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['legal-acceptances', user.id] })
  }

  return {
    pending,
    needsConsent: LEGAL_INFO_COMPLETE && !!user && pending.length > 0,
    isLoading,
    accept,
  }
}
