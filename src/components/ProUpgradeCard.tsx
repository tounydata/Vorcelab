import { useState } from 'react'
import { usePlanTier } from '../lib/usePlanTier'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import { useTrackEvent } from '../lib/useTrackEvent'

// Carte d'incitation PRO en tête du Dashboard, pour les comptes gratuits.
// Présence permanente mais NON intrusive : masquable pour la session (pas de
// modal qui s'ouvre à chaque visite → ça ferait fuir). Le clic rouvre la vraie
// UpgradeModal. Les ProGate contextuels font le reste de la conversion.

const DISMISS_KEY = 'vl-pro-card-dismissed'

const PERKS = [
  'Plan complet jusqu\'au jour J',
  'Stratégies GPX illimitées',
  'Analyse avancée prévu/réel',
]

export default function ProUpgradeCard() {
  const { tier, isAdmin, isLoading } = usePlanTier()
  const { openModal } = useUpgradeModal()
  const track = useTrackEvent()
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')

  // Uniquement pour les comptes gratuits (jamais admin ni PRO), et pas pendant le chargement.
  if (isLoading || isAdmin || tier !== 'free' || dismissed) return null

  function handleUpgrade() {
    track('dashboard_pro_card_click')
    openModal()
  }

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: '1.5rem',
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
        background: 'linear-gradient(150deg, #140503 0%, #24090100 60%), var(--vl-surf)',
        border: '1px solid color-mix(in oklab, var(--vl-ember) 35%, var(--vl-line))',
      }}
    >
      {/* Glow ember */}
      <div style={{
        position: 'absolute', top: -70, right: -70, width: 220, height: 220, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,80,30,0.18) 0%, transparent 65%)', pointerEvents: 'none',
      }} />

      <button
        onClick={handleDismiss}
        aria-label="Masquer"
        style={{
          position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--vl-text-3)', fontSize: 12, lineHeight: 1, zIndex: 2,
        }}
      >✕</button>

      <div style={{ padding: '18px 18px 16px', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          border: '1px solid var(--vl-ember)', borderRadius: 999, padding: '2px 10px', marginBottom: 12,
          fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.14em',
          color: 'var(--vl-ember)', background: 'rgba(255,80,30,0.1)',
        }}>★ PASSER À PRO</div>

        <div style={{
          fontFamily: 'var(--vl-display)', fontSize: '1.35rem', fontWeight: 800,
          color: 'var(--vl-text)', lineHeight: 1.1, marginBottom: 10, maxWidth: '85%',
        }}>
          Débloque tout ton potentiel de coureur
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
          {PERKS.map((p) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--vl-text-2)' }}>
              <span style={{ color: 'var(--vl-growth)', fontWeight: 700, flexShrink: 0 }}>✓</span>
              {p}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            onClick={handleUpgrade}
            style={{
              background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none',
              borderRadius: 'var(--vl-r-sm)', padding: '11px 20px', cursor: 'pointer',
              fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 800, letterSpacing: '.04em',
              boxShadow: '0 5px 22px rgba(255,80,30,0.32)',
            }}
          >
            Voir les offres →
          </button>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
            dès 4,17€/mois
          </span>
        </div>
      </div>
    </div>
  )
}
