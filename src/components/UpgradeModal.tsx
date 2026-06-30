import { useState, useEffect } from 'react'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import { predictRaceTimeS, fmtRaceTime, estimateVdotGain } from '../lib/raceTimeProjection'

// ─── Configurer dans .env : ────────────────────────────────────────────────────
//   VITE_STRIPE_ANNUAL_URL=https://buy.stripe.com/…
//   VITE_STRIPE_MONTHLY_URL=https://buy.stripe.com/…
/* eslint-disable @typescript-eslint/no-explicit-any */
const STRIPE_ANNUAL_URL: string = (import.meta as any).env?.VITE_STRIPE_ANNUAL_URL ?? ''
const STRIPE_MONTHLY_URL: string = (import.meta as any).env?.VITE_STRIPE_MONTHLY_URL ?? ''
/* eslint-enable @typescript-eslint/no-explicit-any */

const PERKS = [
  { icon: '🗓', title: 'Plan complet jusqu\'au jour J', sub: 'Toutes les semaines, chaque séance, co-périodisées avec le renfo' },
  { icon: '🗺', title: 'Stratégies GPX illimitées', sub: 'Toutes tes courses, toutes les éditions' },
  { icon: '📊', title: 'Analyse avancée', sub: 'Prévu/réel, durabilité, zones FC par activité' },
  { icon: '⚡', title: 'Accès prioritaire', sub: 'Nouvelles fonctionnalités en avant-première' },
]

