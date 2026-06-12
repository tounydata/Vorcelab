import { Link } from 'react-router'
import { useCoachPlan } from '../lib/coach/useCoachPlan'
import { PHASE_LABELS } from '../lib/coach/planGenerator'
import type { Phase } from '../lib/coach/workouts'
import { RENFO_FOCUS_SHORT } from '../lib/coach/renfoFusion'
import type { SessionLog } from '../lib/renfoUtils'

// ─── Carte COACH du dashboard : « Aujourd'hui » + la semaine, en UNE carte. ───
// Dégraissée volontairement : la proposition du jour (jamais imposée), les
// alternatives de la semaine, le rythme 7 jours, et les alertes utiles.
// Le reste (bibliothèque, progression mensuelle, focus) vit sur la page Coach.

const PHASE_COLORS: Record<Phase, string> = {
  base: 'var(--vl-growth)',
  build: 'var(--vl-amber)',
  specific: 'var(--vl-ember)',
  taper: '#3B82F6',
  race: 'var(--vl-text)',
}

const DAY_SHORT = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']
const WCAL_LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'] as const

const INTENSITY_LABELS: Record<string, { label: string; color: string }> = {
  easy: { label: 'FACILE', color: 'var(--vl-growth)' },
  moderate: { label: 'MODÉRÉ', color: 'var(--vl-amber)' },
  hard: { label: 'DUR', color: 'var(--vl-ember)' },
}

interface ActivityLite {
  start_date: string
  start_date_local?: string
  type: string
}

type RenfoLogLite = Pick<SessionLog, 'focus' | 'session_date'>

function isRunning(type: string) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type)
}

