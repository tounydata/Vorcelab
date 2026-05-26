import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import {
  computeCoPerioWarnings, computeImpactZone,
  get4WeekPhase, DUP4_LABELS, DUP4_COLORS,
  type SessionLog,
} from '../lib/renfoUtils'
// @ts-ignore
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../../renfo-data.js'

const ALL_FOCUSES = [
  'force_lourde','pliometrie','excentrique','tronc',
  'haut_corps','yoga_coureur','pilates_coureur','stretching',
] as const

export default function RenfoPage() {
  const { user } = useVLStore()

  const { data: activities = [] } = useQuery({
    queryKey: ['activities-copério'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('strava_activities')
        .select('start_date_local,type,sport_type,distance,moving_time,total_elevation_gain')
        .gte('start_date_local', cutoff)
        .order('start_date_local', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const { data: sessionLogs = [] } = useQuery<SessionLog[]>({
    queryKey: ['renfo-session-logs-7d'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_session_log')
        .select('focus,duration_min,session_date')
        .eq('user_id', user!.id)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: false })
      return (data ?? []) as SessionLog[]
    },
    enabled: !!user,
  })

  const warnings = computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0])
  const impact = computeImpactZone(sessionLogs)
  const phase = get4WeekPhase()

  // Last session date per focus
  const lastDateByFocus: Record<string, string> = {}
  for (const s of sessionLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) {
      lastDateByFocus[s.focus] = s.session_date
    }
  }

  // Focuses preferred by co-pério
  const preferred = new Set(warnings.flatMap((w) => w.prefer))
  const avoided = new Set(warnings.flatMap((w) => w.avoid))

  function fmtLastDate(iso: string) {
    const d = new Date(iso)
    const diff = Math.round((Date.now() - d.getTime()) / 86400000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1.5rem' }}>RENFORCEMENT</div>

      {/* ── Co-pério warnings ────────────────────────────────────────────── */}
      {warnings.map((w, i) => (
        <div key={i} className="card" style={{
          marginBottom: '0.75rem',
          borderLeft: `3px solid ${w.severity === 'alert' ? 'var(--vl-ember)' : w.severity === 'warn' ? 'var(--vl-amber)' : 'var(--vl-growth)'}`,
        }}>
          <div className="mlabel" style={{ color: w.severity === 'alert' ? 'var(--vl-ember)' : w.severity === 'warn' ? 'var(--vl-amber)' : 'var(--vl-text-3)' }}>
            {w.severity === 'alert' ? '⚠ ALERTE' : w.severity === 'warn' ? '⚡ ATTENTION' : 'ℹ INFO'}
          </div>
          <div className="mlabel" style={{ marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>{w.message}</div>
        </div>
      ))}

      {/* ── DUP badge + impact ────────────────────────────────────────────── */}
      <div className="strip" style={{ marginBottom: '1.5rem' }}>
        <div className="scell" style={{ gridColumn: 'span 3' }}>
          <div className="sval" style={{ color: DUP4_COLORS[phase], fontSize: '1.1rem' }}>{DUP4_LABELS[phase]}</div>
          <div className="slbl">Phase DUP</div>
        </div>
        <div className="scell" style={{ gridColumn: 'span 3' }}>
          <div className="sval" style={{ color: impact.color, fontSize: '1.1rem' }}>{impact.label}</div>
          <div className="slbl">Charge 7j</div>
        </div>
      </div>

      {/* ── Focus grid ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
        {ALL_FOCUSES.map((focus) => {
          const meta = FOCUS_META[focus]
          if (!meta) return null
          const color = RENFO_FOCUS_COLORS[focus] ?? '#7c3aed'
          const lastDate = lastDateByFocus[focus]
          const isPreferred = preferred.has(focus)
          const isAvoided = avoided.has(focus)
          return (
            <Link
              key={focus}
              to={`/renfo/session/${focus}`}
              style={{ textDecoration: 'none' }}
            >
              <div className="card" style={{
                borderLeft: `3px solid ${color}`,
                opacity: isAvoided ? 0.45 : 1,
                position: 'relative',
                minHeight: 96,
              }}>
                {isPreferred && (
                  <div className="mlabel" style={{ color, marginBottom: 4 }}>★ Recommandé</div>
                )}
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.95rem', color, lineHeight: 1.2, marginBottom: 4 }}>
                  {meta.label}
                </div>
                <div className="mlabel">{meta.duration_min} min</div>
                {lastDate && (
                  <div className="mlabel" style={{ marginTop: 4, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                    {fmtLastDate(lastDate)}
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Liens secondaires ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to="/renfo/library"><button className="hbtn">BIBLIOTHÈQUE</button></Link>
        <Link to="/renfo/settings"><button className="hbtn">RÉGLAGES ÉQUIPEMENT</button></Link>
      </div>
    </>
  )
}
