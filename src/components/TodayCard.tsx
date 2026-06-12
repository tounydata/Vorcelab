import { Link } from 'react-router'
import { useCoachPlan } from '../lib/coach/useCoachPlan'
import { PHASE_LABELS } from '../lib/coach/planGenerator'
import type { Phase } from '../lib/coach/workouts'
import { RENFO_FOCUS_SHORT } from '../lib/coach/renfoFusion'

// ─── Héros du dashboard : « qu'est-ce que je fais aujourd'hui ? » ─────────────
// Lit le MÊME plan que la page Coach (useCoachPlan, queries dédupliquées) et en
// extrait la séance du jour — course + renfo — avec un seul appel à l'action.

const PHASE_COLORS: Record<Phase, string> = {
  base: 'var(--vl-growth)',
  build: 'var(--vl-amber)',
  specific: 'var(--vl-ember)',
  taper: '#3B82F6',
  race: 'var(--vl-text)',
}

const DAY_SHORT = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const INTENSITY_LABELS: Record<string, { label: string; color: string }> = {
  easy: { label: 'FACILE', color: 'var(--vl-growth)' },
  moderate: { label: 'MODÉRÉ', color: 'var(--vl-amber)' },
  hard: { label: 'DUR', color: 'var(--vl-ember)' },
}

export default function TodayCard() {
  const { isLoading, targetRace, plan, displayWeeks, renfoFusion } = useCoachPlan()

  const now = new Date()
  const todayDow = ((now.getDay() + 6) % 7) + 1 // 1 = lundi … 7 = dimanche
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()

  const week0 = displayWeeks[0]
  const todayRun = week0?.sessions.find((s) => s.dayOfWeek === todayDow) ?? null
  // Les autres séances de la semaine — le choix reste entier (philosophie choix-first).
  const otherRuns = (week0?.sessions ?? []).filter((s) => s.dayOfWeek !== todayDow)
  const todayRenfo = renfoFusion?.slots.find((sl) => sl.dayOfWeek === todayDow) ?? null
  const phase = week0?.phase

  if (isLoading) {
    return (
      <div data-tour="dash-today" className="card" style={{ marginBottom: '1.5rem', padding: '18px 20px' }}>
        <div className="mlabel" style={{ letterSpacing: '.14em' }}>AUJOURD'HUI</div>
        <div className="loading" style={{ padding: '12px 0' }}><div className="spinner" /></div>
      </div>
    )
  }

  // Pas de course cible → le dashboard guide vers la première action utile.
  if (!targetRace || !plan) {
    return (
      <div data-tour="dash-today" className="card" style={{ marginBottom: '1.5rem', padding: '18px 20px', borderLeft: '4px solid var(--vl-ember)' }}>
        <div className="mlabel" style={{ letterSpacing: '.14em', marginBottom: 6 }}>AUJOURD'HUI · {dateLabel}</div>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: 6 }}>
          Donne un cap à ton entraînement
        </div>
        <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.5, marginBottom: 12 }}>
          Ajoute ta course cible : le Coach construit ton plan jusqu'au jour J, séance par séance.
        </div>
        <Link to="/race/new" style={{ textDecoration: 'none' }}>
          <button className="btn-primary">Définir ma course cible →</button>
        </Link>
      </div>
    )
  }

  const intensity = todayRun ? INTENSITY_LABELS[todayRun.intensity] ?? null : null

  return (
    <Link to="/coach" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div data-tour="dash-today" className="card" style={{ marginBottom: '1.5rem', padding: '18px 20px', borderLeft: `4px solid ${phase ? PHASE_COLORS[phase] : 'var(--vl-ember)'}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div className="mlabel" style={{ margin: 0, letterSpacing: '.14em' }}>AUJOURD'HUI · {dateLabel}</div>
          {phase && (
            <div className="mlabel" style={{ margin: 0, fontSize: 10, color: PHASE_COLORS[phase], letterSpacing: '.1em' }}>
              PHASE {PHASE_LABELS[phase]?.toUpperCase?.() ?? phase}
            </div>
          )}
        </div>

        {todayRun ? (
          <>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-3)', letterSpacing: '.08em', marginBottom: 4 }}>
              PROPOSITION · TU CHOISIS
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.05 }}>
                {todayRun.title}
              </div>
              {intensity && (
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', color: intensity.color, border: `1px solid color-mix(in oklab, ${intensity.color} 45%, transparent)`, borderRadius: 4, padding: '2px 7px' }}>
                  {intensity.label}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)', marginTop: 5 }}>
              ~{todayRun.targetDurationMin} min{todayRun.climbing ? ' · côtes' : ''}
            </div>
            {todayRun.description && (
              <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.5, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {todayRun.description}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.05, color: 'var(--vl-status-rest)' }}>
              {todayRenfo ? 'Pas de course proposée aujourd’hui' : 'Repos proposé'}
            </div>
          </>
        )}

        {/* La semaine reste un libre choix : les autres séances en un coup d'œil. */}
        {otherRuns.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-3)', letterSpacing: '.06em', flexShrink: 0 }}>
              …OU CETTE SEMAINE :
            </span>
            {otherRuns.map((s, i) => (
              <span key={i} style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                {s.title} · {DAY_SHORT[s.dayOfWeek]?.slice(0, 3) ?? ''}
              </span>
            ))}
          </div>
        )}

        {todayRenfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--vl-line)' }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', color: '#a78bfa', background: '#7c3aed18', borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>
              + RENFO
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)' }}>
              {RENFO_FOCUS_SHORT[todayRenfo.focus] ?? todayRenfo.focus}
            </span>
            {todayRenfo.heavy && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', letterSpacing: '.05em' }}>LOURD</span>
            )}
          </div>
        )}

        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)', letterSpacing: '.1em', marginTop: 12 }}>
          OUVRIR MON PLAN →
        </div>
      </div>
    </Link>
  )
}
