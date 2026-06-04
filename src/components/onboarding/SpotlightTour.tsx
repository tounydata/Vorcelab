import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router'
import { useVLStore } from '../../store/vlStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { PAGE_TOURS, type TourStep } from './spotlightTours'

// Tuto contextuel à SPOTLIGHT : floute tout sauf l'élément expliqué, se déplace
// d'étape en étape. Déclenché à l'entrée d'une page (1ʳᵉ visite), rejouable via « ? ».
// L'état « vu » est persisté côté serveur (profiles.tours_seen / tours_off) afin de
// ne pas se rejouer en navigation privée ou sur un autre appareil ; localStorage sert
// de cache synchrone pour la session courante.
const seenKey = (id: string) => `vl-tour-${id}-v1`
const TOURS_OFF = 'vl-tours-off' // « ne plus afficher » global
const PAD = 8

function localOff(): boolean {
  try { return !!localStorage.getItem(TOURS_OFF) } catch { return false }
}
function localSeen(id: string): boolean {
  try { return !!localStorage.getItem(seenKey(id)) } catch { return false }
}
function markSeenLocal(id: string) {
  try { localStorage.setItem(seenKey(id), '1') } catch { /* localStorage indispo */ }
}

// Persistance serveur best-effort (n'empêche jamais l'affichage du tuto).
async function persistSeenServer(userId: string, id: string) {
  try {
    const { data } = await supabase.from('profiles').select('tours_seen').eq('id', userId).maybeSingle()
    const arr: string[] = data?.tours_seen ?? []
    if (!arr.includes(id)) {
      await supabase.from('profiles').update({ tours_seen: [...arr, id] }).eq('id', userId)
    }
  } catch { /* hors-ligne : le cache localStorage suffit pour la session */ }
}
async function persistOffServer(userId: string) {
  try { await supabase.from('profiles').update({ tours_off: true }).eq('id', userId) } catch { /* ignore */ }
}

/** Rejoue le tuto de la page courante (bouton « ? »). */
export function openFeatureTour() {
  window.dispatchEvent(new CustomEvent('vl:open-tour'))
}

