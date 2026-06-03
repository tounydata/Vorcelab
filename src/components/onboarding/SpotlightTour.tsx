import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router'
import { useVLStore } from '../../store/vlStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { PAGE_TOURS, type TourStep } from './spotlightTours'

// Tuto contextuel à SPOTLIGHT : floute tout sauf l'élément expliqué, se déplace
// d'étape en étape. Déclenché à l'entrée d'une page (1ʳᵉ visite), rejouable via « ? ».
const seenKey = (id: string) => `vl-tour-${id}-v1`
const PAD = 8

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
  const { data: onboardingDone } = useQuery({
    queryKey: ['onboarding-done', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('onboarding_done').eq('id', user!.id).maybeSingle()
      return data?.onboarding_done ?? null
    },
  })

  const start = useCallback((tour: { id: string; steps: TourStep[] }) => {
    tourIdRef.current = tour.id
    setIdx(0)
    setSteps(tour.steps)
  }, [])

  // Auto-déclenchement à l'entrée d'une page non encore vue.
  useEffect(() => {
    if (!user || onboardingDone !== true) return
    const tour = currentTour()
    if (!tour) { setSteps(null); return }
    let seen = false
    try { seen = !!localStorage.getItem(seenKey(tour.id)) } catch { /* localStorage indispo */ }
    if (seen) return
    // On ne démarre que si la 1ʳᵉ cible est présente (page prête / section dispo).
    const t = setTimeout(() => {
      if (document.querySelector(tour.steps[0].selector)) start(tour)
    }, 650)
    return () => clearTimeout(t)
  }, [pathname, user, onboardingDone, currentTour, start])

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
          if (id) { try { localStorage.setItem(seenKey(id), '1') } catch { /* ignore */ } }
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
  }, [steps, idx])

  if (!steps) return null
  const step = steps[idx]
  const isLast = idx >= steps.length - 1

  const finish = () => {
    const id = tourIdRef.current
    if (id) { try { localStorage.setItem(seenKey(id), '1') } catch { /* ignore */ } }
    setSteps(null); setRect(null)
  }
  const next = () => { if (isLast) finish(); else setIdx((i) => i + 1) }
  const prev = () => setIdx((i) => Math.max(0, i - 1))

  const vw = window.innerWidth, vh = window.innerHeight
  const panel: React.CSSProperties = { position: 'fixed', background: 'rgba(15,15,18,.62)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 3000 }

  // Position de la bulle : sous la cible si place en bas, sinon au-dessus (via `bottom`).
  const W = Math.min(340, vw - 24)
  let tip: React.CSSProperties
  if (rect) {
    const below = rect.bottom < vh * 0.6
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - W / 2, vw - 12 - W))
    tip = below
      ? { position: 'fixed', top: rect.bottom + PAD + 12, left, width: W, zIndex: 3002 }
      : { position: 'fixed', bottom: vh - rect.top + PAD + 12, left, width: W, zIndex: 3002 }
  } else {
    tip = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: W, zIndex: 3002 }
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
          <button onClick={finish} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--vl-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--vl-text-3)', padding: 0 }}>
            Passer
          </button>
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
