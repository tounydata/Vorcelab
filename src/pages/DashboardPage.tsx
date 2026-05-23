import { useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { mapDbActivity } from '../types/activity'
import type { Activity } from '../types/activity'
import { isRun, fmtD } from '../utils/formatters'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

// ── Training load (port de training-load.js) ──────────────────────────────────
const TRAIL_TYPES = new Set(['TrailRun', 'Trail Run'])
function computeActivityLoad(a: Activity, fcMax: number): number {
  const dMin = a.moving_time / 60
  if (dMin < 5) return 0
  let intensity: number
  if (a.average_heartrate && fcMax > 0) {
    const z = a.average_heartrate / fcMax
    intensity = z >= 0.90 ? 7.5 : z >= 0.80 ? 4.5 : z >= 0.70 ? 2.5 : z >= 0.60 ? 1.5 : 1.0
  } else {
    const pace = a.distance > 100 ? a.moving_time / (a.distance / 1000) : 0
    intensity = TRAIL_TYPES.has(a.type) ? 3.0 : pace > 0 && pace < 280 ? 3.5 : 2.0
  }
  const elevFactor = a.total_elevation_gain > 0 ? 1 + Math.min(0.5, (a.total_elevation_gain / a.distance) * 10) : 1
  return Math.round(dMin * intensity * elevFactor)
}

// ── Renfo category map ────────────────────────────────────────────────────────
const EXO_CAT: Record<string, string> = {
  squat_lourd:'force_lourde',rdl:'force_lourde',bulgare:'force_lourde',mollets_lourds:'force_lourde',hip_thrust:'force_lourde',lunge_marcheur:'force_lourde',step_up:'force_lourde',lateral_lunge:'force_lourde',
  pogo_jumps:'pliometrie',bondissements:'pliometrie',drop_jumps:'pliometrie',skips:'pliometrie',lateral_bound:'pliometrie',box_jump:'pliometrie',
  step_down:'excentrique',nordic:'excentrique',mollet_excentrique:'excentrique',single_leg_rdl:'excentrique',tibialis_raise:'excentrique',reverse_nordic:'excentrique',single_leg_glute_bridge:'excentrique',wall_sit:'excentrique',single_leg_squat:'excentrique',
  pallof_press:'tronc',side_plank_hipdrop:'tronc',dead_bug:'tronc',bird_dog:'tronc',suitcase_carry:'tronc',copenhagen_plank:'tronc',core_rotation:'tronc',
  tractions_or_row:'haut_corps',pompes:'haut_corps',face_pull:'haut_corps',ytw_prone:'haut_corps',
  hip_9090:'mobilite',pigeon_actif:'mobilite',knee_to_wall:'mobilite',open_book:'mobilite',monster_walk:'mobilite',hip_abduction:'mobilite',cossack_squat:'mobilite',
  low_lunge:'yoga_coureur',downward_dog:'yoga_coureur',child_pose:'yoga_coureur',reclined_twist:'yoga_coureur',butterfly:'yoga_coureur',
  ischio_debout:'stretching',gastrocnemien_stretch:'stretching',solaire_stretch:'stretching',figure_4_piriforme:'stretching',it_band_stretch:'stretching',
}
const CAT_META: Record<string, { label: string; dur: number }> = {
  force_lourde: { label: 'Force lourde',  dur: 40 },
  pliometrie:   { label: 'Pliométrie',    dur: 25 },
  excentrique:  { label: 'Excentrique',   dur: 30 },
  tronc:        { label: 'Tronc & stab.', dur: 20 },
  haut_corps:   { label: 'Haut du corps', dur: 25 },
  mobilite:     { label: 'Mobilité',      dur: 15 },
}
const SHOWN_CATS = ['force_lourde', 'pliometrie', 'excentrique', 'tronc', 'haut_corps', 'mobilite']

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DashboardPage() {
  const user = useVLStore(s => s.user)

  const { data: activities = [] } = useQuery({
    queryKey: ['activities', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('strava_activities').select('*').eq('user_id', user!.id).is('deleted_at', null).order('start_date', { ascending: false }).limit(500)
      return (data || []).filter(r => isRun(r.type as string)).map(r => mapDbActivity(r as Record<string, unknown>))
    },
    enabled: !!user,
  })

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('fc_max').eq('id', user!.id).single()
      return data as { fc_max?: number } | null
    },
    enabled: !!user,
  })

  const { data: races = [] } = useQuery({
    queryKey: ['races', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('race_calendar').select('id,name,date,type,distance,goal_time,last_projection').eq('user_id', user!.id).order('date', { ascending: true })
      return (data || []) as { id: string; name: string; date: string; type: string; distance: number; goal_time?: string; last_projection?: { cible?: number } }[]
    },
    enabled: !!user,
  })

  const { data: renfoSessions = [] } = useQuery({
    queryKey: ['renfo-sessions-dash', user?.id],
    queryFn: async () => {
      const cutoff = localDateStr(new Date(Date.now() - 90 * 86400000))
      const { data } = await supabase.from('renfo_session_log').select('session_date,completed_exercises').eq('user_id', user!.id).gte('session_date', cutoff).order('session_date', { ascending: false })
      return (data || []) as { session_date: string; completed_exercises: Record<string, unknown> }[]
    },
    enabled: !!user,
  })

  const { data: renfoLogs = [] } = useQuery({
    queryKey: ['renfo-logs-dash', user?.id],
    queryFn: async () => {
      const cutoff = localDateStr(new Date(Date.now() - 28 * 86400000))
      const { data } = await supabase.from('renfo_exercise_log').select('session_date,rpe,created_at').eq('user_id', user!.id).gte('session_date', cutoff).order('created_at', { ascending: true })
      return (data || []) as { session_date: string; rpe: number | null; created_at: string }[]
    },
    enabled: !!user,
  })

  const fcMax = profile?.fc_max ?? 185
  const now = new Date()
  const todayStr = localDateStr(now)

  // Week bounds
  const daysToMon = (now.getDay() + 6) % 7
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMon)
  const weekStartStr = localDateStr(weekStart)

  // Month bounds
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const thisMonth = activities.filter(a => { const d = new Date(a.start_date); return d >= monthStart && d <= now })
  const lastMonth = activities.filter(a => { const d = new Date(a.start_date); return d >= prevMonthStart && d <= prevMonthEnd })

  // Next race
  const nextRace = races.find(r => new Date(r.date) >= now) ?? null

  // ── 7 derniers jours ─────────────────────────────────────────────────────────
  const days7 = useMemo(() => {
    const LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
      const ds = localDateStr(d)
      const acts = activities.filter(a => a.start_date?.slice(0, 10) === ds)
      return { label: LABELS[(d.getDay() + 6) % 7], km: acts.reduce((s, a) => s + a.distance / 1000, 0), dp: acts.reduce((s, a) => s + (a.total_elevation_gain || 0), 0) }
    })
  }, [activities])

  const dpTotal7 = days7.reduce((s, d) => s + d.dp, 0)
  const maxKm7 = Math.max(...days7.map(d => d.km), 0.1)

  // EF% last 7 days
  const sevenAgo = new Date(Date.now() - 7 * 86400000)
  const last7Acts = activities.filter(a => new Date(a.start_date) >= sevenAgo)
  const efPct = useMemo(() => {
    if (!last7Acts.length) return null
    const total = last7Acts.reduce((s, a) => s + a.moving_time, 0)
    const aerobic = last7Acts.filter(a => {
      if (a.average_heartrate) return a.average_heartrate / fcMax < 0.75
      const pace = a.distance > 100 ? a.moving_time / (a.distance / 1000) : 0
      return pace > 300 // > 5:00/km → aerobic
    }).reduce((s, a) => s + a.moving_time, 0)
    return total > 0 ? Math.round((aerobic / total) * 100) : null
  }, [last7Acts, fcMax])

  const efLabel = efPct == null ? null : efPct >= 80 ? { l: 'EXCELLENT', c: 'var(--vl-growth)' } : efPct >= 60 ? { l: 'BON', c: '#06b6d4' } : efPct >= 40 ? { l: 'MOYEN', c: '#f59e0b' } : { l: 'À TRAVAILLER', c: 'var(--vl-ember)' }

  // ── Charge combinée 28j ───────────────────────────────────────────────────────
  const { chartDates, runLoads, renfoLoadsData, chartLabels } = useMemo(() => {
    const DAYS = 28
    const dates = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i))
      return localDateStr(d)
    })
    const runL = dates.map(ds => {
      const dayActs = activities.filter(a => a.start_date?.slice(0, 10) === ds)
      return dayActs.reduce((s, a) => s + computeActivityLoad(a, fcMax), 0)
    })
    // Build renfo load from logs: avg RPE × estimated duration
    const byDate: Record<string, { rpes: number[]; times: number[] }> = {}
    renfoLogs.forEach(r => {
      if (!byDate[r.session_date]) byDate[r.session_date] = { rpes: [], times: [] }
      if (r.rpe) byDate[r.session_date].rpes.push(r.rpe)
      if (r.created_at) byDate[r.session_date].times.push(new Date(r.created_at).getTime())
    })
    const renfoL = dates.map(ds => {
      const s = byDate[ds]
      if (!s?.rpes.length) return 0
      const avgRpe = s.rpes.reduce((a, b) => a + b, 0) / s.rpes.length
      const mins = s.times.length > 1 ? Math.min(120, Math.max(20, (Math.max(...s.times) - Math.min(...s.times)) / 60000)) : 40
      return Math.round(avgRpe * mins)
    })
    const maxVal = Math.max(...runL, ...renfoL, 1)
    const labels = dates.map((ds, i) => i % 7 === 0 ? new Date(ds + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '')
    return { chartDates: dates, runLoads: runL.map(v => Math.round(v / maxVal * 100)), renfoLoadsData: renfoL.map(v => Math.round(v / maxVal * 100)), chartLabels: labels }
  }, [activities, renfoLogs, fcMax])

  // ── Renfo cat blocks ─────────────────────────────────────────────────────────
  const renfoCatData = useMemo(() => {
    const catLastDone: Record<string, string> = {}
    const catDoneThisWeek: Record<string, boolean> = {}
    renfoSessions.forEach(r => {
      Object.keys(r.completed_exercises || {}).forEach(exoId => {
        const cat = EXO_CAT[exoId]
        if (!cat) return
        if (!catLastDone[cat]) catLastDone[cat] = r.session_date
        if (r.session_date >= weekStartStr) catDoneThisWeek[cat] = true
      })
    })
    return SHOWN_CATS.map(cat => {
      const meta = CAT_META[cat]
      const lastDs = catLastDone[cat] ?? null
      const daysSince = lastDs ? Math.round((new Date(todayStr + 'T12:00').getTime() - new Date(lastDs + 'T12:00').getTime()) / 86400000) : null
      const sinceLabel = daysSince === null ? null : daysSince === 0 ? "AUJOURD'HUI" : daysSince === 1 ? 'HIER' : `${daysSince}J SANS`
      const done = !!catDoneThisWeek[cat]
      return { cat, label: meta.label, dur: meta.dur, sinceLabel, done }
    })
  }, [renfoSessions, weekStartStr, todayStr])

  const weekSessions = [...new Set(renfoSessions.filter(r => r.session_date >= weekStartStr).map(r => r.session_date))]
  const monthSessions = [...new Set(renfoSessions.filter(r => r.session_date >= localDateStr(monthStart)).map(r => r.session_date))]

  // ── CE MOIS stats ─────────────────────────────────────────────────────────────
  const kmM = thisMonth.reduce((s, a) => s + a.distance / 1000, 0)
  const dpM = thisMonth.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
  const kmML = lastMonth.reduce((s, a) => s + a.distance / 1000, 0)
  const dpML = lastMonth.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
  const pctKm = kmML > 0 ? Math.round((kmM - kmML) / kmML * 100) : null
  const pctDp = dpML > 0 ? Math.round((dpM - dpML) / dpML * 100) : null

  // Sparkline: cumulative km and D+ this month
  const sparkKm: number[] = [], sparkDp: number[] = []
  let cumKm = 0, cumDp = 0
  for (let day = 1; day <= now.getDate(); day++) {
    const dayActs = thisMonth.filter(a => new Date(a.start_date).getDate() === day)
    cumKm += dayActs.reduce((s, a) => s + a.distance / 1000, 0)
    cumDp += dayActs.reduce((s, a) => s + (a.total_elevation_gain || 0), 0)
    sparkKm.push(cumKm); sparkDp.push(cumDp)
  }

  return (
    <div style={{ maxWidth: 680 }}>
      {/* ── Next race card ── */}
      {nextRace && (() => {
        const raceDate = new Date(nextRace.date)
        const daysLeft = Math.ceil((raceDate.getTime() - now.getTime()) / 86400000)
        const phase = daysLeft <= 7 ? 'SEMAINE DE COURSE' : daysLeft <= 21 ? 'PRÉPARATION SPÉCIFIQUE' : daysLeft <= 42 ? 'BLOC INTENSIF' : 'PRÉPARATION GÉNÉRALE'
        const proj = nextRace.last_projection?.cible
        return (
          <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: '16px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>
                {nextRace.type?.toLowerCase().includes('trail') ? 'TRAIL' : 'ROUTE'} · COURSE VISÉE
              </div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '.01em', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 6 }}>
                {nextRace.name}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginBottom: 10 }}>
                {raceDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                {nextRace.distance > 0 ? ` · ${(nextRace.distance / 1000).toFixed(0)} km` : ''}
                {nextRace.goal_time ? ` · Obj. ${nextRace.goal_time}` : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 900, color: 'var(--vl-ember)' }}>{daysLeft}</span>
                <div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>JOURS</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', fontWeight: 700, color: 'var(--vl-growth)', letterSpacing: '.06em' }}>{phase}</div>
                </div>
              </div>
              <Link to={`/race/${nextRace.id}`} style={{ display: 'inline-block', marginTop: 8, fontFamily: 'var(--vl-mono)', fontSize: '.6rem', fontWeight: 700, background: 'var(--vl-ember)', color: '#fff', borderRadius: 6, padding: '8px 14px', textDecoration: 'none', letterSpacing: '.06em' }}>
                OUVRIR LA STRATÉGIE →
              </Link>
            </div>
            {proj != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 4 }}>PROJECTION VORCELAB</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 900, color: 'var(--vl-growth)', lineHeight: 1 }}>{fmtD(proj)}</div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Course · 7 derniers jours ── */}
      {activities.length > 0 && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 8 }}>
            COURSE · 7 DERNIERS JOURS
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span style={{ fontFamily: 'var(--vl-display)', fontSize: '2rem', fontWeight: 900 }}>{last7Acts.reduce((s, a) => s + a.distance / 1000, 0).toFixed(0)}</span>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-text-3)' }}>km</span>
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', marginBottom: 10 }}>
            {last7Acts.length} sortie{last7Acts.length !== 1 ? 's' : ''}{dpTotal7 > 0 ? ` · D+ ${Math.round(dpTotal7)} m` : ''}
          </div>
          {/* SVG Bar chart */}
          <svg viewBox="0 0 280 56" preserveAspectRatio="none" width="100%" height="56" style={{ display: 'block', marginBottom: 8 }}>
            {days7.map((d, i) => {
              const BAR_H = 44, COL = 40, TEXT_Y = 55
              const h = d.km > 0 ? Math.max(4, (d.km / maxKm7) * BAR_H) : 2
              const c = d.km > 0 ? 'var(--vl-ember)' : 'var(--vl-line)'
              return (
                <g key={i}>
                  <rect x={i * COL + COL / 2 - 7} y={BAR_H - h} width="14" height={h} rx="2" fill={c} />
                  <text x={i * COL + COL / 2} y={TEXT_Y} textAnchor="middle" style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fill: 'var(--vl-text-3)' }}>{d.label}</text>
                </g>
              )
            })}
          </svg>
          {efPct != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--vl-bg)', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
              <div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>% EF · 7J</div>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, color: efLabel?.c }}>{efPct}%</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', fontWeight: 700, color: efLabel?.c, letterSpacing: '.06em' }}>{efLabel?.l}</div>
              </div>
              {dpTotal7 > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>D+ TOTAL</div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800 }}>{Math.round(dpTotal7)}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)' }}>m</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Charge combinée 4 semaines ── */}
      {activities.length > 0 && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>CHARGE COMBINÉE — 4 SEMAINES</div>
            <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, display: 'inline-block', background: 'var(--vl-ember)', borderRadius: 1 }} />Course</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, display: 'inline-block', background: '#7c3aed', borderRadius: 1 }} />Renfo</span>
            </div>
          </div>
          <div style={{ height: 90 }}>
            <Line
              data={{ labels: chartLabels, datasets: [
                { label: 'Course', data: runLoads, borderColor: '#E5562A', backgroundColor: 'rgba(229,86,42,.12)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
                { label: 'Renfo',  data: renfoLoadsData, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,.10)', fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
              ]}}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true, mode: 'index', intersect: false } }, scales: { x: { ticks: { font: { size: 9 }, color: '#6b7d94', maxRotation: 0 }, grid: { color: 'rgba(255,255,255,.04)' } }, y: { display: false } } }}
            />
          </div>
        </div>
      )}

      {/* ── Renfo card ── */}
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, borderLeft: '3px solid rgba(167,139,250,.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', fontWeight: 700, color: 'var(--color-renfo,#a78bfa)', letterSpacing: '.06em' }}>
              RENFO · {weekSessions.length}/{Math.max(weekSessions.length, 5)} SEM.
            </div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.52rem', color: 'var(--vl-text-3)', marginTop: 2 }}>
              {weekSessions.length} séance{weekSessions.length !== 1 ? 's' : ''} cette semaine
            </div>
          </div>
          <Link to="/renfo" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.52rem', fontWeight: 700, color: 'var(--color-renfo,#a78bfa)', textDecoration: 'none', letterSpacing: '.06em' }}>VOIR RENFO →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {renfoCatData.map(({ cat, label, dur, sinceLabel, done }) => (
            <Link key={cat} to={`/renfo`} style={{ background: done ? 'rgba(167,139,250,.1)' : 'var(--vl-bg)', borderRadius: 8, padding: '10px 12px', border: `1px solid ${done ? 'rgba(167,139,250,.35)' : 'var(--vl-line)'}`, textDecoration: 'none', cursor: 'pointer', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.58rem', fontWeight: 700, color: done ? 'var(--color-renfo,#a78bfa)' : 'var(--vl-text-2)' }}>{label}</div>
                {done && <span style={{ fontSize: '.55rem', color: 'var(--color-renfo,#a78bfa)' }}>✓</span>}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.04em' }}>
                {sinceLabel ? `${sinceLabel} · ${dur} MIN` : `${dur} MIN`}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Ce mois ── */}
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.5rem', color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>CE MOIS</div>
          <Link to="/activities" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.52rem', fontWeight: 700, color: 'var(--vl-ember)', textDecoration: 'none', letterSpacing: '.06em' }}>VOIR TOUT →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 900, color: 'var(--vl-growth)' }}>{kmM.toFixed(0)}</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>km COURSE</div>
            {pctKm !== null && (
              <div style={{ display: 'inline-block', marginTop: 4, fontFamily: 'var(--vl-mono)', fontSize: '.48rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,.2)', color: pctKm > 5 ? 'var(--vl-growth)' : pctKm < -5 ? 'var(--vl-ember)' : 'var(--vl-text-3)' }}>
                {pctKm > 0 ? '+' : '−'} {Math.abs(pctKm)}% · vs M-1
              </div>
            )}
            <Sparkline data={sparkKm} color="#10B981" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 900, color: 'var(--vl-ember)' }}>{Math.round(dpM)}</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>m D+</div>
            {pctDp !== null && (
              <div style={{ display: 'inline-block', marginTop: 4, fontFamily: 'var(--vl-mono)', fontSize: '.48rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,.2)', color: pctDp > 5 ? 'var(--vl-growth)' : pctDp < -5 ? 'var(--vl-ember)' : 'var(--vl-text-3)' }}>
                {pctDp > 0 ? '+' : '−'} {Math.abs(pctDp)}% · vs M-1
              </div>
            )}
            <Sparkline data={sparkDp} color="var(--vl-ember)" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-renfo,#a78bfa)' }}>{monthSessions.length}</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.48rem', color: 'var(--vl-text-3)', letterSpacing: '.08em' }}>sess. RENFO</div>
          </div>
        </div>
      </div>

      {/* ── Dernières sorties ── */}
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 10 }}>DERNIÈRES SORTIES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {activities.slice(0, 5).map(act => {
          const d = new Date(act.start_date_local || act.start_date)
          const ds = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()
          return (
            <Link key={act.id} to={`/activities/${act.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vl-surf-2)', borderRadius: 8, padding: '10px 14px', textDecoration: 'none', color: 'inherit' }}>
              <div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.72rem', fontWeight: 600 }}>{act.name}</div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.52rem', color: 'var(--vl-text-3)', marginTop: 2 }}>
                  {(act.distance / 1000).toFixed(1)} km · {fmtD(act.moving_time)}{act.total_elevation_gain > 0 ? ` · D+ ${Math.round(act.total_elevation_gain)}m` : ''}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', flexShrink: 0 }}>{ds}</div>
            </Link>
          )
        })}
      </div>
      <Link to="/activities" style={{ fontFamily: 'var(--vl-mono)', fontSize: '.6rem', color: 'var(--vl-ember)', textDecoration: 'none' }}>Voir toutes les activités →</Link>
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const W = 100, H = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / range) * (H - 6)}`).join(' ')
  const fillPts = `0,${H} ${pts} ${W},${H}`
  const id = `sg-${color.replace(/[^a-z]/gi, '')}-${data.length}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', marginTop: 6, overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
