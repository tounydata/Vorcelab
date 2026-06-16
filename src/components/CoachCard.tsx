import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useCoachPlan } from '../lib/coach/useCoachPlan'
import { listSessionLog } from '../lib/coach/sessionLog'
import { PHASE_LABELS } from '../lib/coach/planGenerator'
import type { Phase } from '../lib/coach/workouts'
import { RENFO_FOCUS_SHORT } from '../lib/coach/renfoFusion'
import type { SessionLog } from '../lib/renfoUtils'

// ─── Carte COACH du dashboard — repensée pour répondre à UNE question : ───────
// « Qu'est-ce que je fais aujourd'hui ? ». Le jour J est traité à part (plus de
// séance fantôme « 0 min »). En dessous, la semaine EN COURS (lun→dim) montre le
// fait ET le planifié — donc ce qu'il reste à faire — alignée avec les compteurs.
// Le détail du plan (alternatives, descriptions) vit sur la page Coach.

const PHASE_COLORS: Record<Phase, string> = {
  base: 'var(--vl-growth)',
  build: 'var(--vl-amber)',
  specific: 'var(--vl-ember)',
  taper: '#3B82F6',
  race: 'var(--vl-ember)',
}

const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

const INTENSITY: Record<string, { label: string; color: string }> = {
  easy: { label: 'Facile', color: 'var(--vl-growth)' },
  moderate: { label: 'Modéré', color: 'var(--vl-amber)' },
  hard: { label: 'Soutenu', color: 'var(--vl-ember)' },
}

