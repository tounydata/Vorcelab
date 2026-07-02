import { useState, useEffect } from 'react'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import { predictRaceTimeS, fmtRaceTime, estimateVdotGain } from '../lib/raceTimeProjection'
import { useVLStore } from '../store/vlStore'

/* eslint-disable @typescript-eslint/no-explicit-any */
const STRIPE_ANNUAL_URL: string = (import.meta as any).env?.VITE_STRIPE_ANNUAL_URL ?? ''
const STRIPE_MONTHLY_URL: string = (import.meta as any).env?.VITE_STRIPE_MONTHLY_URL ?? ''
/* eslint-enable @typescript-eslint/no-explicit-any */

const IconStar = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const IconCheck = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="2 6 5 9 10 3" />
  </svg>
)

const IconCalendar = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const IconMap = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
  </svg>
)

const IconChart = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

const IconBolt = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

const PERKS = [
  { Icon: IconCalendar, title: 'Plan complet jusqu\'au jour J', sub: 'Toutes les semaines, chaque séance, co-périodisées avec le renfo' },
  { Icon: IconMap, title: 'Stratégies GPX illimitées', sub: 'Toutes tes courses, toutes les éditions' },
  { Icon: IconChart, title: 'Analyse avancée', sub: 'Prévu/réel, durabilité, zones FC par activité' },
  { Icon: IconBolt, title: 'Accès prioritaire aux nouveautés', sub: 'Beta features en avant-première' },
]

