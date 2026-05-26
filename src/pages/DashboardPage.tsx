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

interface LastProjection {
  cible: number
  prudent: number
  agressif: number
  confidence: string
}

interface NextRace {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  goal_time: string | null
  gpx_data: { lat: number; lon: number; ele: number }[] | null
  last_projection: LastProjection | null
}

function formatKm(meters: number) {
  return (meters / 1000).toFixed(1)
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

function formatPace(distM: number, timeS: number): string {
  if (!distM || !timeS) return '—'
  const secPerKm = timeS / (distM / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}'${s.toString().padStart(2, '0')}"/km`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function isRunning(type: string) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type)
}

// ─── 7j Bar Chart (SVG) ───────────────────────────────────────────────────────

function Bar7j({ activities }: { activities: Activity2[] }) {
  const now = new Date()
  const LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const acts = activities.filter((a) => (a.start_date_local ?? a.start_date)?.slice(0, 10) === ds)
    return {
      label: LABELS[(d.getDay() + 6) % 7],
      km: acts.reduce((s, a) => s + a.distance / 1000, 0),
      dp: acts.reduce((s, a) => s + (a.total_elevation_gain || 0), 0),
    }
  })

  const maxKm = Math.max(...days.map((d) => d.km), 0.1)
  const maxDp = Math.max(...days.map((d) => d.dp), 1)
  const VW = 280, BH = 44, TH = 56, COL = 40

  const dpPts = days.map((d, i) => ({
    x: i * COL + COL / 2,
    y: d.dp > 0 ? BH - (d.dp / maxDp) * BH * 0.88 : BH,
  }))

  const spline = (pts: { x: number; y: number }[]) => {
    const cl = (v: number) => Math.max(0, Math.min(BH, v))
    let path = `M${pts[0].x},${pts[0].y}`
    const t = 0.18
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
      path += ` C${(p1.x + (p2.x - p0.x) * t).toFixed(1)},${cl(p1.y + (p2.y - p0.y) * t).toFixed(1)} ${(p2.x - (p3.x - p1.x) * t).toFixed(1)},${cl(p2.y - (p3.y - p1.y) * t).toFixed(1)} ${p2.x},${p2.y}`
    }
    return path
  }

  const lineD = spline(dpPts)
  const areaD = lineD + ` L${dpPts[dpPts.length - 1].x},${BH} L${dpPts[0].x},${BH} Z`
  const totalDp = days.reduce((s, d) => s + d.dp, 0)
  const totalKm = days.reduce((s, d) => s + d.km, 0)
  const runCount = days.filter((d) => d.km > 0).length

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="mlabel" style={{ marginBottom: 8, letterSpacing: '.14em' }}>COURSE · 7 DERNIERS JOURS</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '2.6rem', fontWeight: 800, color: 'var(--vl-growth)', lineHeight: 1 }}>
          {totalKm.toFixed(1)}
        </div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.7rem', color: 'var(--vl-text-2)' }}>km</div>
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginBottom: 12 }}>
        {runCount} sortie{runCount > 1 ? 's' : ''} · D+ {Math.round(totalDp)} m
      </div>
      <svg
        viewBox={`0 0 ${VW} ${TH}`}
        preserveAspectRatio="none"
        width="100%"
        height={TH}
        style={{ display: 'block', marginBottom: 8 }}
      >
        <path d={areaD} fill="var(--vl-growth)" opacity={0.18} />
        <path d={lineD} fill="none" stroke="var(--vl-growth)" strokeWidth={1.5} opacity={0.5} strokeLinejoin="round" strokeLinecap="round" />
        {days.map((d, i) => {
          const h = d.km > 0 ? Math.max(4, (d.km / maxKm) * BH) : 2
          return (
            <rect
              key={i}
              x={i * COL + COL / 2 - 7}
              y={BH - h}
              width={14}
              height={h}
              rx={2}
              fill={d.km > 0 ? 'var(--vl-ember)' : 'var(--vl-line)'}
            />
          )
        })}
        {days.map((d, i) => (
          <text
            key={i}
            x={i * COL + COL / 2}
            y={TH - 1}
            textAnchor="middle"
            style={{ fontFamily: "'JetBrains Mono','IBM Plex Mono',monospace", fontSize: 9, fill: 'var(--vl-text-3)', letterSpacing: '.08em' }}
          >
            {d.label}
          </text>
        ))}
      </svg>
      {totalDp > 0 && (
        <div style={{ background: 'var(--vl-surf-2)', borderRadius: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="mlabel" style={{ fontSize: 8, margin: 0, letterSpacing: '.1em' }}>D+ TOTAL</div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--vl-growth)', lineHeight: 1, marginTop: 2 }}>
              {Math.round(totalDp)}
            </div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>m</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Charge combinée 4 semaines (inline SVG) ──────────────────────────────────

function ChargeCombinee({ activities, renfoLogs }: { activities: Activity2[]; renfoLogs: SessionLog[] }) {
  const now = new Date()
  const DAYS = 28
  const dates = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1 - i))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const runKms = dates.map((ds) => {
    const acts = activities.filter((a) => (a.start_date_local ?? a.start_date)?.slice(0, 10) === ds && isRunning(a.type))
    return acts.reduce((s, a) => s + a.distance / 1000, 0)
  })

  const renfoMap: Record<string, number> = {}
  renfoLogs.forEach((r) => {
    if (r.session_date) renfoMap[r.session_date] = (renfoMap[r.session_date] ?? 0) + (r.duration_min ?? 40)
  })
  const renfoMins = dates.map((ds) => renfoMap[ds] ?? 0)

  const maxRun = Math.max(...runKms, 1)
  const maxRenfo = Math.max(...renfoMins, 1)

  const VW = 280, H = 80, W_COL = VW / DAYS

  const runPts = runKms.map((v, i) => ({ x: i * W_COL + W_COL / 2, y: H - (v / maxRun) * H * 0.85 }))
  const renfoPts = renfoMins.map((v, i) => ({ x: i * W_COL + W_COL / 2, y: H - (v / maxRenfo) * H * 0.85 }))

  const polyline = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const hasData = runKms.some((v) => v > 0) || renfoMins.some((v) => v > 0)
  if (!hasData) return null

  return (
    <div className="card" style={{ marginBottom: '1.5rem', padding: '14px 16px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="clabel" style={{ margin: 0 }}>Charge combinée — 4 semaines</div>
        <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--vl-mono)', fontSize: 9 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 3, background: 'var(--vl-ember)', borderRadius: 2, display: 'inline-block' }} />
            <span style={{ color: 'var(--vl-text-3)' }}>Course</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 3, background: '#7c3aed', borderRadius: 2, display: 'inline-block' }} />
            <span style={{ color: 'var(--vl-text-3)' }}>Renfo</span>
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
        <polyline
          points={polyline(runPts)}
          fill="none"
          stroke="var(--vl-ember)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.8}
        />
        <polyline
          points={polyline(renfoPts)}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Week separators */}
        {[7, 14, 21].map((d) => (
          <line
            key={d}
            x1={(d * W_COL).toFixed(1)}
            y1={0}
            x2={(d * W_COL).toFixed(1)}
            y2={H}
            stroke="var(--vl-line)"
            strokeWidth={0.5}
            opacity={0.4}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Next Race Widget ─────────────────────────────────────────────────────────

function getPhase(daysLeft: number): { label: string; color: string } {
  if (daysLeft <= 7)  return { label: 'SEMAINE DE COURSE', color: 'var(--vl-ember)' }
  if (daysLeft <= 21) return { label: 'AFFÛTAGE', color: 'var(--vl-amber)' }
  if (daysLeft <= 42) return { label: 'PRÉPARATION SPÉCIFIQUE', color: 'var(--vl-growth)' }
  return { label: 'CONSTRUCTION DE BASE', color: 'var(--vl-text-2)' }
}

function fmtTimeS(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function GpxTrace({ gpxData }: { gpxData: { lat: number; lon: number; ele: number }[] }) {
  const step = Math.max(1, Math.floor(gpxData.length / 300))
  const pts = gpxData.filter((_, i) => i % step === 0)
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const dLat = maxLat - minLat || 0.001, dLon = maxLon - minLon || 0.001
  const VW = 240, VH = 130
  const scale = Math.min(VW / dLon, VH / dLat) * 0.82
  const ox = (VW - dLon * scale) / 2, oy = (VH - dLat * scale) / 2
  const tracePts = pts.map((p) =>
    `${(ox + (p.lon - minLon) * scale).toFixed(1)},${(oy + (maxLat - p.lat) * scale).toFixed(1)}`
  ).join(' ')
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', opacity: 0.22, pointerEvents: 'none' }}>
      <polyline points={tracePts} fill="none" stroke="var(--vl-ember)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniAlti({ gpxData }: { gpxData: { lat: number; lon: number; ele: number }[] }) {
  const step = Math.max(1, Math.floor(gpxData.length / 80))
  const eles = gpxData.filter((_, i) => i % step === 0).map((p) => p.ele || 0)
  if (eles.length < 4) return null
  const mn = Math.min(...eles), mx = Math.max(...eles), range = mx - mn || 1
  const W = 100, H = 36
  const coords = eles.map((v, i) =>
    `${((i / (eles.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - mn) / range) * (H - 6)).toFixed(1)}`
  )
  const pathD = `M${coords.join(' L')}`
  return (
    <div style={{ position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(to top, var(--vl-surf), transparent)', zIndex: 1, pointerEvents: 'none' }} />
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={44} style={{ display: 'block', pointerEvents: 'none' }}>
        <defs>
          <linearGradient id="altiG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--vl-ember)" stopOpacity={0.35} />
            <stop offset="1" stopColor="var(--vl-ember)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${pathD} L${W},${H} L0,${H} Z`} fill="url(#altiG)" />
        <path d={pathD} fill="none" stroke="var(--vl-ember)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
      </svg>
    </div>
  )
}

function NextRaceWidget({ race }: { race: NextRace }) {
  const now = new Date()
  const raceDate = new Date(race.date)
  const daysLeft = Math.ceil((raceDate.getTime() - now.getTime()) / 86400000)
  const phase = getPhase(daysLeft)
  const dateStr = raceDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const gpxPts = Array.isArray(race.gpx_data) && race.gpx_data.length > 4 ? race.gpx_data : null
  const proj = race.last_projection

  const confColor = proj
    ? proj.confidence === 'good' ? 'var(--color-victory)' : proj.confidence === 'medium' ? 'var(--vl-amber)' : 'var(--vl-ember)'
    : ''
  const confFilled = proj
    ? proj.confidence === 'good' ? 5 : proj.confidence === 'medium' ? 3 : 1
    : 0

  return (
    <Link to={`/race/${race.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
        {/* clickable wrapper */}
        <div style={{ position: 'relative', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Header label */}
          <div style={{ position: 'relative', padding: '10px 14px 0', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '8.5px', fontWeight: 700, letterSpacing: '.16em', color: 'var(--vl-text-3)', textTransform: 'uppercase' }}>
              STRATÉGIE DE COURSE
            </span>
          </div>

          {/* Two-column body */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

            {/* LEFT column */}
            <div style={{ flex: 1.1, padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 4 }}>
                {race.type ?? 'COURSE'} · COURSE VISÉE
              </div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', lineHeight: 0.88, marginBottom: 6 }}>
                {race.name}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.68rem', color: 'var(--vl-text-2)', marginBottom: 10 }}>
                {dateStr}{race.distance ? ` · ${race.distance} km` : ''}{race.elevation ? ` · D+ ${race.elevation} m` : ''}
              </div>
              {/* Countdown pushed to bottom */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{ fontFamily: 'var(--vl-display)', fontSize: '3.8rem', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 0.82, letterSpacing: '-.03em' }}>
                  {daysLeft}
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'uppercase', letterSpacing: '.16em', marginTop: 4 }}>
                  JOURS
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '8.5px', color: phase.color, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, marginTop: 4, marginBottom: 12 }}>
                  {phase.label}
                </div>
                <div style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', borderRadius: 'var(--vl-r-sm)', padding: '9px 14px', fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.08em', textAlign: 'center', userSelect: 'none' }}>
                  OUVRIR LA STRATÉGIE →
                </div>
              </div>
            </div>

            {/* RIGHT column */}
            <div style={{ width: '44%', borderLeft: '1px solid var(--vl-line-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
              {/* Projection block */}
              {proj && (
                <div style={{ padding: '12px 12px 8px', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '9.5px', color: 'var(--vl-text-2)', letterSpacing: '.16em', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>
                    PROJECTION VORCELAB
                  </div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(2.2rem,4vw,3rem)', fontWeight: 800, color: 'var(--color-victory)', letterSpacing: '-.03em', lineHeight: 0.82 }}>
                    {fmtTimeS(proj.cible)}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--vl-mono)', letterSpacing: 2, marginTop: 6 }}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} style={{ color: i < confFilled ? confColor : 'var(--vl-text-3)' }}>
                        {i < confFilled ? '●' : '○'}
                      </span>
                    ))}
                  </div>
                  {proj.prudent && proj.agressif && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 7, color: 'var(--vl-text-3)' }}>
                        PRUDENT <span style={{ color: 'var(--vl-text-2)' }}>{fmtTimeS(proj.prudent)}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 7, color: 'var(--color-victory)', fontWeight: 700 }}>
                        CIBLE {fmtTimeS(proj.cible)}
                      </span>
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 7, color: 'var(--vl-text-3)' }}>
                        AGRESSIF <span style={{ color: 'var(--vl-text-2)' }}>{fmtTimeS(proj.agressif)}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* 2D route trace */}
              {gpxPts && (
                <div style={{ flex: 1, overflow: 'hidden', minHeight: 40 }}>
                  <GpxTrace gpxData={gpxPts} />
                </div>
              )}
              {/* Mini altimetry at bottom */}
              {gpxPts && <MiniAlti gpxData={gpxPts} />}
            </div>

          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Suggested focuses ────────────────────────────────────────────────────────

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
      const cutoff = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_focus_log')
        .select('focus,duration_min,session_date')
        .eq('user_id', user!.id)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: false })
      return (data ?? []) as SessionLog[]
    },
    enabled: !!user,
  })

  const { data: nextRace } = useQuery<NextRace | null>({
    queryKey: ['next-race-dashboard'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type,goal_time,gpx_data,last_projection')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      return data as NextRace | null
    },
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

  // Renfo count this week
  const weekCutoff = new Date(now)
  weekCutoff.setDate(now.getDate() - 7)
  const weekCutoffStr = weekCutoff.toISOString().slice(0, 10)
  const renfoWeekCount = renfoLogs.filter((r) => r.session_date && r.session_date >= weekCutoffStr).length

  // Co-périodisation
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

  const lastDateByFocus: Record<string, string> = {}
  for (const s of renfoLogs) {
    if (s.focus && s.session_date && !lastDateByFocus[s.focus]) {
      lastDateByFocus[s.focus] = s.session_date
    }
  }

  const phase = get4WeekPhase()
  const sortedFocuses = [...SUGGESTED_FOCUSES].sort((a, b) => {
    const aPref = preferred.has(a) ? 0 : avoided.has(a) ? 2 : 1
    const bPref = preferred.has(b) ? 0 : avoided.has(b) ? 2 : 1
    if (aPref !== bPref) return aPref - bPref
    const aLast = lastDateByFocus[a] ? new Date(lastDateByFocus[a]).getTime() : 0
    const bLast = lastDateByFocus[b] ? new Date(lastDateByFocus[b]).getTime() : 0
    return aLast - bLast
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
          {/* Prochaine course */}
          {nextRace && <NextRaceWidget race={nextRace} />}

          {/* KPI course */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-val" style={{ color: 'var(--vl-ember)' }}>{formatKm(kmMonth)}</div>
              <div className="stat-lbl">KM CE MOIS</div>
            </div>
            <div className="stat-card">
              <div className="stat-val" style={{ color: 'var(--vl-ember)' }}>{formatKm(kmWeek)}</div>
              <div className="stat-lbl">KM CETTE SEMAINE</div>
            </div>
            <div className="stat-card">
              <div className="stat-val" style={{ color: 'var(--vl-growth)' }}>{Math.round(elevMonth)}</div>
              <div className="stat-lbl">D+ CE MOIS</div>
            </div>
          </div>

          {/* 7j bar chart */}
          {runs.length > 0 && <Bar7j activities={activities} />}

          {/* Charge combinée */}
          <ChargeCombinee activities={activities} renfoLogs={renfoLogs} />

          {/* Renfo */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div className="clabel">RENFO</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="mlabel" style={{ fontSize: 9, color: '#a78bfa', letterSpacing: '.12em' }}>
                  {renfoWeekCount > 0 ? `${renfoWeekCount} SESSION${renfoWeekCount > 1 ? 'S' : ''} · 7J` : ''}
                </div>
                <div className="mlabel" style={{ color: DUP4_COLORS[phase] }}>
                  {DUP4_LABELS[phase]}
                </div>
              </div>
            </div>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div className="clabel" style={{ margin: 0 }}>DERNIÈRES SORTIES</div>
              <Link to="/activities" style={{ textDecoration: 'none' }}>
                <div className="mlabel" style={{ color: 'var(--vl-ember)', fontSize: 9, letterSpacing: '.1em' }}>VOIR TOUT →</div>
              </Link>
            </div>
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
                      {(a.average_heartrate || a.distance > 0) && (
                        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 2, display: 'flex', gap: 8 }}>
                          {a.average_heartrate && (
                            <span style={{ color: 'var(--vl-ember)' }}>♥ {Math.round(a.average_heartrate)} bpm</span>
                          )}
                          <span>{formatPace(a.distance, a.moving_time)}</span>
                        </div>
                      )}
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
