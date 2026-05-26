import { useQuery } from '@tanstack/react-query'
import { NavLink, Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import {
  get4WeekPhase, computeCoPerioWarnings, DUP4_LABELS, DUP4_COLORS,
  type Activity, type SessionLog,
} from '../lib/renfoUtils'
// @ts-ignore
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../../renfo-data.js'

interface Activity2 {
  id: string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  start_date: string
  start_date_local?: string
  type: string
  sport_type?: string
  average_heartrate?: number
}

function formatKm(meters: number) {
  return (meters / 1000).toFixed(1)
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function isRunning(type: string) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type)
}

const SUGGESTED_FOCUSES = ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps', 'yoga_coureur', 'pilates_coureur', 'stretching'] as const

export default function DashboardPage() {
  const { user } = useVLStore()

  const { data: activities = [], isLoading } = useQuery<Activity2[]>({
    queryKey: ['activities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,start_date,start_date_local,type,sport_type,average_heartrate')
        .order('start_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as Activity2[]
    },
  })

  const { data: renfoLogs = [] } = useQuery<SessionLog[]>({
    queryKey: ['renfo-session-logs-dashboard'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
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

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const runs = activities.filter((a) => isRunning(a.type))
  const monthRuns = runs.filter((a) => new Date(a.start_date) >= startOfMonth)
  const weekRuns = runs.filter((a) => new Date(a.start_date) >= startOfWeek)

  const kmMonth = monthRuns.reduce((s, a) => s + a.distance, 0)
  const kmWeek = weekRuns.reduce((s, a) => s + a.distance, 0)
  const elevMonth = monthRuns.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)

  const recent = runs.slice(0, 5)

  // Co-périodisation : analyse les 3 derniers jours d'activités
  const recentActs = activities
    .filter((a) => new Date(a.start_date).getTime() > Date.now() - 3 * 86_400_000)
    .map((a) => ({
      start_date_local: a.start_date_local ?? a.start_date,
      type: a.type,
      sport_type: a.sport_type,
      distance: a.distance,
      moving_time: a.moving_time,
      total_elevation_gain: a.total_elevation_gain,
    })) as Activity[]

  const warnings = computeCoPerioWarnings(recentActs)
  const preferred = new Set(warnings.flatMap((w) => w.prefer))
  const avoided = new Set(warnings.flatMap((w) => w.avoid))

  // Dernière date par focus (14 derniers jours)
  const lastDateByFocus: Record<string, string> = {}
  for (const s of renfoLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) {
      lastDateByFocus[s.focus] = s.session_date
    }
  }

  // Tri : préférés d'abord, puis par ancienneté (plus vieux = plus urgent)
  const phase = get4WeekPhase()
  const sortedFocuses = [...SUGGESTED_FOCUSES].sort((a, b) => {
    const aPref = preferred.has(a) ? 0 : avoided.has(a) ? 2 : 1
    const bPref = preferred.has(b) ? 0 : avoided.has(b) ? 2 : 1
    if (aPref !== bPref) return aPref - bPref
    const aLast = lastDateByFocus[a] ? new Date(lastDateByFocus[a]).getTime() : 0
    const bLast = lastDateByFocus[b] ? new Date(lastDateByFocus[b]).getTime() : 0
    return aLast - bLast // plus ancien en premier
  })

  function fmtLastDate(iso: string) {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (diff === 0) return "aujourd'hui"
    if (diff === 1) return 'hier'
    return `il y a ${diff}j`
  }

  return (
    <>
      <div className="clabel" style={{ marginBottom: '1.25rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        DASHBOARD
      </div>

      {isLoading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : (
        <>
          {/* KPI course */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-val">{formatKm(kmMonth)}</div>
              <div className="stat-lbl">KM CE MOIS</div>
            </div>
            <div className="stat-card">
              <div className="stat-val">{formatKm(kmWeek)}</div>
              <div className="stat-lbl">KM CETTE SEMAINE</div>
            </div>
            <div className="stat-card">
              <div className="stat-val">{Math.round(elevMonth)}</div>
              <div className="stat-lbl">D+ CE MOIS</div>
            </div>
          </div>

          {/* Renfo — séances suggérées */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div className="clabel">RENFO</div>
              <div className="mlabel" style={{ color: DUP4_COLORS[phase] }}>
                {DUP4_LABELS[phase]}
              </div>
            </div>

            {/* Co-pério warning si présent */}
            {warnings.length > 0 && (
              <div style={{
                marginBottom: '0.75rem',
                padding: '6px 10px',
                borderLeft: `3px solid ${warnings[0].severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)'}`,
              }}>
                <div className="mlabel" style={{
                  color: warnings[0].severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)',
                  textTransform: 'none', letterSpacing: 0, fontSize: '0.8rem'
                }}>
                  {warnings[0].message}
                </div>
              </div>
            )}

            {/* 4 séances suggérées */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              {sortedFocuses.slice(0, 4).map((focus) => {
                const meta = FOCUS_META[focus]
                if (!meta) return null
                const color = RENFO_FOCUS_COLORS[focus] ?? '#7c3aed'
                const lastDate = lastDateByFocus[focus]
                const isAvoided = avoided.has(focus)
                const isPref = preferred.has(focus)
                return (
                  <Link
                    key={focus}
                    to={`/renfo/session/${focus}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid var(--vl-line)`,
                      borderLeft: `3px solid ${color}`,
                      opacity: isAvoided ? 0.4 : 1,
                      background: 'var(--vl-card)',
                    }}>
                      {isPref && (
                        <div className="mlabel" style={{ color, fontSize: '0.7rem', marginBottom: 2 }}>★</div>
                      )}
                      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.8rem', color, lineHeight: 1.2 }}>
                        {meta.label}
                      </div>
                      <div className="mlabel" style={{ fontSize: '0.7rem', color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
                        {lastDate ? fmtLastDate(lastDate) : `${meta.duration_min} min`}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>

            <Link to="/renfo" style={{ textDecoration: 'none' }}>
              <div className="mlabel" style={{ marginTop: '0.75rem', color: 'var(--vl-text-3)', textAlign: 'right' }}>
                Tout voir →
              </div>
            </Link>
          </div>

          {/* Dernières sorties */}
          <div className="card">
            <div className="clabel">DERNIÈRES SORTIES</div>
            {recent.length === 0 ? (
              <div className="mlabel">Aucune activité enregistrée</div>
            ) : (
              <div className="acts-grid">
                {recent.map((a) => (
                  <NavLink key={a.id} to={`/activities/${a.id}`} className="act-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ flex: 1 }}>
                      <div className="act-name">{a.name}</div>
                      <div className="act-meta">
                        {formatDate(a.start_date)} · {formatKm(a.distance)} km · {formatTime(a.moving_time)} · ↑{Math.round(a.total_elevation_gain ?? 0)} m
                      </div>
                    </div>
                    <div>
                      <span className="act-badge">{a.type}</span>
                    </div>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