export default function CoachCard({ activities, renfoLogs, renfoWeeklyTarget }: {
  activities: ActivityLite[]
  renfoLogs: RenfoLogLite[]
  renfoWeeklyTarget: number
}) {
  const { isLoading, targetRace, plan, displayWeeks, renfoFusion } = useCoachPlan()

  const now = new Date()
  const todayDow = ((now.getDay() + 6) % 7) + 1 // 1 = lundi … 7 = dimanche
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()

  const week0 = displayWeeks[0]
  const todayRun = week0?.sessions.find((s) => s.dayOfWeek === todayDow) ?? null
  const otherRuns = (week0?.sessions ?? []).filter((s) => s.dayOfWeek !== todayDow)
  const todayRenfo = renfoFusion?.slots.find((sl) => sl.dayOfWeek === todayDow) ?? null
  const phase = week0?.phase
  const intensity = todayRun ? INTENSITY_LABELS[todayRun.intensity] ?? null : null

  // ── Rythme réel des 7 derniers jours (fait, pas planifié) ──
  const week7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const hasRun = activities.some((a) => (a.start_date_local ?? a.start_date)?.slice(0, 10) === ds && isRunning(a.type))
    const hasRenfo = renfoLogs.some((r) => r.session_date === ds)
    return { label: WCAL_LABELS[(d.getDay() + 6) % 7], hasRun, hasRenfo, isToday: i === 6 }
  })

  // Compteurs semaine en cours (lun-dim)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().slice(0, 10)
  const runsWeekCount = activities.filter((a) => isRunning(a.type) && (a.start_date_local ?? a.start_date)?.slice(0, 10) >= weekStartStr).length
  const renfoWeekCount = [...new Set(renfoLogs.filter((r) => r.session_date && r.session_date >= weekStartStr).map((r) => r.session_date))].length

  // Imports Strava pas encore reliés à un type de renfo (30 derniers jours).
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const renfoUncategorized = renfoLogs.filter((r) => !r.focus && r.session_date && r.session_date >= cutoff30).length

  return (
    <div data-tour="dash-coach" className="card" style={{ marginBottom: '1.5rem', padding: '16px 18px', borderLeft: `4px solid ${phase ? PHASE_COLORS[phase] : 'var(--vl-line)'}` }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="mlabel" style={{ margin: 0, letterSpacing: '.14em' }}>COACH</span>
          {phase && (
            <span className="mlabel" style={{ margin: 0, fontSize: 10, color: PHASE_COLORS[phase], letterSpacing: '.1em', borderLeft: `2px solid ${PHASE_COLORS[phase]}`, paddingLeft: 6 }}>
              {PHASE_LABELS[phase]?.toUpperCase?.() ?? phase}
            </span>
          )}
        </div>
        <Link to="/coach" style={{ textDecoration: 'none' }}>
          <span className="mlabel" style={{ margin: 0, color: 'var(--vl-ember)', fontSize: 10, letterSpacing: '.1em' }}>MON PLAN →</span>
        </Link>
      </div>

      {/* ── Aujourd'hui ── */}
      {isLoading ? (
        <div className="loading" style={{ padding: '8px 0' }}><div className="spinner" /></div>
      ) : !targetRace || !plan ? (
        <Link to="/race/new" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ marginBottom: 12 }}>
            <div className="mlabel" style={{ letterSpacing: '.1em', marginBottom: 4 }}>AUJOURD'HUI · {dateLabel}</div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.1 }}>
              Donne un cap à ton entraînement
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.5, marginTop: 4 }}>
              Ajoute ta course cible : le Coach construit ton plan jusqu'au jour J.
            </div>
            <span className="mlabel" style={{ color: 'var(--vl-ember)', fontSize: 10, letterSpacing: '.1em', marginTop: 6, display: 'inline-block' }}>
              DÉFINIR MA COURSE CIBLE →
            </span>
          </div>
        </Link>
      ) : (
        <Link to="/coach" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ marginBottom: 12 }}>
            <div className="mlabel" style={{ letterSpacing: '.1em', marginBottom: 4 }}>
              AUJOURD'HUI · {dateLabel} <span style={{ color: 'var(--vl-text-3)' }}>· proposition, tu choisis</span>
            </div>
            {todayRun ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.05 }}>
                    {todayRun.title}
                  </span>
                  {intensity && (
                    <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', color: intensity.color, border: `1px solid color-mix(in oklab, ${intensity.color} 45%, transparent)`, borderRadius: 4, padding: '2px 7px' }}>
                      {intensity.label}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)' }}>
                    ~{todayRun.targetDurationMin} min{todayRun.climbing ? ' · côtes' : ''}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.05, color: 'var(--vl-status-rest)' }}>
                {todayRenfo ? 'Pas de course proposée' : 'Repos proposé'}
              </div>
            )}
            {todayRenfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
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
            {otherRuns.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-3)', letterSpacing: '.06em', flexShrink: 0 }}>
                  …OU CETTE SEMAINE :
                </span>
                {otherRuns.map((s, i) => (
                  <span key={i} style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', background: 'var(--vl-surf-2)', border: '1px solid var(--vl-line)', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                    {s.title} · {DAY_SHORT[s.dayOfWeek] ?? ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Link>
      )}

      {/* ── Rythme 7 jours + compteurs ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, paddingTop: 10, borderTop: '1px solid var(--vl-line)' }}>
        <div style={{ flex: 1, display: 'flex', gap: 3 }}>
          {week7.map((day, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 14, borderRadius: 3, marginBottom: 2,
                background: day.hasRenfo
                  ? 'color-mix(in oklab, var(--color-renfo) 40%, transparent)'
                  : day.hasRun
                    ? 'color-mix(in oklab, var(--vl-ember) 30%, transparent)'
                    : 'var(--vl-line)',
                border: day.isToday ? '1px solid color-mix(in oklab, var(--vl-ember) 40%, transparent)' : '1px solid transparent',
              }} />
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: day.isToday ? 'var(--vl-ember)' : 'var(--vl-text-3)' }}>
                {day.label}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', flexShrink: 0, paddingBottom: 2 }}>
          <span><strong style={{ color: 'var(--vl-ember)', fontSize: 12 }}>{runsWeekCount}</strong> COURSE{runsWeekCount > 1 ? 'S' : ''}</span>
          <span><strong style={{ color: '#a78bfa', fontSize: 12 }}>{renfoWeekCount}/{renfoWeeklyTarget}</strong> RENFO</span>
        </div>
      </div>

      {/* Séances Strava importées à relier */}
      {renfoUncategorized > 0 && (
        <Link to="/coach" style={{ textDecoration: 'none' }}>
          <div style={{ background: 'color-mix(in oklab, var(--vl-amber) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--vl-amber) 35%, transparent)', borderRadius: 4, padding: '5px 8px', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, color: 'var(--vl-amber)', minWidth: 0 }}>
              {renfoUncategorized} séance{renfoUncategorized > 1 ? 's' : ''} Strava à relier au renfo
            </span>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-amber)', flexShrink: 0, letterSpacing: '.08em' }}>LIER →</span>
          </div>
        </Link>
      )}
    </div>
  )
}