export default function UpgradeModal() {
  const { open, teaser, closeModal } = useUpgradeModal()
  const user = useVLStore((s) => s.user)
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

  const vdotGain = teaser ? estimateVdotGain(teaser.weeksToRace) : 0
  const distM = (teaser?.distanceKm ?? 0) * 1000
  const currentVdot = teaser?.vdot ?? 0
  const currentTimeS = distM > 0 && currentVdot > 0 ? predictRaceTimeS(currentVdot, distM) : null
  const coachTimeS = distM > 0 && currentVdot > 0 ? predictRaceTimeS(currentVdot + vdotGain, distM) : null
  const savedSeconds = currentTimeS && coachTimeS ? currentTimeS - coachTimeS : 0
  const savedMin = Math.floor(savedSeconds / 60)
  const savedSec = Math.round(savedSeconds % 60)

  function handleCTA() {
    const base = billing === 'annual' ? STRIPE_ANNUAL_URL : STRIPE_MONTHLY_URL
    if (base) {
      // Stripe Payment Links acceptent ?client_reference_id= pour retrouver l'user côté webhook
      const url = user?.id ? `${base}?client_reference_id=${user.id}&prefilled_email=${encodeURIComponent(user.email ?? '')}` : base
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
        background: mounted ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0)',
        backdropFilter: mounted ? 'blur(10px)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        transition: 'background 0.25s, backdrop-filter 0.25s',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--vl-surf)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)',
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
          opacity: mounted ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.4,0.64,1), opacity 0.22s',
          flexShrink: 0,
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(150deg, #0c0300 0%, #2a0d00 50%, #180404 100%)',
          padding: '32px 32px 28px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Glow */}
          <div style={{
            position: 'absolute', top: -80, right: -80, width: 300, height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,80,30,0.2) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          <button
            onClick={closeModal}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, lineHeight: 1,
            }}
          >✕</button>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            border: '1px solid var(--vl-ember)', borderRadius: 999,
            padding: '3px 12px', marginBottom: 18,
            fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '.14em', color: 'var(--vl-ember)',
            background: 'rgba(255,80,30,0.12)',
          }}><IconStar /> PRO</div>

          <div style={{
            fontFamily: 'var(--vl-display)',
            fontSize: 'clamp(1.9rem, 5vw, 2.6rem)',
            fontWeight: 800, lineHeight: 1.0, color: '#fff',
          }}>
            Libère tout<br />ton potentiel
          </div>

          {teaser?.raceName && (
            <div style={{
              marginTop: 12, fontFamily: 'var(--vl-mono)', fontSize: 10,
              color: 'rgba(255,255,255,0.35)', letterSpacing: '.04em',
            }}>
              {teaser.raceName}
            </div>
          )}
        </div>

        {/* ── Perf comparison (si données réelles disponibles) ─────────── */}
        {currentTimeS && coachTimeS && (
          <div style={{
            padding: '24px 32px 20px',
            borderBottom: '1px solid var(--vl-line)',
            background: 'var(--vl-surf-2)',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center', gap: 16,
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--vl-text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Aujourd'hui</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(2rem, 6vw, 2.8rem)', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>
                  {fmtRaceTime(currentTimeS)}
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 6 }}>VDOT {Math.round(currentVdot)}</div>
              </div>

              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                border: '1.5px solid var(--vl-ember)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--vl-ember)', fontSize: 16, fontWeight: 700,
              }}>→</div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--vl-ember)', textTransform: 'uppercase', marginBottom: 8 }}>Avec le coach</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(2rem, 6vw, 2.8rem)', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1 }}>
                  {fmtRaceTime(coachTimeS)}
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 6 }}>VDOT {Math.round(currentVdot + vdotGain)}</div>
              </div>
            </div>

            {savedMin > 0 && (
              <div style={{
                marginTop: 16, textAlign: 'center',
                padding: '9px 16px', borderRadius: 10,
                background: 'color-mix(in oklab, var(--vl-ember) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--vl-ember) 30%, transparent)',
              }}>
                <span style={{ fontFamily: 'var(--vl-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--vl-ember)' }}>
                  −{savedMin}min{savedSec > 0 ? ` ${savedSec}sec` : ''}
                </span>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginLeft: 8 }}>de gain estimé sur {teaser?.distanceKm} km</span>
              </div>
            )}
          </div>
        )}

        {/* ── Perks ───────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--vl-line)' }}>
          {PERKS.map(({ Icon, title, sub }, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '10px 0',
              borderBottom: i < PERKS.length - 1 ? '1px solid var(--vl-line)' : 'none',
            }}>
              {/* Icône feature */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'color-mix(in oklab, var(--vl-ember) 10%, var(--vl-surf-2))',
                border: '1px solid color-mix(in oklab, var(--vl-ember) 25%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--vl-ember)',
              }}>
                <Icon />
              </div>
              <div style={{ flex: 1, paddingTop: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)', lineHeight: 1.3 }}>{title}</span>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    background: 'color-mix(in oklab, var(--vl-growth) 18%, transparent)',
                    border: '1.5px solid var(--vl-growth)',
                    color: 'var(--vl-growth)',
                  }}>
                    <IconCheck />
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-3)', marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Pricing + CTA ───────────────────────────────────────────────── */}
        <div style={{ padding: '20px 32px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Mensuel */}
            <button
              onClick={() => setBilling('monthly')}
              style={{
                border: `2px solid ${billing === 'monthly' ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                borderRadius: 12, background: billing === 'monthly'
                  ? 'color-mix(in oklab, var(--vl-ember) 8%, var(--vl-surf-2))'
                  : 'var(--vl-surf-2)',
                cursor: 'pointer', padding: '14px 16px', textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>5€</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 5 }}>PAR MOIS</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 3 }}>sans engagement</div>
            </button>

            {/* Annuel */}
            <button
              onClick={() => setBilling('annual')}
              style={{
                border: `2px solid ${billing === 'annual' ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                borderRadius: 12, background: billing === 'annual'
                  ? 'color-mix(in oklab, var(--vl-ember) 8%, var(--vl-surf-2))'
                  : 'var(--vl-surf-2)',
                cursor: 'pointer', padding: '14px 16px', textAlign: 'left',
                position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: -1, right: 10,
                background: 'var(--vl-ember)', color: 'var(--vl-ink)',
                borderRadius: '0 0 7px 7px', padding: '2px 8px',
                fontFamily: 'var(--vl-mono)', fontSize: 7.5, fontWeight: 700, letterSpacing: '.1em',
              }}>MEILLEUR PLAN</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>50€</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 5 }}>PAR AN</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', marginTop: 3 }}>4,17€/mois — économise 17%</div>
            </button>
          </div>

          <button
            onClick={handleCTA}
            style={{
              display: 'block', width: '100%', textAlign: 'center',
              background: 'var(--vl-ember)', color: 'var(--vl-ink)',
              border: 'none', borderRadius: 12, padding: '16px',
              fontFamily: 'var(--vl-display)', fontSize: '1rem', fontWeight: 800,
              letterSpacing: '.05em', cursor: 'pointer',
              boxShadow: '0 6px 28px rgba(255,80,30,0.38)',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1.01)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            {billing === 'annual' ? 'DÉMARRER — 50€/AN →' : 'DÉMARRER — 5€/MOIS →'}
          </button>

          <div style={{
            textAlign: 'center', fontFamily: 'var(--vl-mono)', fontSize: 9,
            color: 'var(--vl-text-3)', marginTop: 10, lineHeight: 1.7,
          }}>
            Paiement sécurisé · Résiliable à tout moment · Données toujours accessibles
          </div>
        </div>
      </div>
    </div>
  )
}
