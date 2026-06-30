import { useState, useEffect } from 'react'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import { predictRaceTimeS, fmtRaceTime, estimateVdotGain } from '../lib/raceTimeProjection'

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

  const savedSeconds = currentTimeS && coachTimeS ? currentTimeS - coachTimeS : 0
  const savedMin = Math.floor(savedSeconds / 60)
  const savedSec = Math.round(savedSeconds % 60)

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
        background: `rgba(0,0,0,${mounted ? 0.82 : 0})`,
        backdropFilter: mounted ? 'blur(12px)' : 'blur(0px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        transition: 'background 0.3s, backdrop-filter 0.3s',
      }}
    >
      <div
        style={{
          background: 'var(--vl-surf)',
          borderRadius: '24px 24px 0 0',
          width: '100%',
          maxWidth: 680,
          maxHeight: '96vh',
          overflowY: 'auto',
          boxShadow: '0 -20px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
          transform: mounted ? 'translateY(0)' : 'translateY(100%)',
          opacity: mounted ? 1 : 0,
          transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s',
        }}
      >
        {/* ── Drag handle ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(160deg, #0e0400 0%, #2d0f00 40%, #1a0505 70%, #0a0a1a 100%)',
          padding: '32px 28px 36px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Glow orbs */}
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 280, height: 280, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,80,30,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -80, left: -40,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,120,40,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <button
            onClick={closeModal}
            aria-label="Fermer"
            style={{
              position: 'absolute', top: 18, right: 18,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer', borderRadius: 999, width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 700,
              lineHeight: 1, transition: 'background 0.15s',
            }}
          >✕</button>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            border: '1px solid var(--vl-ember)',
            borderRadius: 999, padding: '4px 14px', marginBottom: 20,
            fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700,
            letterSpacing: '.16em', color: 'var(--vl-ember)',
            background: 'rgba(255,80,30,0.15)',
          }}>✦ PRO</div>

          <div style={{
            fontFamily: 'var(--vl-display)', fontSize: 'clamp(2rem, 6vw, 2.8rem)',
            fontWeight: 800, lineHeight: 1.0, color: '#fff',
            marginBottom: 10,
          }}>
            Libère tout<br />ton potentiel
          </div>

          {teaser?.raceName && (
            <div style={{
              fontFamily: 'var(--vl-mono)', fontSize: 11,
              color: 'rgba(255,255,255,0.35)', marginTop: 10,
              letterSpacing: '.05em',
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
            background: 'linear-gradient(180deg, var(--vl-surf-2) 0%, var(--vl-surf) 100%)',
            padding: '28px 28px 22px',
            borderBottom: '1px solid var(--vl-line)',
          }}>
            <div style={{
              fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em',
              color: 'var(--vl-text-3)', textTransform: 'uppercase', textAlign: 'center',
              marginBottom: 20,
            }}>Projection sur {teaser?.distanceKm ?? 0} km</div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 48px 1fr',
              alignItems: 'center', gap: 0,
            }}>
              {/* Temps actuel */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em',
                  color: 'var(--vl-text-3)', marginBottom: 10, textTransform: 'uppercase',
                }}>Aujourd'hui</div>
                <div style={{
                  fontFamily: 'var(--vl-display)', fontSize: 'clamp(2.2rem, 7vw, 3rem)',
                  fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1,
                  letterSpacing: '-.01em',
                }}>{fmtRaceTime(currentTimeS)}</div>
                <div style={{
                  fontFamily: 'var(--vl-mono)', fontSize: 10,
                  color: 'var(--vl-text-3)', marginTop: 8,
                }}>VDOT {Math.round(currentVdot)}</div>
              </div>

              {/* Flèche centrale */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'color-mix(in oklab, var(--vl-ember) 15%, transparent)',
                  border: '1px solid var(--vl-ember)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto',
                  color: 'var(--vl-ember)', fontSize: 18, fontWeight: 800,
                }}>→</div>
              </div>

              {/* Temps coach */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em',
                  color: 'var(--vl-ember)', marginBottom: 10, textTransform: 'uppercase',
                }}>Avec le coach</div>
                <div style={{
                  fontFamily: 'var(--vl-display)', fontSize: 'clamp(2.2rem, 7vw, 3rem)',
                  fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1,
                  letterSpacing: '-.01em',
                }}>{fmtRaceTime(coachTimeS)}</div>
                <div style={{
                  fontFamily: 'var(--vl-mono)', fontSize: 10,
                  color: 'var(--vl-text-3)', marginTop: 8,
                }}>visée VDOT {Math.round(currentVdot + vdotGain)}</div>
              </div>
            </div>

            {/* Gain mise en avant */}
            {savedMin > 0 && (
              <div style={{
                marginTop: 20, textAlign: 'center',
                background: 'color-mix(in oklab, var(--vl-ember) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--vl-ember) 35%, transparent)',
                borderRadius: 12, padding: '10px 16px',
              }}>
                <span style={{
                  fontFamily: 'var(--vl-display)', fontWeight: 800,
                  color: 'var(--vl-ember)', fontSize: '1.15rem',
                }}>−{savedMin}min{savedSec > 0 ? ` ${savedSec}sec` : ''}</span>
                <span style={{
                  fontFamily: 'var(--vl-mono)', fontSize: 10,
                  color: 'var(--vl-text-3)', marginLeft: 8,
                }}>de gain estimé</span>
              </div>
            )}
          </div>
        )}

        {/* ── Avantages ───────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 28px 20px' }}>
          <div style={{
            fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em',
            color: 'var(--vl-text-3)', textTransform: 'uppercase', marginBottom: 16,
          }}>Ce que tu débloque</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {PERKS.map((p) => (
              <div key={p.title} style={{
                background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)',
                borderRadius: 12, padding: '14px 14px',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 22, lineHeight: '1.2', flexShrink: 0 }}>{p.icon}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--vl-text)', lineHeight: 1.3 }}>{p.title}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-3)', marginTop: 3, lineHeight: 1.4 }}>{p.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tarifs ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '0 28px 32px' }}>
          <div style={{
            fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em',
            color: 'var(--vl-text-3)', textTransform: 'uppercase', marginBottom: 12,
          }}>Choisir ton offre</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {/* Mensuel */}
            <button
              onClick={() => setBilling('monthly')}
              style={{
                border: `2px solid ${billing === 'monthly' ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                borderRadius: 14,
                background: billing === 'monthly' ? 'color-mix(in oklab, var(--vl-ember) 9%, transparent)' : 'var(--vl-surf-2)',
                cursor: 'pointer', padding: '16px 16px', textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>5€</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 5 }}>PAR MOIS</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 3 }}>sans engagement</div>
            </button>

            {/* Annuel */}
            <button
              onClick={() => setBilling('annual')}
              style={{
                border: `2px solid ${billing === 'annual' ? 'var(--vl-ember)' : 'var(--vl-line)'}`,
                borderRadius: 14,
                background: billing === 'annual' ? 'color-mix(in oklab, var(--vl-ember) 9%, transparent)' : 'var(--vl-surf-2)',
                cursor: 'pointer', padding: '16px 16px', textAlign: 'left',
                position: 'relative',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{
                position: 'absolute', top: -1, right: 12,
                background: 'var(--vl-ember)', color: 'var(--vl-ink)',
                borderRadius: '0 0 8px 8px', padding: '3px 10px',
                fontFamily: 'var(--vl-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '.1em',
              }}>MEILLEUR PLAN</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>50€</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginTop: 5 }}>PAR AN</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', marginTop: 3 }}>soit 4,17€/mois (−17 %)</div>
            </button>
          </div>

          {/* CTA */}
          <button
            onClick={handleCTA}
            style={{
              display: 'block', width: '100%', textAlign: 'center',
              background: 'var(--vl-ember)', color: 'var(--vl-ink)',
              border: 'none', borderRadius: 14, padding: '18px',
              fontFamily: 'var(--vl-display)', fontSize: '1.15rem', fontWeight: 800,
              letterSpacing: '.06em', cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(255,80,30,0.45)',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'scale(1.01)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            {billing === 'annual' ? 'DÉMARRER — 50€/AN →' : 'DÉMARRER — 5€/MOIS →'}
          </button>

          <div style={{
            textAlign: 'center', fontFamily: 'var(--vl-mono)', fontSize: 9.5,
            color: 'var(--vl-text-3)', marginTop: 12, lineHeight: 1.7,
          }}>
            Paiement sécurisé · Résiliable à tout moment<br />Tes données restent accessibles
          </div>
        </div>
      </div>
    </div>
  )
}