export default function SpotlightTour() {
  const { user } = useVLStore()
  const { pathname } = useLocation()
  const [steps, setSteps] = useState<TourStep[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const tourIdRef = useRef<string | null>(null)

  const currentTour = useCallback(() => PAGE_TOURS.find((t) => t.match(pathname)) ?? null, [pathname])

  // On n'auto-déclenche qu'une fois le setup profil terminé (pas de superposition).
  // On lit aussi l'état des tutos persisté côté serveur (vu / désactivés).
  const { data: tourState } = useQuery({
    queryKey: ['tour-state', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('onboarding_done, tours_seen, tours_off').eq('id', user!.id).maybeSingle()
      return {
        onboardingDone: data?.onboarding_done ?? null,
        toursSeen: (data?.tours_seen ?? []) as string[],
        toursOff: !!data?.tours_off,
      }
    },
  })
  const onboardingDone = tourState?.onboardingDone

  // « vu » = cache local OU persistance serveur (couvre navigation privée / multi-appareil).
  const isSeen = useCallback(
    (id: string) => localSeen(id) || (tourState?.toursSeen.includes(id) ?? false),
    [tourState],
  )
  const isOff = useCallback(() => localOff() || (tourState?.toursOff ?? false), [tourState])

  // Marque un tuto comme vu : cache local immédiat + persistance serveur best-effort.
  const markSeen = useCallback((id: string) => {
    markSeenLocal(id)
    if (user) persistSeenServer(user.id, id)
  }, [user])

  const start = useCallback((tour: { id: string; steps: TourStep[] }) => {
    tourIdRef.current = tour.id
    setIdx(0)
    setSteps(tour.steps)
  }, [])

  // Auto-déclenchement à l'entrée d'une page non encore vue.
  useEffect(() => {
    if (!user || onboardingDone !== true || isOff()) return
    const tour = currentTour()
    if (!tour) { setSteps(null); return }
    if (isSeen(tour.id)) return
    // On ne démarre que si la 1ʳᵉ cible est présente (page prête / section dispo).
    const t = setTimeout(() => {
      if (document.querySelector(tour.steps[0].selector)) {
        markSeen(tour.id) // vu = dès l'affichage (sinon re-déclenché à chaque login si on quitte avant la fin)
        start(tour)
      }
    }, 650)
    return () => clearTimeout(t)
  }, [pathname, user, onboardingDone, currentTour, start, isOff, isSeen, markSeen])

  // Rejeu manuel (bouton « ? ») sur la page courante.
  useEffect(() => {
    const handler = () => { const tour = currentTour(); if (tour) start(tour) }
    window.addEventListener('vl:open-tour', handler)
    return () => window.removeEventListener('vl:open-tour', handler)
  }, [currentTour, start])

  // Mesure de la cible de l'étape courante (+ suivi scroll/resize).
  useEffect(() => {
    if (!steps) return
    let raf = 0
    let tries = 0
    const locate = () => {
      const el = document.querySelector(steps[idx].selector) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        window.setTimeout(() => setRect(el.getBoundingClientRect()), 240)
      } else if (tries++ < 25) {
        raf = requestAnimationFrame(locate)
      } else {
        // Cible absente (section conditionnelle) → on saute cette étape.
        if (idx >= steps.length - 1) {
          const id = tourIdRef.current
          if (id) markSeen(id)
          setSteps(null); setRect(null)
        } else {
          setIdx((i) => i + 1)
        }
      }
    }
    locate()
    const onMove = () => {
      const el = document.querySelector(steps[idx].selector) as HTMLElement | null
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [steps, idx, markSeen])

  if (!steps) return null
  const step = steps[idx]
  const isLast = idx >= steps.length - 1

  const finish = () => {
    const id = tourIdRef.current
    if (id) markSeen(id)
    setSteps(null); setRect(null)
  }
  const next = () => { if (isLast) finish(); else setIdx((i) => i + 1) }
  const prev = () => setIdx((i) => Math.max(0, i - 1))

  const vw = window.innerWidth, vh = window.innerHeight
  const panel: React.CSSProperties = { position: 'fixed', background: 'rgba(15,15,18,.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 3000 }

  // Position de la bulle : sous la cible si la place existe, sinon au-dessus, sinon
  // centrée — et jamais plus haute que le viewport (sinon crop hors écran sur mobile).
  const W = Math.min(340, vw - 24)
  const GAP = PAD + 12
  const EST = 200 // hauteur estimée de la bulle pour décider du placement
  let tip: React.CSSProperties
  if (rect) {
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - W / 2, vw - 12 - W))
    const roomBelow = vh - rect.bottom - GAP
    const roomAbove = rect.top - GAP
    if (roomBelow >= Math.min(EST, roomAbove) || roomBelow >= EST) {
      // sous la cible
      tip = { position: 'fixed', top: rect.bottom + GAP, left, width: W, maxHeight: Math.max(120, roomBelow - 8), overflowY: 'auto', zIndex: 3002 }
    } else if (roomAbove >= 120) {
      // au-dessus de la cible
      tip = { position: 'fixed', bottom: vh - rect.top + GAP, left, width: W, maxHeight: Math.max(120, roomAbove - 8), overflowY: 'auto', zIndex: 3002 }
    } else {
      // pas de place : centrée
      tip = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: W, maxHeight: vh - 24, overflowY: 'auto', zIndex: 3002 }
    }
  } else {
    tip = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: W, maxHeight: vh - 24, overflowY: 'auto', zIndex: 3002 }
  }

  return (
    <>
      {rect ? (
        <>
          {/* 4 panneaux floutés autour de la cible (le trou reste net) */}
          <div style={{ ...panel, top: 0, left: 0, width: '100vw', height: Math.max(0, rect.top - PAD) }} />
          <div style={{ ...panel, top: rect.bottom + PAD, left: 0, width: '100vw', height: Math.max(0, vh - rect.bottom - PAD) }} />
          <div style={{ ...panel, top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
          <div style={{ ...panel, top: rect.top - PAD, left: rect.right + PAD, width: Math.max(0, vw - rect.right - PAD), height: rect.height + PAD * 2 }} />
          {/* anneau de mise en avant */}
          <div style={{ position: 'fixed', top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, border: '2px solid var(--vl-ember)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0)', zIndex: 3001, pointerEvents: 'none' }} />
        </>
      ) : (
        <div style={{ ...panel, inset: 0, width: '100vw', height: '100vh' }} />
      )}

      {/* Bulle d'explication */}
      <div style={{
        ...tip, background: 'var(--vl-surf)', border: '1px solid var(--vl-line-2)', borderTop: '3px solid var(--vl-ember)',
        borderRadius: 'var(--vl-r)', padding: '14px 16px 12px', boxShadow: '0 24px 60px -24px rgba(0,0,0,.85)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.15rem', fontWeight: 800, letterSpacing: '.01em' }}>{step.title}</div>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', flexShrink: 0 }}>{idx + 1}/{steps.length}</span>
        </div>
        <div style={{ fontSize: '.86rem', lineHeight: 1.55, color: 'var(--vl-text-2)' }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
            <button onClick={finish} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--vl-text-3)', padding: 0 }}>
              Passer
            </button>
            <button
              onClick={() => { try { localStorage.setItem(TOURS_OFF, '1') } catch { /* ignore */ } if (user) persistOffServer(user.id); finish() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.02em', color: 'var(--vl-text-3)', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}
            >
              Ne plus afficher
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {idx > 0 && (
              <button onClick={prev} className="hbtn" style={{ fontSize: 10, padding: '5px 10px' }}>← Précédent</button>
            )}
            <button onClick={next} style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', border: 'none', borderRadius: 'var(--vl-r-sm)', padding: '7px 14px', fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.05em', cursor: 'pointer' }}>
              {isLast ? 'Terminer' : 'Suivant →'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
