import { useEffect } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTrackEvent } from '../lib/useTrackEvent'

const IconCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default function PaymentSuccessPage() {
  const track = useTrackEvent()
  const queryClient = useQueryClient()

  useEffect(() => {
    track('plan_upgraded')
    // Le webhook vient de passer le compte en PRO — on purge le cache du plan
    // (staleTime 5 min) pour que le retour au dashboard soit déjà débloqué.
    queryClient.invalidateQueries({ queryKey: ['plan-tier'] })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--vl-bg)',
    }}>
      <div style={{
        maxWidth: 440, width: '100%', textAlign: 'center',
        padding: '48px 40px',
        background: 'var(--vl-surf)',
        border: '1px solid var(--vl-line)',
        borderRadius: 20,
        boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'color-mix(in oklab, var(--vl-ember) 14%, transparent)',
          border: '2px solid var(--vl-ember)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          color: 'var(--vl-ember)',
        }}>
          <IconCheck />
        </div>

        <div style={{
          fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '.14em', color: 'var(--vl-ember)',
          marginBottom: 12,
        }}>BIENVENUE DANS LE CLAN PRO</div>

        <div style={{
          fontFamily: 'var(--vl-display)',
          fontSize: 'clamp(1.8rem, 5vw, 2.4rem)',
          fontWeight: 800, lineHeight: 1.1,
          color: 'var(--vl-text)',
          marginBottom: 16,
        }}>
          Paiement<br />confirmé
        </div>

        <div style={{
          fontFamily: 'var(--vl-mono)', fontSize: 11,
          color: 'var(--vl-text-3)', lineHeight: 1.7,
          marginBottom: 36,
        }}>
          Ton accès PRO est actif. Le plan complet, les stratégies illimitées
          et toutes les analyses avancées sont débloqués.
        </div>

        <Link to="/" style={{ textDecoration: 'none' }}>
          <button style={{
            display: 'block', width: '100%',
            background: 'var(--vl-ember)', color: 'var(--vl-ink)',
            border: 'none', borderRadius: 12, padding: '15px',
            fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 800,
            letterSpacing: '.05em', cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(255,80,30,0.32)',
          }}>
            COMMENCER MON ENTRAÎNEMENT →
          </button>
        </Link>
      </div>
    </div>
  )
}
