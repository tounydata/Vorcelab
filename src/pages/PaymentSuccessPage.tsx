import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { useTrackEvent } from '../lib/useTrackEvent'
import { derivePaymentState } from '../lib/paymentStatus'

const TIMEOUT_MS = 25_000
const POLL_MS = 2_000

const IconCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconSpinner = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 9 9">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
    </path>
  </svg>
)

// Confirme l'accès PRO en interrogeant le SERVEUR (le webhook Stripe a écrit le
// plan en base ; la RLS ne renvoie que la ligne de l'utilisateur). On ne se fie
// jamais au simple fait d'avoir ouvert cette URL.
export default function PaymentSuccessPage() {
  const user = useVLStore((s) => s.user)
  const track = useTrackEvent()
  const queryClient = useQueryClient()
  const startedAt = useRef(Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const viewTracked = useRef(false)
  const confirmTracked = useRef(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payment-verify', user?.id],
    enabled: !!user,
    // Poll tant que le plan n'est pas confirmé et qu'on est dans la fenêtre.
    refetchInterval: (q) =>
      q.state.data?.pro || Date.now() - startedAt.current > TIMEOUT_MS ? false : POLL_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('plan_tier, plan_expires_at, is_admin')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      const expires = data.plan_expires_at ? new Date(data.plan_expires_at) : null
      const pro = data.is_admin === true || (data.plan_tier === 'pro' && (!expires || expires > new Date()))
      return { pro }
    },
  })

  // Horloge pour distinguer « en traitement » de « introuvable après délai ».
  useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 1000)
    return () => clearInterval(id)
  }, [])

  const state = derivePaymentState({
    hasUser: !!user,
    isLoading,
    isError,
    planIsPro: data?.pro === true,
    elapsedMs,
    timeoutMs: TIMEOUT_MS,
  })

  // Vue de la page (event client, distinct de `plan_upgraded` émis par le webhook
  // → pas de double comptage de la conversion).
  useEffect(() => {
    if (user && !viewTracked.current) {
      viewTracked.current = true
      track('payment_success_viewed')
    }
  }, [user, track])

  // Quand le serveur confirme le PRO : on débloque le cache du plan.
  useEffect(() => {
    if (state === 'confirmed' && !confirmTracked.current) {
      confirmTracked.current = true
      queryClient.invalidateQueries({ queryKey: ['plan-tier'] })
    }
  }, [state, queryClient])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--vl-bg)' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: '48px 40px', background: 'var(--vl-surf)', border: '1px solid var(--vl-line)', borderRadius: 20, boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }}>
        <StatusIcon state={state} />
        <Content state={state} />
      </div>
    </div>
  )
}

function StatusIcon({ state }: { state: ReturnType<typeof derivePaymentState> }) {
  const confirmed = state === 'confirmed'
  const spinning = state === 'loading' || state === 'processing'
  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%',
      background: confirmed ? 'color-mix(in oklab, var(--vl-ember) 14%, transparent)' : 'color-mix(in oklab, var(--vl-text-3) 12%, transparent)',
      border: `2px solid ${confirmed ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 24px', color: confirmed ? 'var(--vl-ember)' : 'var(--vl-text-3)',
    }}>
      {confirmed ? <IconCheck /> : spinning ? <IconSpinner /> : <span style={{ fontSize: 28 }}>·</span>}
    </div>
  )
}

function Content({ state }: { state: ReturnType<typeof derivePaymentState> }) {
  const kicker = (t: string, color = 'var(--vl-ember)') => (
    <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color, marginBottom: 12 }}>{t}</div>
  )
  const title = (t: ReactNode) => (
    <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(1.8rem, 5vw, 2.4rem)', fontWeight: 800, lineHeight: 1.1, color: 'var(--vl-text)', marginBottom: 16 }}>{t}</div>
  )
  const body = (t: string) => (
    <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)', lineHeight: 1.7, marginBottom: 36 }}>{t}</div>
  )
  const primaryBtn = (label: string, to: string) => (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <button style={{ display: 'block', width: '100%', background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', borderRadius: 12, padding: '15px', fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 800, letterSpacing: '.05em', cursor: 'pointer', boxShadow: '0 6px 24px rgba(255,80,30,0.32)' }}>{label}</button>
    </Link>
  )

  switch (state) {
    case 'confirmed':
      return (<>
        {kicker('BIENVENUE DANS LE CLAN PRO')}
        {title(<>Paiement<br />confirmé</>)}
        {body('Ton accès PRO est actif. Le plan complet, les stratégies illimitées et toutes les analyses avancées sont débloqués.')}
        {primaryBtn('COMMENCER MON ENTRAÎNEMENT →', '/')}
      </>)
    case 'loading':
    case 'processing':
      return (<>
        {kicker('PAIEMENT REÇU', 'var(--vl-text-3)')}
        {title(<>Activation<br />en cours…</>)}
        {body('Merci ! Nous confirmons ton abonnement auprès de Stripe. Cela prend généralement quelques secondes — cette page se met à jour automatiquement.')}
        {primaryBtn('ALLER AU TABLEAU DE BORD', '/')}
      </>)
    case 'not_found':
      return (<>
        {kicker('EN ATTENTE DE CONFIRMATION', 'var(--vl-text-3)')}
        {title('Presque là')}
        {body('Ton paiement est peut-être encore en traitement chez Stripe. Si ton accès PRO n\'apparaît pas d\'ici quelques minutes, contacte le support avec ton reçu Stripe — nous vérifierons.')}
        {primaryBtn('RETOUR AU TABLEAU DE BORD', '/')}
      </>)
    case 'not_logged_in':
      return (<>
        {kicker('CONNEXION REQUISE', 'var(--vl-text-3)')}
        {title('Connecte-toi')}
        {body('Connecte-toi avec le compte utilisé pour le paiement afin de confirmer et débloquer ton accès PRO.')}
        {primaryBtn('SE CONNECTER', '/login')}
      </>)
    case 'error':
    default:
      return (<>
        {kicker('VÉRIFICATION IMPOSSIBLE', 'var(--vl-text-3)')}
        {title(<>Un souci est<br />survenu</>)}
        {body('Nous n\'avons pas pu vérifier ton abonnement à l\'instant. Recharge la page ; si le problème persiste, contacte le support avec ton reçu Stripe.')}
        {primaryBtn('RETOUR AU TABLEAU DE BORD', '/')}
      </>)
  }
}
