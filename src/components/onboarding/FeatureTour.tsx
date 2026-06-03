import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useVLStore } from '../../store/vlStore'

// Tuto des FONCTIONS (distinct de l'onboarding de setup profil). Première visite
// → s'ouvre une fois ; rejouable via le bouton « ? ». Flag local versionné :
// changer la version ré-affiche le tuto à tout le monde.
const SEEN_KEY = 'vl-feature-tour-v1'

/** Ouvre le tuto manuellement (bouton « ? »). */
export function openFeatureTour() {
  window.dispatchEvent(new CustomEvent('vl:open-tour'))
}

type Step = { tag: string; title: string; body: string; color: string }

const STEPS: Step[] = [
  {
    tag: 'Bienvenue',
    title: 'Ton labo de coureur',
    body: "Vorcelab répond à une question simple : qu'est-ce que je fais aujourd'hui, et où j'en suis vers ta course ? Tout est calculé localement à partir de tes activités — aucune IA, aucune donnée envoyée.",
    color: 'var(--vl-ember)',
  },
  {
    tag: 'Dashboard',
    title: 'Ta vue du jour',
    body: 'Ta stratégie de course en proue, ton état du jour (forme · fatigue · fraîcheur) et tes dernières sorties. Le point d’entrée pour piloter ta semaine.',
    color: 'var(--vl-status-prod)',
  },
  {
    tag: 'Coach',
    title: 'Ton plan vers le jour J',
    body: 'La périodisation (base → développement → spécifique → affûtage → course), tes séances proposées — jamais imposées — et le « pourquoi » de chaque choix. Le plan s’adapte à ton ressenti.',
    color: 'var(--vl-ember)',
  },
  {
    tag: 'Renfo · Analyse · Nutrition',
    title: 'Le reste de l’atelier',
    body: 'Le renfo co-périodisé avec ta course, un débrief de chaque séance (allure, FC, dérive), et tes produits de ravitaillement pour la stratégie de course. Le « ? » en haut rejoue ce tuto quand tu veux.',
    color: 'var(--color-renfo)',
  },
]

export default function FeatureTour() {
  const { user } = useVLStore()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  // Réutilise le cache de l'onboarding de setup : on n'ouvre le tuto fonctions
  // qu'une fois le setup profil terminé (évite deux modales superposées).
  const { data: onboardingDone } = useQuery({
    queryKey: ['onboarding-done', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('onboarding_done').eq('id', user!.id).maybeSingle()
      return data?.onboarding_done ?? null
    },
  })

  // Auto-ouverture : setup fait + tuto jamais vu.
  useEffect(() => {
    if (!user || onboardingDone !== true) return
    let seen = false
    try { seen = !!localStorage.getItem(SEEN_KEY) } catch { /* localStorage indispo */ }
    if (!seen) { setStep(0); setOpen(true) }
  }, [user, onboardingDone])

  // Ouverture manuelle (bouton « ? »).
  useEffect(() => {
    const handler = () => { setStep(0); setOpen(true) }
    window.addEventListener('vl:open-tour', handler)
    return () => window.removeEventListener('vl:open-tour', handler)
  }, [])

  if (!open) return null

  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ } }
  const close = () => { markSeen(); setOpen(false) }
  const next = () => { if (step >= STEPS.length - 1) close(); else setStep((s) => s + 1) }
  const isLast = step === STEPS.length - 1
  const s = STEPS[step]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Découverte de Vorcelab"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.62)', backdropFilter: 'blur(2px)', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)',
          borderRadius: 'var(--vl-r-lg)', padding: '22px 22px 18px', position: 'relative',
          boxShadow: '0 30px 80px -30px rgba(0,0,0,.8)',
          borderTop: `3px solid ${s.color}`,
        }}
      >
        {/* Skip */}
        <button
          onClick={close}
          style={{
            position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--vl-text-3)',
          }}
        >
          Passer ✕
        </button>

        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: s.color, fontWeight: 700, marginBottom: 8 }}>
          {s.tag}
        </div>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.05, letterSpacing: '.01em', marginBottom: 10 }}>
          {s.title}
        </div>
        <div style={{ fontSize: '.92rem', lineHeight: 1.6, color: 'var(--vl-text-2)', minHeight: 96 }}>
          {s.body}
        </div>

        {/* Footer : points + suivant */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((_, i) => (
              <span
                key={i}
                onClick={() => setStep(i)}
                style={{
                  width: i === step ? 18 : 7, height: 7, borderRadius: 4, cursor: 'pointer', transition: 'width .2s',
                  background: i === step ? s.color : 'var(--vl-line-2)',
                }}
              />
            ))}
          </div>
          <button
            onClick={next}
            style={{
              background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', borderRadius: 'var(--vl-r-sm)',
              padding: '9px 18px', fontFamily: 'var(--vl-display)', fontSize: '.95rem', fontWeight: 700, letterSpacing: '.06em', cursor: 'pointer',
            }}
          >
            {isLast ? "C'est parti →" : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>
  )
}
