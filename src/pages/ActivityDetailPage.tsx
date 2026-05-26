import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { fetchStreams, type StreamData } from '../lib/streams'
import { computeActivityLoad } from '../lib/trainingLoad'
import { buildSessionInsights } from '../lib/sessionQuality'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityDetail {
  id: string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  elapsed_time: number | null
  start_date: string
  start_date_local: string | null
  type: string
  sport_type: string | null
  average_heartrate: number | null
  max_heartrate: number | null
  average_speed: number | null
  max_speed: number | null
  suffer_score: number | null
  description: string | null
  kudos_count: number | null
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtKm(m: number) { return (m / 1000).toFixed(2) }
function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}` : `${m}'${String(sec).padStart(2, '0')}`
}
function fmtPace(distM: number, timeS: number) {
  if (!distM || !timeS) return '—'
  const secPerKm = timeS / (distM / 1000)
  return `${Math.floor(secPerKm / 60)}'${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
function fmtSpeed(ms: number | null) { return ms ? `${(ms * 3.6).toFixed(1)} km/h` : '—' }
function fmtVam(mh: number) { return `${Math.round(mh)} m/h` }

// ─── Sample / downsample ──────────────────────────────────────────────────────

function downsample<T>(arr: T[], targetLen: number): T[] {
  if (arr.length <= targetLen) return arr
  const step = arr.length / targetLen
  return Array.from({ length: targetLen }, (_, i) => arr[Math.round(i * step)])
}

// ─── Dual-axis SVG chart ──────────────────────────────────────────────────────

interface ChartPoint { distKm: number; altM: number; hrBpm: number | null }

function DualChart({
  points,
  onHoverKm,
}: {
  points: ChartPoint[]
  onHoverKm: (km: number | null) => void
}) {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; km: string; alt: string; hr: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (!points.length) return null

  const W = 560, H = 150, padL = 38, padR = 38, padT = 8, padB = 22
  const cW = W - padL - padR, cH = H - padT - padB

  const altMin = Math.min(...points.map(p => p.altM))
  const altMax = Math.max(...points.map(p => p.altM))
  const distMax = points[points.length - 1].distKm
  const hrPoints = points.filter(p => p.hrBpm != null)
  const hrMin = hrPoints.length ? Math.min(...hrPoints.map(p => p.hrBpm!)) - 5 : 60
  const hrMax = hrPoints.length ? Math.max(...hrPoints.map(p => p.hrBpm!)) + 5 : 200

  function xOf(km: number) { return padL + (km / distMax) * cW }
  function yAlt(m: number) {
    const range = altMax - altMin
    return padT + cH - (range > 0 ? ((m - altMin) / range) * cH : cH / 2)
  }
  function yHr(bpm: number) {
    const range = hrMax - hrMin
    return padT + cH - (range > 0 ? ((bpm - hrMin) / range) * cH : cH / 2)
  }

  // Build altitude path (area fill)
  const altPath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yAlt(p.altM).toFixed(1)}`
  ).join(' ') +
    ` L${xOf(points[points.length - 1].distKm)},${padT + cH} L${padL},${padT + cH} Z`

  // Build HR path (line only)
  const hrPath = points
    .filter(p => p.hrBpm != null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yHr(p.hrBpm!).toFixed(1)}`)
    .join(' ')

  // X axis ticks
  const tickStep = distMax > 20 ? 5 : distMax > 10 ? 2 : 1
  const ticks: number[] = []
  for (let t = 0; t <= distMax; t += tickStep) ticks.push(t)

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const scaleX = W / rect.width
    const rawX = (e.clientX - rect.left) * scaleX
    if (rawX < padL || rawX > padL + cW) { setHoverX(null); setTooltip(null); onHoverKm(null); return }
    const km = ((rawX - padL) / cW) * distMax
    // Find closest point
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].distKm - km) < Math.abs(points[best].distKm - km)) best = i
    }
    const p = points[best]
    const x = xOf(p.distKm)
    setHoverX(x)
    setTooltip({
      x: Math.min(x, padL + cW - 80),
      y: padT + 4,
      km: `${p.distKm.toFixed(1)} km`,
      alt: `${Math.round(p.altM)} m`,
      hr: p.hrBpm != null ? `${Math.round(p.hrBpm)} bpm` : '—',
    })
    onHoverKm(p.distKm)
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setHoverX(null); setTooltip(null); onHoverKm(null) }}
    >
      <defs>
        <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
        </linearGradient>
        <clipPath id="chartClip">
          <rect x={padL} y={padT} width={cW} height={cH} />
        </clipPath>
      </defs>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} y1={padT + cH * (1 - f)} x2={padL + cW} y2={padT + cH * (1 - f)}
          stroke="var(--vl-line)" strokeWidth="0.5" opacity="0.5" />
      ))}

      {/* Altitude area */}
      <path d={altPath} fill="url(#altGrad)" clipPath="url(#chartClip)" />
      <path d={points.map((p, i) =>
        `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yAlt(p.altM).toFixed(1)}`
      ).join(' ')} fill="none" stroke="#3b82f6" strokeWidth="1.5" clipPath="url(#chartClip)" />

      {/* HR line */}
      {hrPoints.length > 5 && (
        <path d={hrPath} fill="none" stroke="var(--vl-ember)" strokeWidth="1.5" clipPath="url(#chartClip)" />
      )}

      {/* X axis ticks */}
      {ticks.map(t => (
        <g key={t}>
          <line x1={xOf(t)} y1={padT + cH} x2={xOf(t)} y2={padT + cH + 3} stroke="var(--vl-text-3)" strokeWidth="0.8" />
          <text x={xOf(t)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--vl-text-3)" fontFamily="var(--vl-mono)">{t}</text>
        </g>
      ))}

      {/* Left Y axis (altitude) */}
      {[altMin, Math.round((altMin + altMax) / 2), altMax].map(v => (
        <text key={v} x={padL - 3} y={yAlt(v) + 3} textAnchor="end" fontSize="8" fill="#3b82f6" fontFamily="var(--vl-mono)">
          {Math.round(v)}
        </text>
      ))}

      {/* Right Y axis (HR) */}
      {hrPoints.length > 5 && [hrMin, Math.round((hrMin + hrMax) / 2), hrMax].map(v => (
        <text key={v} x={padL + cW + 3} y={yHr(v) + 3} textAnchor="start" fontSize="8" fill="var(--vl-ember)" fontFamily="var(--vl-mono)">
          {Math.round(v)}
        </text>
      ))}

      {/* Axis labels */}
      <text x={padL - 3} y={padT + cH + 14} textAnchor="end" fontSize="7" fill="#3b82f6" fontFamily="var(--vl-mono)">alt</text>
      {hrPoints.length > 5 && (
        <text x={padL + cW + 3} y={padT + cH + 14} textAnchor="start" fontSize="7" fill="var(--vl-ember)" fontFamily="var(--vl-mono)">fc</text>
      )}

      {/* Hover */}
      {hoverX != null && (
        <line x1={hoverX} y1={padT} x2={hoverX} y2={padT + cH} stroke="var(--vl-text-2)" strokeWidth="1" strokeDasharray="3,3" />
      )}
      {tooltip && (
        <g>
          <rect x={tooltip.x} y={tooltip.y} width="76" height="40" rx="3" fill="var(--vl-bg)" stroke="var(--vl-line)" strokeWidth="0.8" opacity="0.95" />
          <text x={tooltip.x + 4} y={tooltip.y + 13} fontSize="8" fill="var(--vl-text)" fontFamily="var(--vl-mono)">{tooltip.km}</text>
          <text x={tooltip.x + 4} y={tooltip.y + 24} fontSize="8" fill="#3b82f6" fontFamily="var(--vl-mono)">{tooltip.alt}</text>
          <text x={tooltip.x + 4} y={tooltip.y + 35} fontSize="8" fill="var(--vl-ember)" fontFamily="var(--vl-mono)">{tooltip.hr}</text>
        </g>
      )}
    </svg>
  )
}

// ─── Leaflet route map ─────────────────────────────────────────────────────────

function RouteMap({
  latlng,
  hoverKm,
  distArr,
}: {
  latlng: [number, number][]
  hoverKm: number | null
  distArr: number[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.CircleMarker | null>(null)
  const polyRef = useRef<L.Polyline | null>(null)

  useEffect(() => {
    if (!containerRef.current || latlng.length < 2) return
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    const map = L.map(containerRef.current, { zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    const poly = L.polyline(latlng, { color: '#E5562A', weight: 3 }).addTo(map)
    map.fitBounds(poly.getBounds(), { padding: [20, 20] })
    polyRef.current = poly
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [latlng])

  useEffect(() => {
    if (!mapRef.current) return
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
    if (hoverKm == null || !distArr.length) return

    const hoverM = hoverKm * 1000
    let best = 0
    for (let i = 1; i < distArr.length; i++) {
      if (Math.abs(distArr[i] - hoverM) < Math.abs(distArr[best] - hoverM)) best = i
    }
    if (latlng[best]) {
      markerRef.current = L.circleMarker(latlng[best], {
        radius: 6, fillColor: '#fff', color: '#E5562A', weight: 2, fillOpacity: 1,
      }).addTo(mapRef.current)
    }
  }, [hoverKm, distArr, latlng])

  return (
    <div ref={containerRef} style={{ height: 240, borderRadius: 6, overflow: 'hidden', background: 'var(--vl-bg-2)' }} />
  )
}

// ─── VAM sections ─────────────────────────────────────────────────────────────

interface ClimbSection {
  startKm: number; endKm: number; dPlus: number; timeS: number; vam: number
}

function extractClimbs(dist: number[], alt: number[], time: number[]): ClimbSection[] {
  const sections: ClimbSection[] = []
  let inClimb = false
  let sIdx = 0
  const MERGE_GAP_M = 400
  const MIN_DPLUS = 25

  for (let i = 1; i < dist.length; i++) {
    const dAlt = alt[i] - alt[i - 1]
    const dDist = dist[i] - dist[i - 1]
    if (dDist <= 0) continue
    const grade = (dAlt / dDist) * 100

    if (grade >= 3) {
      if (!inClimb) { inClimb = true; sIdx = i - 1 }
    } else if (inClimb) {
      // Check if this is a real break or just noise
      const remaining = dist[i] - dist[i - 1]
      if (remaining > MERGE_GAP_M || grade < -5) {
        const dplus = alt[i - 1] - alt[sIdx]
        if (dplus >= MIN_DPLUS) {
          const dtS = time[i - 1] - time[sIdx]
          sections.push({
            startKm: dist[sIdx] / 1000,
            endKm: dist[i - 1] / 1000,
            dPlus: dplus,
            timeS: dtS,
            vam: dtS > 10 ? (dplus / dtS) * 3600 : 0,
          })
        }
        inClimb = false
      }
    }
  }
  // Close last section
  if (inClimb) {
    const n = dist.length - 1
    const dplus = alt[n] - alt[sIdx]
    if (dplus >= MIN_DPLUS) {
      const dtS = time[n] - time[sIdx]
      sections.push({
        startKm: dist[sIdx] / 1000,
        endKm: dist[n] / 1000,
        dPlus: dplus,
        timeS: dtS,
        vam: dtS > 10 ? (dplus / dtS) * 3600 : 0,
      })
    }
  }

  return sections.sort((a, b) => b.dPlus - a.dPlus).slice(0, 6)
}

function VamSectionsCard({ dist, alt, time }: { dist: number[]; alt: number[]; time: number[] }) {
  const climbs = extractClimbs(dist, alt, time)
  if (!climbs.length) return null

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>MONTÉES — VAM</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ color: 'var(--vl-text-3)' }}>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.06em', fontWeight: 600 }}>KM</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.06em', fontWeight: 600 }}>D+</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.06em', fontWeight: 600 }}>TEMPS</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.06em', fontWeight: 600 }}>VAM</th>
            </tr>
          </thead>
          <tbody>
            {climbs.map((s, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--vl-line)' }}>
                <td style={{ padding: '4px 6px', color: 'var(--vl-text-2)' }}>
                  {s.startKm.toFixed(1)} → {s.endKm.toFixed(1)}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--vl-growth)', fontWeight: 600 }}>
                  +{Math.round(s.dPlus)}m
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--vl-text-2)' }}>
                  {fmtTime(Math.round(s.timeS))}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700,
                  color: s.vam >= 900 ? 'var(--vl-growth)' : s.vam >= 600 ? 'var(--vl-amber)' : 'var(--vl-ember)' }}>
                  {s.vam > 0 ? fmtVam(s.vam) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Streams section (chart + map) ────────────────────────────────────────────

function StreamsSection({ activityId, fcMax }: { activityId: string; fcMax: number }) {
  const [hoverKm, setHoverKm] = useState<number | null>(null)

  const { data: streams, isLoading } = useQuery<StreamData>({
    queryKey: ['activity-streams', activityId],
    queryFn: () => fetchStreams(activityId),
    staleTime: 30 * 60 * 1000,
  })

  if (isLoading) return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="loading"><div className="spinner" /></div>
      <div className="mlabel" style={{ textAlign: 'center', color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
        Chargement des streams…
      </div>
    </div>
  )

  if (!streams || streams._authError || !streams.altitude?.data?.length) return null

  const time = streams.time?.data ?? []
  const dist = streams.distance?.data ?? []
  const alt = streams.altitude.data
  const hr = streams.heartrate?.data
  const latlng = streams.latlng?.data

  // Build chart points (downsampled)
  const raw: ChartPoint[] = []
  const n = alt.length
  for (let i = 0; i < n; i++) {
    if (dist[i] == null) continue
    raw.push({ distKm: dist[i] / 1000, altM: alt[i], hrBpm: hr ? hr[i] : null })
  }
  const chartPts = downsample(raw, 300)

  const hasDist = dist.length > 0
  const hasLatlng = latlng && latlng.length > 5

  return (
    <>
      {/* Dual-axis chart */}
      {hasDist && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: '0.5rem' }}>
            PROFIL ALTITUDE
            {hr && <span style={{ color: 'var(--vl-ember)', marginLeft: 8 }}>+ FC</span>}
          </div>
          <DualChart points={chartPts} onHoverKm={setHoverKm} />
          <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 9, color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)' }}>
            <span style={{ color: '#3b82f6' }}>■ Altitude (m)</span>
            {hr && <span style={{ color: 'var(--vl-ember)' }}>— FC (bpm)</span>}
          </div>
        </div>
      )}

      {/* Leaflet map */}
      {hasLatlng && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: '0.5rem' }}>TRACÉ GPS</div>
          <RouteMap latlng={latlng} hoverKm={hoverKm} distArr={dist} />
        </div>
      )}

      {/* VAM sections */}
      {hasDist && time.length > 0 && (
        <VamSectionsCard dist={dist} alt={alt} time={time} />
      )}
    </>
  )
}

// ─── Session quality card ─────────────────────────────────────────────────────

function SessionQCard({ activity, streams, fcMax }: { activity: ActivityDetail; streams: StreamData | undefined; fcMax: number }) {
  const data = buildSessionInsights(activity, streams ?? {}, fcMax)
  const { type, drift, insights, hasHR } = data

  if (!hasHR && insights.length === 0 && !drift) return null

  const driftColor = drift && drift.driftPct > 10 ? 'var(--vl-ember)' : drift && drift.driftPct > 5 ? 'var(--vl-amber)' : 'var(--vl-growth)'

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="clabel" style={{ margin: 0 }}>QUALITÉ DE SÉANCE</div>
        <span style={{
          fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.1em',
          padding: '3px 8px', borderRadius: 3, background: 'var(--vl-bg-2)', color: 'var(--vl-text-2)',
        }}>
          {type.toUpperCase()}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {drift != null && Math.abs(drift.driftPct) >= 3 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: driftColor }}>
              {drift.driftPct > 0 ? '+' : ''}{drift.driftPct.toFixed(1)}%
            </div>
            <div className="slbl" style={{ fontSize: 10 }}>Dérive FC</div>
          </div>
        )}
        {insights.map(ins => (
          <div key={ins.key}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{ins.value}</div>
            <div className="slbl" style={{ fontSize: 10 }}>{ins.key}</div>
          </div>
        ))}
        {hasHR && activity.average_heartrate && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {Math.round(activity.average_heartrate)} bpm
            </div>
            <div className="slbl" style={{ fontSize: 10 }}>FC moy.</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>()
  const { user } = useVLStore()

  const { data: profile } = useQuery<{ fc_max?: number } | null>({
    queryKey: ['profile-fcmax', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase.from('profiles').select('fc_max').eq('id', user.id).single()
      return data
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  })

  const fcMax = profile?.fc_max ?? 185

  const { data: activity, isLoading, isError } = useQuery<ActivityDetail | null>({
    queryKey: ['activity-detail', activityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,elapsed_time,start_date,start_date_local,type,sport_type,average_heartrate,max_heartrate,average_speed,max_speed,suffer_score,description,kudos_count')
        .eq('id', activityId!)
        .single()
      if (error) throw error
      return data as ActivityDetail
    },
    enabled: !!activityId,
  })

  const { data: streams } = useQuery<StreamData>({
    queryKey: ['activity-streams', activityId],
    queryFn: () => fetchStreams(activityId!),
    enabled: !!activityId,
    staleTime: 30 * 60 * 1000,
  })

  const BackLink = () => (
    <Link to="/activities" className="mlabel" style={{ display: 'inline-block', marginBottom: '1rem', textDecoration: 'none' }}>
      ← Activités
    </Link>
  )

  if (isLoading) return <><BackLink /><div className="loading"><div className="spinner" /></div></>
  if (isError || !activity) return <><BackLink /><div className="mlabel">Activité introuvable.</div></>

  const load = computeActivityLoad(activity, fcMax)
  const paceStr = fmtPace(activity.distance, activity.moving_time)
  const dpKm = activity.distance > 0 ? (activity.total_elevation_gain ?? 0) / (activity.distance / 1000) : 0

  return (
    <>
      <BackLink />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', letterSpacing: '0.02em', lineHeight: 1.1, marginBottom: 6 }}>
          {activity.name}
        </div>
        <div className="act-meta">
          {fmtDate(activity.start_date_local ?? activity.start_date)}
          {' · '}{activity.sport_type ?? activity.type}
        </div>
        {activity.description && (
          <div className="mlabel" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)' }}>
            {activity.description}
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className="strip" style={{ marginBottom: '1rem' }}>
        <div className="scell">
          <div className="sval">{fmtKm(activity.distance)}</div>
          <div className="slbl">KM</div>
        </div>
        <div className="scell">
          <div className="sval">{fmtTime(activity.moving_time)}</div>
          <div className="slbl">Temps</div>
        </div>
        <div className="scell">
          <div className="sval">{paceStr}</div>
          <div className="slbl">Allure</div>
        </div>
        <div className="scell">
          <div className="sval">+{Math.round(activity.total_elevation_gain ?? 0)}</div>
          <div className="slbl">D+</div>
        </div>
      </div>

      {/* Session quality */}
      <SessionQCard activity={activity} streams={streams} fcMax={fcMax} />

      {/* Altitude profile + map + VAM sections (streams-powered) */}
      {activityId && <StreamsSection activityId={activityId} fcMax={fcMax} />}

      {/* Metrics card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel" style={{ marginBottom: '0.75rem' }}>MÉTRIQUES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'D+/km', val: `${dpKm.toFixed(0)} m/km` },
            { label: 'Vitesse moy.', val: fmtSpeed(activity.average_speed) },
            { label: 'Vitesse max', val: fmtSpeed(activity.max_speed) },
            { label: 'Temps total', val: activity.elapsed_time ? fmtTime(activity.elapsed_time) : '—' },
            { label: 'FC max', val: activity.max_heartrate ? `${Math.round(activity.max_heartrate)} bpm` : '—' },
            { label: 'Suffer score', val: activity.suffer_score != null ? String(activity.suffer_score) : '—' },
            { label: 'Kudos', val: activity.kudos_count != null ? String(activity.kudos_count) : '—' },
          ].map(({ label, val }) => (
            <div key={label} className="fg" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mlabel" style={{ color: 'var(--vl-text-3)' }}>{label}</span>
              <span className="mlabel">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* TRIMP load */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="clabel" style={{ marginBottom: '0.5rem' }}>CHARGE TRIMP</div>
        <div className="sval" style={{ color: load > 200 ? 'var(--vl-ember)' : load > 100 ? 'var(--vl-amber)' : 'var(--vl-growth)' }}>
          {load}
        </div>
        <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Durée × intensité × dénivelé × type
        </div>
      </div>
    </>
  )
}
