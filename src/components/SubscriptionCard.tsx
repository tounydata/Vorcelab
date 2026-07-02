import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePlanTier } from '../lib/usePlanTier'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import { useTrackEvent } from '../lib/useTrackEvent'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'

// Carte ABONNEMENT (Réglages) :
//   - Gratuit  → statut + CTA « Passer à PRO » (ouvre la modal).
//   - PRO      → statut + date de fin + « Gérer mon abonnement » (portail Stripe).
//   - Admin    → PRO permanent. Le bouton « Gérer » apparaît quand même s'il y a
//               un vrai abonnement Stripe rattaché (l'admin a payé lui-même).
// Le bouton « Gérer » s'affiche dès qu'un stripe_customer_id existe, quel que
// soit le tier — un compte sans customer (PRO accordé manuellement) ne l'a pas.

const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

const PORTAL_ERRORS: Record<string, string> = {
  no_customer: "Aucun abonnement Stripe rattaché à ce compte. Écris-nous à hello@vorcelab.com.",
  not_configured: "Le portail n'est pas encore activé. Réessaie plus tard ou écris-nous à hello@vorcelab.com.",
  portal_not_configured: "Le portail n'est pas encore activé. Réessaie plus tard ou écris-nous à hello@vorcelab.com.",
}

export default function SubscriptionCard() {
  const user = useVLStore((s) => s.user)
  const { tier, isAdmin, expiresAt } = usePlanTier()
  const { openModal } = useUpgradeModal()
  const track = useTrackEvent()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Existence d'un abonnement Stripe (customer) → conditionne le bouton « Gérer ».
  const { data: stripeCustomerId } = useQuery<string | null>({
    queryKey: ['stripe-customer', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user!.id)
        .maybeSingle()
      return (data?.stripe_customer_id as string | null) ?? null
    },
  })
  const hasSubscription = !!stripeCustomerId

  async function openPortal() {
    setErr('')
    setLoading(true)
    track('subscription_manage_click')
    const generic = "Impossible d'ouvrir le portail pour le moment. Écris-nous à hello@vorcelab.com."
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', { body: {} })

      // Succès (2xx) : la fonction renvoie { url }.
      const url = (data as { url?: string } | null)?.url
      if (url) {
        window.location.href = url
        return
      }

      // Erreur HTTP : supabase-js range la réponse dans error.context — on en
      // extrait le code métier (no_customer, portal_not_configured…).
      let code = ''
      const ctx = (error as { context?: Response } | null)?.context
      if (ctx) {
        try { code = ((await ctx.json()) as { error?: string })?.error ?? '' } catch { /* réponse non-JSON */ }
      }
      setErr(PORTAL_ERRORS[code] ?? generic)
    } catch {
      setErr(generic)
    } finally {
      setLoading(false)
    }
  }

  const badge = (label: string, color: string) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
      color, border: `1px solid ${color}`, borderRadius: 999, padding: '3px 11px',
      background: `color-mix(in oklab, ${color} 12%, transparent)`,
    }}>{label}</span>
  )

  // Bloc « Gérer mon abonnement » (portail Stripe), réutilisé admin + PRO.
  const manageBlock = (
    <div style={{ marginTop: 12 }}>
      <button className="hbtn" onClick={openPortal} disabled={loading}>
        {loading ? 'Ouverture…' : 'Gérer mon abonnement'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--vl-text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>
        Résilier, changer de carte, télécharger tes factures — via Stripe.
      </p>
      {err && <p style={{ fontSize: 11, color: 'var(--vl-ember)', margin: '8px 0 0', lineHeight: 1.5 }}>{err}</p>}
    </div>
  )

  return (
    <div className="card" style={{ margin: '1.25rem 0 1rem' }}>
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>ABONNEMENT</div>

      {isAdmin ? (
        <>
          {badge('PRO · ADMIN', 'var(--vl-ember)')}
          <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '10px 0 0', lineHeight: 1.5 }}>
            Compte administrateur — accès PRO permanent.
          </p>
          {hasSubscription && manageBlock}
        </>
      ) : tier === 'pro' ? (
        <>
          {badge('PRO · ACTIF', 'var(--vl-growth)')}
          <p style={{ fontSize: 12, color: 'var(--vl-text-2)', margin: '10px 0 0', lineHeight: 1.5 }}>
            Merci de ton soutien 🙏 Tu as accès à toutes les fonctionnalités.
            {expiresAt && (
              <><br /><span style={{ color: 'var(--vl-text-3)' }}>Renouvellement / fin de période le {fmtDate(expiresAt)}.</span></>
            )}
          </p>
          {hasSubscription ? manageBlock : (
            <p style={{ fontSize: 11, color: 'var(--vl-text-3)', margin: '10px 0 0', lineHeight: 1.5 }}>
              Accès accordé manuellement — aucun abonnement à gérer.
            </p>
          )}
        </>
      ) : (
        <>
          {badge('GRATUIT', 'var(--vl-text-3)')}
          <p style={{ fontSize: 12, color: 'var(--vl-text-2)', margin: '10px 0 14px', lineHeight: 1.5 }}>
            Passe à PRO pour débloquer le plan complet jusqu'au jour J, les stratégies GPX
            illimitées et l'analyse avancée. Dès 4,17€/mois.
          </p>
          <button
            className="hbtn"
            style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', borderColor: 'var(--vl-ember)', fontWeight: 700 }}
            onClick={() => openModal()}
          >
            Passer à PRO →
          </button>
        </>
      )}
    </div>
  )
}