type RenfoLogLite = Pick<SessionLog, 'focus' | 'session_date'>

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CoachCard({ renfoLogs, renfoWeeklyTarget }: {
  renfoLogs: RenfoLogLite[]
  renfoWeeklyTarget: number
}) {
  const { isLoading, targetRace, plan, displayWeeks, renfoFusion } = useCoachPlan()
  // Séances réellement LIÉES (journal) → une séance n'est « faite » que si elle a été liée,
  // pas parce qu'une sortie Strava (peut-être non liée) existe ce jour-là.
  const { data: sessionLogs = [] } = useQuery({ queryKey: ['session-log-all'], queryFn: () => listSessionLog(120) })

  const now = new Date()
  const todayDow = ((now.getDay() + 6) % 7) + 1 // 1 = lundi … 7 = dimanche
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()

  const week0 = displayWeeks[0]
  const todayRun = week0?.sessions.find((s) => s.dayOfWeek === todayDow) ?? null
  const todayRenfo = renfoFusion?.slots.find((sl) => sl.dayOfWeek === todayDow) ?? null
  const phase = week0?.phase
  const isRaceDay = todayRun?.system === 'race'
  const intensity = todayRun && !isRaceDay ? INTENSITY[todayRun.intensity] ?? null : null

  // ── Semaine EN COURS (lundi → dimanche) : un jour ne se colore QUE s'il est
  //    « fait » = séance du coach LIÉE/validée (journal) ou renfo loggé. Le planifié
  //    NON fait reste neutre (pas de couleur tant que rien n'est validé). ──
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const todayStr = isoDate(now)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    const ds = isoDate(d)
    const doneRun = sessionLogs.some((l) => l.planned_date === ds)
    const doneRenfo = renfoLogs.some((r) => r.session_date === ds)
    return { letter: WEEK_LETTERS[i], ds, doneRun, doneRenfo, isToday: ds === todayStr, isPast: ds < todayStr }
  })

  const weekStartStr = isoDate(weekStart)
  const renfoWeekCount = [...new Set(renfoLogs.filter((r) => r.session_date && r.session_date >= weekStartStr).map((r) => r.session_date))].length

  // Séances du PLAN cette semaine (hors course) + lesquelles sont LIÉES (journal).
  const planSessions = (week0?.sessions ?? [])
    .filter((s) => s.system !== 'race')
    .map((s) => {
      const ds = weekDays[s.dayOfWeek - 1]?.ds
      const linked = sessionLogs.some((l) => l.planned_workout_id === s.workoutId && l.planned_date === ds)
      return { dayOfWeek: s.dayOfWeek, title: s.title, done: linked }
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  const planDoneCount = planSessions.filter((s) => s.done).length

  const accent = phase ? PHASE_COLORS[phase] : 'var(--vl-line)'

  // ── Rendu d'une cellule de jour : couleur UNIQUEMENT si fait (lié/validé). ──
  const RENFO = 'var(--color-renfo)'
  function dayVisual(d: typeof weekDays[number]): { bg: string; border: string; dot: string | null } {
    if (d.doneRun) return { bg: 'var(--vl-ember)', border: 'transparent', dot: d.doneRenfo ? RENFO : null }
    if (d.doneRenfo) return { bg: RENFO, border: 'transparent', dot: null }
    return { bg: 'var(--vl-surf-2)', border: 'var(--vl-line)', dot: null }
  }

  return (
    <div data-tour="dash-coach" className="card" style={{ marginBottom: '1.5rem', padding: '16px 18px', borderLeft: `4px solid ${accent}` }}>
      {/* ── En-tête : COACH · phase ............ MON PLAN → ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: 'var(--vl-text-2)' }}>COACH</span>
          {phase && (
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', color: accent, background: `color-mix(in oklab, ${accent} 14%, transparent)`, borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase' }}>
              {PHASE_LABELS[phase]?.toUpperCase?.() ?? phase}
            </span>
          )}
        </div>
        <Link to="/coach" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--vl-ember)' }}>MON PLAN →</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="loading" style={{ padding: '8px 0' }}><div className="spinner" /></div>
      ) : !targetRace || !plan ? (
        /* ── Pas de course cible : invitation à donner un cap ── */
        <Link to="/race/new" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.15, marginBottom: 4 }}>
            Donne un cap à ton entraînement
          </div>
          <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.5, marginBottom: 8 }}>
            Ajoute ta course cible : le Coach construit ton plan jusqu'au jour J.
          </div>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--vl-ember)' }}>
            DÉFINIR MA COURSE CIBLE →
          </span>
        </Link>
      ) : isRaceDay ? (
        /* ── JOUR J : on ne propose pas de séance, on envoie vers la stratégie ── */
        <Link to={`/race/${targetRace.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'var(--vl-ember)', marginBottom: 6 }}>
            JOUR J · {dateLabel}
          </div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.05, marginBottom: 4 }}>
            C'est aujourd'hui.
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--vl-text)', lineHeight: 1.45, marginBottom: 10 }}>
            {targetRace.name} — fais-toi confiance, le plan est derrière toi.
          </div>
          <span style={{ display: 'inline-block', background: 'var(--vl-ember)', color: 'var(--vl-ink)', borderRadius: 'var(--vl-r-sm)', padding: '8px 14px', fontFamily: 'var(--vl-display)', fontSize: '.85rem', fontWeight: 700, letterSpacing: '.06em' }}>
            VOIR MA STRATÉGIE →
          </span>
        </Link>
      ) : (
        /* ── Proposition du jour (jamais imposée) ── */
        <Link to="/coach" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'var(--vl-text-3)', marginBottom: 7 }}>
            AUJOURD'HUI · {dateLabel}
          </div>
          {todayRun ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {intensity && (
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: intensity.color, flexShrink: 0, boxShadow: `0 0 0 3px color-mix(in oklab, ${intensity.color} 22%, transparent)` }} />
                )}
                <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.05 }}>
                  {todayRun.title}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-2)', marginTop: 5, letterSpacing: '.02em' }}>
                {[intensity?.label, `${todayRun.targetDurationMin} min`, todayRun.climbing ? 'côtes' : null].filter(Boolean).join('  ·  ')}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.05, color: 'var(--vl-status-rest)' }}>
              {todayRenfo ? 'Pas de course aujourd\'hui' : 'Repos'}
            </div>
          )}
          {todayRenfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', color: RENFO, background: 'color-mix(in oklab, var(--color-renfo) 16%, transparent)', borderRadius: 4, padding: '3px 8px', flexShrink: 0 }}>
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
        </Link>
      )}

      {/* ── Semaine en cours : frise lun→dim (fait + planifié) + compteurs ── */}
      {targetRace && plan && (
        <div style={{ marginTop: 16, paddingTop: 13, borderTop: '1px solid var(--vl-line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em', color: 'var(--vl-text-3)' }}>CETTE SEMAINE</span>
            <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
              <span><strong style={{ color: 'var(--vl-ember)', fontSize: 13 }}>{planDoneCount}/{planSessions.length}</strong> séance{planSessions.length > 1 ? 's' : ''}</span>
              <span><strong style={{ color: RENFO, fontSize: 13 }}>{renfoWeekCount}/{renfoWeeklyTarget}</strong> renfo</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {weekDays.map((d, i) => {
              const v = dayVisual(d)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    position: 'relative', width: '100%', height: 22, borderRadius: 5,
                    background: v.bg, border: `1.5px solid ${v.border}`,
                    boxShadow: d.isToday ? '0 0 0 2px color-mix(in oklab, var(--vl-ember) 60%, transparent)' : 'none',
                    boxSizing: 'border-box',
                  }}>
                    {v.dot && (
                      <span style={{ position: 'absolute', right: 2, bottom: 2, width: 6, height: 6, borderRadius: 999, background: v.dot, border: '1px solid var(--vl-surf)' }} />
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: d.isToday ? 700 : 400, color: d.isToday ? 'var(--vl-ember)' : 'var(--vl-text-3)' }}>
                    {d.letter}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