export default function UpgradeModal() {
  const { open, teaser, closeModal } = useUpgradeModal()
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (open) {
      setTimeout(() => setMounted(true), 10)
      document.body.style.overflow = 'hidden'
    } else {
      setMounted(false)
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const weeksToRace = teaser?.weeksToRace ?? 0
  const vdotGain = estimateVdotGain(weeksToRace)
  const currentVdot = teaser?.vdot ?? 0
  const distM = (teaser?.distanceKm ?? 0) * 1000
  const currentTimeS = distM > 0 && currentVdot > 0 ? predictRaceTimeS(currentVdot, distM) : null
  const coachTimeS = distM > 0 && currentVdot > 0 ? predictRaceTimeS(currentVdot + vdotGain, distM) : null

  function handleCTA() {
    const url = billing === 'annual' ? STRIPE_ANNUAL_URL : STRIPE_MONTHLY_URL
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      window.open('mailto:hello@vorcelab.com?subject=Passer%20à%20PRO', '_blank')
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: `rgba(0,0,0,${mounted ? 0.75 : 0})`,
        backdropFilter: mounted ? 'blur(8px)' : 'blur(0px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
        transition: 'background 0.25s, backdrop-filter 0.25s',
      }}
    >
      <div
        style={{
          background: 'var(--vl-surf)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
          opacity: mounted ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s',
        }}
      >
        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #130600 0%, #2a1000 55%, #1a0505 100%)',
          padding: '28px 24px 22px',
          position: 'relative',
        }}>
          <button
            onClick={closeModal}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(255,255,255,0.1)', border: 'none',
              cursor: 'pointer', borderRadius: 999, width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700,
              lineHeight: 1,
            }}
          >✕</button>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            border: '1px solid var(--vl-ember)',
            borderRadius: 999, padding: '3px 12px', marginBottom: 14,
            fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '.14em', color: 'var(--vl-ember)',
            background: 'rgba(255,80,30,0.12)',
          }}>✦ PRO</div>

          <div style={{
            fontFamily: 'var(--vl-display)', fontSize: '1.9rem',
            fontWeight: 800, lineHeight: 1.05, color: '#fff',
          }}>
            Libère tout<br />ton potentiel
          </div>

          {teaser?.raceName && (
            <div style={{
              fontFamily: 'var(--vl-mono)', fontSize: 10,
              color: 'rgba(255,255,255,0.4)', marginTop: 8,
              letterSpacing: '.04em',
            }}>
              {teaser.raceName}
              {teaser.distanceKm > 0 ? ` · ${teaser.distanceKm} km` : ''}
              {weeksToRace > 0 ? ` · ${weeksToRace} sem. de plan` : ''}
            </div>
          )}
        </div>

        {/* ── Comparaison perf ────────────────────────────────────────────── */}
        {currentTimeS && coachTimeS && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 28px 1fr',
            alignItems: 'center', gap: 0,
            background: 'var(--vl-surf-2)',
            padding: '18px 24px 14px',
            borderBottom: '1px solid var(--vl-line)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--vl-mono)', fontSize: 8.5, letterSpacing: '.1em',
                color: 'var(--vl-text-3)', marginBottom: 6, textTransform: 'uppercase',
              }}>Aujourd'hui</div>
              <div style={{
                fontFamily: 'var(--vl-display)', fontSize: '1.85rem',
                fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1,
              }}>{fmtRaceTime(currentTimeS)}</div>
              <div style={{
                fontFamily: 'var(--vl-mono)', fontSize: 9,
                color: 'var(--vl-text-3)', marginTop: 5,
              }}>VDOT {Math.round(currentVdot)}</div>
            </div>

            <div style={{ textAlign: 'center', color: 'var(--vl-ember)', fontSize: 18, fontWeight: 700 }}>→</div>

            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--vl-mono)', fontSize: 8.5, letterSpacing: '.1em',
                color: 'var(--vl-ember)', marginBottom: 6, textTransform: 'uppercase',
              }}>Avec le coach</div>
              <div style={{
                fontFamily: 'var(--vl-display)', fontSize: '1.85rem',
                fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1,
              }}>{fmtRaceTime(coachTimeS)}</div>
              <div style={{
                fontFamily: 'var(--vl-mono)', fontSize: 9,
                color: 'var(--vl-text-3)', marginTop: 5,
              }}>visée VDOT {Math.round(currentVdot + vdotGain)}</div>
            </div>
          </div>
        )}

        {/* ── Avantages ───────────────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PERKS.map((p) => (
            <div key={p.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, lineHeight: '1.2', flexShrink: 0 }}>{p.icon}</span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--vl-text)', lineHeight: 1.3 }}>{p.title}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>{p.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tarifs ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {/* Mensuel */}
            <button
              onClick={() => setBilling('monthly')}
              style={{
                border: `2px solid ${billing === 'monthly' ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                borderRadius: 12,
                background: billing === 'monthly' ? 'color-mix(in oklab, var(--vl-ember) 9%, transparent)' : 'var(--vl-surf-2)',
                cursor: 'pointer', padding: '13px 14px', textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>5€</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 4 }}>PAR MOIS</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 3 }}>sans engagement</div>
            </button>

            {/* Annuel */}
            <button
              onClick={() => setBilling('annual')}
              style={{
                border: `2px solid ${billing === 'annual' ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                borderRadius: 12,
                background: billing === 'annual' ? 'color-mix(in oklab, var(--vl-ember) 9%, transparent)' : 'var(--vl-surf-2)',
                cursor: 'pointer', padding: '13px 14px', textAlign: 'left',
                position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: -1, right: 10,
                background: 'var(--vl-ember)', color: 'var(--vl-ink)',
                borderRadius: '0 0 7px 7px', padding: '2px 9px',
                fontFamily: 'var(--vl-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '.08em',
              }}>MEILLEUR PLAN</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>50€</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 4 }}>PAR AN</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', marginTop: 3 }}>soit 4,17€/mois (−17 %)</div>
            </button>
          </div>

          {/* CTA */}
          <button
            onClick={handleCTA}
            style={{
              display: 'block', width: '100%', textAlign: 'center',
              background: 'var(--vl-ember)', color: 'var(--vl-ink)',
              border: 'none', borderRadius: 12, padding: '15px',
              fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 800,
              letterSpacing: '.06em', cursor: 'pointer',
              boxShadow: '0 6px 24px rgba(255,80,30,0.35)',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.92')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {billing === 'annual' ? 'DÉMARRER — 50€/AN →' : 'DÉMARRER — 5€/MOIS →'}
          </button>

          <div style={{
            textAlign: 'center', fontFamily: 'var(--vl-mono)', fontSize: 9,
            color: 'var(--vl-text-3)', marginTop: 10, lineHeight: 1.6,
          }}>
            Paiement sécurisé · Résiliable à tout moment<br />Tes données restent accessibles
          </div>
        </div>
      </div>
    </div>
  )
}
