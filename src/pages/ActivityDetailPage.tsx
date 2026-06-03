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
import { buildSessionDebrief } from '../lib/sessionDebrief'
import { computeDecoupling, type DurabilityStatus } from '../lib/durability'
import { fetchActivityWeather, mergeStravaTemp, type WeatherData } from '../lib/weather'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityDetail {
  id: string
  strava_activity_id: number | string | null
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
  average_temp: number | null
}

interface RecentActivity {
  id: string
  distance: number
  total_elevation_gain: number | null
  moving_time: number
  start_date: string
  type: string
  sport_type: string | null
  average_heartrate: number | null
  average_speed: number | null
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
function fmtPaceFromMps(mps: number | null) {
  if (!mps || mps <= 0) return '—'
  const secPerKm = 1000 / mps
  return `${Math.floor(secPerKm / 60)}'${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}
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

  const altPath = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yAlt(p.altM).toFixed(1)}`
  ).join(' ') +
    ` L${xOf(points[points.length - 1].distKm)},${padT + cH} L${padL},${padT + cH} Z`

  const hrPath = points
    .filter(p => p.hrBpm != null)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yHr(p.hrBpm!).toFixed(1)}`)
    .join(' ')

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

      {[0.25, 0.5, 0.75, 1].map(f => (
        <line key={f} x1={padL} y1={padT + cH * (1 - f)} x2={padL + cW} y2={padT + cH * (1 - f)}
          stroke="var(--vl-line)" strokeWidth="0.5" opacity="0.5" />
      ))}

      <path d={altPath} fill="url(#altGrad)" clipPath="url(#chartClip)" />
      <path d={points.map((p, i) =>
        `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yAlt(p.altM).toFixed(1)}`
      ).join(' ')} fill="none" stroke="#3b82f6" strokeWidth="1.5" clipPath="url(#chartClip)" />

      {hrPoints.length > 5 && (
        <path d={hrPath} fill="none" stroke="var(--vl-ember)" strokeWidth="1.5" clipPath="url(#chartClip)" />
      )}

      {ticks.map(t => (
        <g key={t}>
          <line x1={xOf(t)} y1={padT + cH} x2={xOf(t)} y2={padT + cH + 3} stroke="var(--vl-text-3)" strokeWidth="0.8" />
          <text x={xOf(t)} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--vl-text-3)" fontFamily="var(--vl-mono)">{t}</text>
        </g>
      ))}

      {[altMin, Math.round((altMin + altMax) / 2), altMax].map(v => (
        <text key={v} x={padL - 3} y={yAlt(v) + 3} textAnchor="end" fontSize="8" fill="#3b82f6" fontFamily="var(--vl-mono)">
          {Math.round(v)}
        </text>
      ))}

      {hrPoints.length > 5 && [hrMin, Math.round((hrMin + hrMax) / 2), hrMax].map(v => (
        <text key={v} x={padL + cW + 3} y={yHr(v) + 3} textAnchor="start" fontSize="8" fill="var(--vl-ember)" fontFamily="var(--vl-mono)">
          {Math.round(v)}
        </text>
      ))}

      <text x={padL - 3} y={padT + cH + 14} textAnchor="end" fontSize="7" fill="#3b82f6" fontFamily="var(--vl-mono)">alt</text>
      {hrPoints.length > 5 && (
        <text x={padL + cW + 3} y={padT + cH + 14} textAnchor="start" fontSize="7" fill="var(--vl-ember)" fontFamily="var(--vl-mono)">fc</text>
      )}

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

// ─── VAM sections table ────────────────────────────────────────────────────────

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

// ─── FC zones bar ─────────────────────────────────────────────────────────────

const FC_ZONE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444']
const FC_ZONE_LABELS = ['Z1 <60%', 'Z2 60–70%', 'Z3 70–80%', 'Z4 80–90%', 'Z5 >90%']

function computeFcZones(hrData: number[], fcMax: number): number[] {
  const counts = [0, 0, 0, 0, 0]
  hrData.forEach(h => {
    const p = h / fcMax
    if (p < 0.6) counts[0]++
    else if (p < 0.7) counts[1]++
    else if (p < 0.8) counts[2]++
    else if (p < 0.9) counts[3]++
    else counts[4]++
  })
  const tot = hrData.length
  return counts.map(c => Math.round(c / tot * 100))
}

function FcZonesCard({ hrData, fcMax }: { hrData: number[]; fcMax: number }) {
  if (!hrData.length) return null
  const pcts = computeFcZones(hrData, fcMax)
  const highPct = pcts[3] + pcts[4]

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="clabel" style={{ margin: 0 }}>RÉPARTITION FC</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, color: highPct > 50 ? 'var(--vl-ember)' : highPct > 25 ? 'var(--vl-amber)' : 'var(--vl-growth)' }}>
          Z4-Z5 : {highPct}%
        </div>
      </div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {pcts.map((p, i) => p > 0 ? (
          <div key={i} style={{ flex: p, background: FC_ZONE_COLORS[i], minWidth: 2 }} title={`${FC_ZONE_LABELS[i]} : ${p}%`} />
        ) : null)}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 7 }}>
        {FC_ZONE_LABELS.map((l, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: FC_ZONE_COLORS[i], display: 'inline-block', flexShrink: 0 }} />
            {l} <span style={{ color: pcts[i] > 0 ? 'var(--vl-text)' : 'var(--vl-text-3)', fontWeight: pcts[i] > 0 ? 700 : 400 }}>{pcts[i]}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Session summary (lecture de séance) ──────────────────────────────────────

const RUN_TYPES_DETAIL = ['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun']

function SessionSummaryCard({ activity, hrData, fcMax, recentRuns }: {
  activity: ActivityDetail
  hrData: number[]
  fcMax: number
  recentRuns: RecentActivity[]
}) {
  const distKm = activity.distance / 1000
  const fcPct = activity.average_heartrate ? Math.round(activity.average_heartrate / fcMax * 100) : null

  const actDate = new Date(activity.start_date)
  const d28ago = new Date(actDate); d28ago.setDate(actDate.getDate() - 28)
  const d7ago = new Date(actDate); d7ago.setDate(actDate.getDate() - 7)

  const runs28 = recentRuns.filter(a => {
    const d = new Date(a.start_date)
    return (RUN_TYPES_DETAIL.includes(a.type) || RUN_TYPES_DETAIL.includes(a.sport_type ?? '')) && d >= d28ago && d < actDate
  })
  const runs7 = runs28.filter(a => new Date(a.start_date) >= d7ago)
  const km28 = runs28.reduce((s, a) => s + a.distance / 1000, 0)
  const km7 = runs7.reduce((s, a) => s + a.distance / 1000, 0)
  const dp28 = runs28.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)

  let intensityLabel = ''
  let effortComment = ''
  if (fcPct !== null) {
    if (fcPct < 70)      { intensityLabel = `intensité faible (${fcPct}% FCmax)`;      effortComment = 'Sortie facile ou récupératrice.' }
    else if (fcPct < 80) { intensityLabel = `intensité modérée (${fcPct}% FCmax)`;     effortComment = 'Endurance active, dosage modéré.' }
    else if (fcPct < 88) { intensityLabel = `intensité élevée (${fcPct}% FCmax)`;      effortComment = 'Séance soutenue — récupération correcte nécessaire.' }
    else                 { intensityLabel = `intensité très élevée (${fcPct}% FCmax)`; effortComment = 'Séance très intense — à ne pas répéter sans récupération.' }
  } else {
    intensityLabel = 'FC non disponible'
    effortComment = 'Fréquence cardiaque absente — dosage cardio non évaluable.'
  }

  const zones = hrData.length ? computeFcZones(hrData, fcMax) : null
  const z45 = zones ? zones[3] + zones[4] : null

  const lines: string[] = [
    `${distKm.toFixed(2)} km · D+ ${Math.round(activity.total_elevation_gain ?? 0)} m · allure ${fmtPace(activity.distance, activity.moving_time)}.`,
    activity.average_heartrate
      ? `FC moy. ${Math.round(activity.average_heartrate)} bpm · max ${activity.max_heartrate ? Math.round(activity.max_heartrate) + ' bpm' : '—'} · ${intensityLabel}.`
      : `${intensityLabel}.`,
    ...(zones ? [`Zones FC : Z1 ${zones[0]}% · Z2 ${zones[1]}% · Z3 ${zones[2]}% · Z4 ${zones[3]}% · Z5 ${zones[4]}% — ${z45}% en zones hautes.`] : []),
    `Contexte récent : ${runs28.length} sortie${runs28.length !== 1 ? 's' : ''} sur 28 j · ${km28.toFixed(0)} km · D+ ${Math.round(dp28)} m — 7 j : ${runs7.length} sortie${runs7.length !== 1 ? 's' : ''} · ${km7.toFixed(0)} km.`,
    effortComment,
  ]

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="clabel" style={{ marginBottom: 8 }}>LECTURE DE SÉANCE</div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.78rem', lineHeight: 1.75, color: 'var(--vl-text-2)' }}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  )
}

// ─── Débrief de séance (récap vs autres sorties + impact + conseil) ────────────

function SessionDebriefCard({ activity, fcMax, recentRuns }: {
  activity: ActivityDetail
  fcMax: number
  recentRuns: RecentActivity[]
}) {
  const debrief = buildSessionDebrief(activity, recentRuns, fcMax)

  return (
    <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--vl-ember)' }}>
      <div className="clabel" style={{ marginBottom: 8 }}>DÉBRIEF</div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.05rem', lineHeight: 1.25, marginBottom: 10 }}>
        {debrief.headline}
      </div>
      {debrief.comparisons.length > 0 && (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.78rem', lineHeight: 1.7, color: 'var(--vl-text-2)', marginBottom: 10 }}>
          {debrief.comparisons.map((c, i) => <div key={i}>· {c}</div>)}
        </div>
      )}
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--vl-text)', marginBottom: debrief.tip ? 8 : 0 }}>
        {debrief.impact}
      </div>
      {debrief.tip && (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--vl-text-3)', fontStyle: 'italic' }}>
          💡 {debrief.tip}
        </div>
      )}
    </div>
  )
}

// ─── Race context (facteurs de course) ────────────────────────────────────────

function RaceContextCard({ activity, weather }: { activity: ActivityDetail; weather?: WeatherData | null }) {
  const factors: { label: string; value: string; adj: string; color: string }[] = []
  let totalAdj = 0

  // Température — Ely et al. 2007 : +0.5% par °C au-dessus de 15°C
  if (weather?.temp != null) {
    const a = Math.max(0, (weather.temp - 15) * 0.005)
    if (a > 0.001) {
      totalAdj += a
      factors.push({ label: 'Température', value: `${weather.temp.toFixed(1)}°C`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.04 ? 'var(--vl-ember)' : a > 0.02 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
    }
  }

  // Pluie — logarithmique, max 3.5%
  if (weather?.precip != null && weather.precip > 0.5) {
    const a = Math.min(0.035, Math.log1p(weather.precip) * 0.018)
    totalAdj += a
    factors.push({ label: 'Pluie', value: `${weather.precip.toFixed(1)} mm`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.02 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
  }

  // Vent — quadratique (drag ∝ v²), max 4.5%
  if (weather?.wind != null && weather.wind > 5) {
    const a = Math.min(0.045, Math.pow(weather.wind / 30, 2) * 0.04)
    if (a > 0.001) {
      totalAdj += a
      factors.push({ label: 'Vent', value: `${Math.round(weather.wind)} km/h`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.02 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
    }
  }

  const dp = activity.total_elevation_gain ?? 0
  const dk = (activity.distance ?? 1) / 1000
  if (dp > 0 && dk > 0.5) {
    const ga = Math.min(0.45, dp / (dk * 1000) * 5.5)
    totalAdj += ga
    factors.push({ label: 'Dénivelé', value: `+${Math.round(dp)} m`, adj: `+${(ga * 100).toFixed(1)}%`, color: ga > 0.15 ? 'var(--vl-amber)' : 'var(--vl-growth)' })
  }

  const dateStr = activity.start_date_local ?? activity.start_date
  const h = parseInt(dateStr.split('T')[1]?.split(':')[0] ?? '12', 10)
  if (h < 5 || h >= 21) {
    totalAdj += 0.02
    factors.push({ label: 'Nuit', value: `${h}h`, adj: '+2.0%', color: '#8b5cf6' })
  }

  if (['TrailRun', 'Trail Run'].includes(activity.type) || ['TrailRun', 'Trail Run'].includes(activity.sport_type ?? '')) {
    totalAdj += 0.04
    factors.push({ label: 'Trail', value: 'Terrain varié', adj: '+4.0%', color: 'var(--vl-amber)' })
  }

  if (factors.length === 0) return null

  const rawPaceSec = activity.moving_time > 0 && activity.distance > 0
    ? activity.moving_time / (activity.distance / 1000)
    : 0
  const normPaceSec = rawPaceSec > 0 ? rawPaceSec / (1 + totalAdj) : 0
  const paceNorm = normPaceSec > 0
    ? `${Math.floor(normPaceSec / 60)}:${String(Math.round(normPaceSec % 60)).padStart(2, '0')}`
    : '—'

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="clabel" style={{ marginBottom: 10 }}>FACTEURS DE COURSE</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {factors.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--vl-surf-2)', borderRadius: 6, padding: '6px 10px' }}>
            <div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--vl-text-3)' }}>{f.label}</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)' }}>{f.value}</div>
            </div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, fontWeight: 700, color: f.color }}>{f.adj}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Allure contextualisée</span>
        <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', color: 'var(--vl-text-2)', lineHeight: 1 }}>
          {paceNorm}<span style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.6rem', color: 'var(--vl-text-3)', marginLeft: 3 }}>/km</span>
        </span>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)' }}>conditions +{(totalAdj * 100).toFixed(0)}%</span>
      </div>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 7.5, color: 'var(--vl-text-3)', marginTop: 6, fontStyle: 'italic' }}>
        Minetti et al. 2002 · Lejeune et al. 1998
      </div>
    </div>
  )
}

// ─── Athlete profile from streams (port of legacy renderAthleteProfile) ───────

interface VAMData {
  uphillSections: { vam: number; dAlt: number; dist: number; avgHR: number | null }[]
  downhillSections: { speed: number; grade: number }[]
  recoveries: { drop: number; hrAtTop: number; hrAfter60: number }[]
  avgVAM: number | null
  maxVAM: number | null
  avgRecovery: number | null
  avgDownhill: number | null
}

function computeVAMFromStreams(streams: StreamData): VAMData | null {
  const altD = streams.altitude?.data ?? []
  const hrD = streams.heartrate?.data ?? []
  const velD = streams.velocity_smooth?.data ?? []
  const distD = streams.distance?.data ?? []
  const timeD = streams.time?.data ?? []
  if (!altD.length || !velD.length || !timeD.length || timeD.length !== altD.length) return null

  const uphillSections: VAMData['uphillSections'] = []
  const downhillSections: VAMData['downhillSections'] = []
  const recoveries: VAMData['recoveries'] = []
  let inUphill = false
  let uphillStart: { idx: number; alt: number; dist: number; time: number } | null = null
  const WIN = Math.min(30, Math.floor(altD.length / 10))

  for (let i = WIN; i < altD.length - WIN; i++) {
    const elevN = altD[i + WIN] - altD[i]
    const distN = distD[i + WIN] - distD[i]
    const grade = distN > 0 ? (elevN / distN) * 100 : 0

    if (grade > 4 && !inUphill) {
      inUphill = true
      uphillStart = { idx: i, alt: altD[i], dist: distD[i], time: timeD[i] }
    } else if (grade <= 1.5 && inUphill && uphillStart) {
      inUphill = false
      const dAlt = altD[i] - uphillStart.alt
      const dTime = timeD[i] - uphillStart.time
      if (dAlt > 10 && dTime > 0) {
        const vam = Math.round((dAlt / dTime) * 3600)
        const slice = hrD.slice(uphillStart.idx, i)
        const avgHR = slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : null
        uphillSections.push({ vam, dAlt: Math.round(dAlt), dist: Math.round(distD[i] - uphillStart.dist), avgHR })
        if (hrD.length && hrD[i]) {
          const hrAtTop = hrD[i]
          const hrAfter60 = hrD[Math.min(i + 60, hrD.length - 1)] ?? 0
          recoveries.push({ drop: hrAtTop - hrAfter60, hrAtTop, hrAfter60 })
        }
      }
    }
    if (grade < -5) {
      const slice = velD.slice(i, i + 30)
      const avgVel = slice.reduce((a, b) => a + b, 0) / slice.length
      downhillSections.push({ speed: parseFloat((avgVel * 3.6).toFixed(1)), grade: parseFloat(grade.toFixed(1)) })
    }
  }

  if (!uphillSections.length) return null

  const avgDownhillKmh = downhillSections.length
    ? parseFloat((downhillSections.reduce((a, b) => a + b.speed, 0) / downhillSections.length).toFixed(1))
    : null

  return {
    uphillSections,
    downhillSections,
    recoveries,
    avgVAM: uphillSections.length ? Math.round(uphillSections.reduce((a, b) => a + b.vam, 0) / uphillSections.length) : null,
    maxVAM: uphillSections.length ? Math.max(...uphillSections.map(s => s.vam)) : null,
    avgRecovery: recoveries.length ? Math.round(recoveries.reduce((a, b) => a + b.drop, 0) / recoveries.length) : null,
    avgDownhill: avgDownhillKmh,
  }
}

function AthleteProfileCard({ streams }: { streams: StreamData }) {
  const data = computeVAMFromStreams(streams)
  if (!data || !data.uphillSections.length) return null

  const { avgVAM, maxVAM, avgRecovery, avgDownhill, uphillSections } = data

  const vamLevel = maxVAM == null ? null
    : maxVAM > 1000 ? { l: 'Excellent', c: 'var(--vl-growth)' }
    : maxVAM > 700  ? { l: 'Bon',       c: 'var(--vl-growth)' }
    : maxVAM > 400  ? { l: 'Moyen',     c: 'var(--vl-amber)' }
    : { l: 'À développer', c: 'var(--vl-ember)' }

  const recovLevel = avgRecovery == null ? null
    : avgRecovery > 30 ? { l: 'Rapide',    c: 'var(--vl-growth)' }
    : avgRecovery > 20 ? { l: 'Correct',   c: 'var(--vl-growth)' }
    : avgRecovery > 10 ? { l: 'Lent',      c: 'var(--vl-amber)' }
    : { l: 'Très lent', c: 'var(--vl-ember)' }

  // km/h → allure
  const downhillPace = avgDownhill && avgDownhill > 0
    ? fmtPaceFromMps(avgDownhill * 1000 / 3600)
    : null

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>PROFIL ATHLÈTE — SÉANCE</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: '0.75rem' }}>
        {avgVAM != null && vamLevel && (
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, fontWeight: 700, color: vamLevel.c, lineHeight: 1 }}>{avgVAM}</div>
            <div className="slbl" style={{ fontSize: 9 }}>VAM moy. montée</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>{vamLevel.l} · max {maxVAM} m/h</div>
          </div>
        )}
        {avgRecovery != null && recovLevel && (
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, fontWeight: 700, color: recovLevel.c, lineHeight: 1 }}>{avgRecovery}</div>
            <div className="slbl" style={{ fontSize: 9 }}>Récup FC · bpm/min</div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>{recovLevel.l}</div>
          </div>
        )}
        {downhillPace && (
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, fontWeight: 700, color: 'var(--vl-text-2)', lineHeight: 1 }}>{downhillPace}</div>
            <div className="slbl" style={{ fontSize: 9 }}>Allure moy. descente</div>
          </div>
        )}
        {uphillSections.length > 0 && (
          <div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: 22, fontWeight: 700, color: 'var(--vl-text-2)', lineHeight: 1 }}>{uphillSections.length}</div>
            <div className="slbl" style={{ fontSize: 9 }}>Montées analysées</div>
          </div>
        )}
      </div>
      {avgVAM != null && vamLevel && (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '0.72rem', color: 'var(--vl-text-2)', lineHeight: 1.65 }}>
          <strong>Grimpeur :</strong> VAM {avgVAM} m/h —{' '}
          {avgVAM > 700 ? 'niveau trail compétitif.' : avgVAM > 400 ? 'bon niveau trail loisir.' : 'marge de progression en montée.'}
          {avgRecovery != null && recovLevel && (
            <><br /><strong>Récupération cardio :</strong> −{avgRecovery} bpm/min post-montée — {avgRecovery > 25 ? 'excellente capacité.' : avgRecovery > 15 ? 'capacité correcte.' : 'à travailler — programme Récup dans Renfo.'}</>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Streams section (chart + map + VAM) ──────────────────────────────────────

function StreamsSection({ stravaActivityId }: { activityId: string; stravaActivityId: string; fcMax: number }) {
  const [hoverKm, setHoverKm] = useState<number | null>(null)

  const { data: streams, isLoading } = useQuery<StreamData>({
    queryKey: ['activity-streams', stravaActivityId],
    queryFn: () => fetchStreams(stravaActivityId),
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

      {hasLatlng && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="clabel" style={{ marginBottom: '0.5rem' }}>TRACÉ GPS</div>
          <RouteMap latlng={latlng} hoverKm={hoverKm} distArr={dist} />
        </div>
      )}

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

  // Durabilité : découplage allure:FC (perte d'efficacité 2e moitié) sur les sorties longues.
  const decoupling = streams ? computeDecoupling(streams) : null
  const DURABILITY_COLOR: Record<DurabilityStatus, string> = {
    strong: 'var(--vl-growth)', moderate: 'var(--vl-amber)', deficit: 'var(--vl-ember)', unknown: 'var(--vl-text-3)',
  }

  if (!hasHR && insights.length === 0 && !drift && !decoupling) return null

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
        {decoupling != null && (
          <div title="Perte d'efficacité allure:FC entre la 1re et la 2e moitié (< 5 % = bonne durabilité)">
            <div style={{ fontSize: 20, fontWeight: 700, color: DURABILITY_COLOR[decoupling.status] }}>
              {decoupling.decouplingPct > 0 ? '+' : ''}{decoupling.decouplingPct.toFixed(1)}%
            </div>
            <div className="slbl" style={{ fontSize: 10 }}>Durabilité (découplage)</div>
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
        .select('id,strava_activity_id,name,distance,total_elevation_gain,moving_time,elapsed_time,start_date,start_date_local,type,sport_type,average_heartrate,max_heartrate,average_speed,max_speed,suffer_score,kudos_count:raw_data->kudos_count,average_temp:raw_data->average_temp')
        .eq('id', activityId!)
        .single()
      if (error) throw error
      return data as ActivityDetail
    },
    enabled: !!activityId,
  })

  // Contexte pour « Lecture de séance » (28j/7j) et « Débrief » (comparaison 90 j).
  const { data: recentActivities = [] } = useQuery<RecentActivity[]>({
    queryKey: ['recent-activities-context', activity?.start_date],
    queryFn: async () => {
      const actDate = new Date(activity!.start_date)
      const cutoff = new Date(actDate); cutoff.setDate(actDate.getDate() - 90)
      const { data } = await supabase
        .from('strava_activities')
        .select('id,distance,total_elevation_gain,moving_time,start_date,type,sport_type,average_heartrate,average_speed')
        .gte('start_date', cutoff.toISOString().slice(0, 10))
        .lte('start_date', activity!.start_date)
        .order('start_date', { ascending: false })
      return (data ?? []) as RecentActivity[]
    },
    enabled: !!activity,
    staleTime: 10 * 60 * 1000,
  })

  const stravaActivityIdStr = activity?.strava_activity_id != null ? String(activity.strava_activity_id) : undefined

  const { data: streams } = useQuery<StreamData>({
    queryKey: ['activity-streams', stravaActivityIdStr],
    queryFn: () => fetchStreams(stravaActivityIdStr!),
    enabled: !!stravaActivityIdStr,
    staleTime: 30 * 60 * 1000,
  })

  // Météo historique — Open-Meteo (vent/pluie), cachée dans activity_weather pour le profil
  const startLatLng = streams?.latlng?.data?.[0]
  const { data: weather } = useQuery<WeatherData | null>({
    queryKey: ['activity-weather', activityId, startLatLng?.[0]?.toFixed(3), startLatLng?.[1]?.toFixed(3)],
    queryFn: async () => {
      const result = await fetchActivityWeather(startLatLng![0], startLatLng![1], activity!.start_date_local ?? activity!.start_date)
      if (result && activity?.strava_activity_id) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.id) {
          supabase.from('activity_weather').upsert({
            user_id: session.user.id,
            activity_id: Number(activity.strava_activity_id),
            temp: result.temp,
            wind: result.wind,
            precip: result.precip,
            cached_at: new Date().toISOString(),
          }, { onConflict: 'user_id,activity_id' }).then(({ error }) => {
            if (error) console.warn('[VL] weather cache write error:', error.message)
          })
        }
      }
      return result
    },
    enabled: !!startLatLng && !!activity,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
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
  const hrData = streams?.heartrate?.data ?? []

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

      {/* Analyse de séance */}
      <SessionDebriefCard activity={activity} fcMax={fcMax} recentRuns={recentActivities} />
      <FcZonesCard hrData={hrData} fcMax={fcMax} />
      <SessionSummaryCard activity={activity} hrData={hrData} fcMax={fcMax} recentRuns={recentActivities} />
      <RaceContextCard activity={activity} weather={mergeStravaTemp(activity.average_temp, weather ?? null)} />

      {/* Altitude profile + map + VAM sections */}
      {activityId && stravaActivityIdStr && (
        <StreamsSection activityId={activityId} stravaActivityId={stravaActivityIdStr} fcMax={fcMax} />
      )}

      {/* Athlete profile (VAM + recovery) */}
      {streams && <AthleteProfileCard streams={streams} />}

      {/* Session quality */}
      <SessionQCard activity={activity} streams={streams} fcMax={fcMax} />

      {/* Metrics card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="clabel" style={{ marginBottom: '0.75rem' }}>MÉTRIQUES</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'D+/km',       val: `${dpKm.toFixed(0)} m/km` },
            { label: 'Allure max',  val: fmtPaceFromMps(activity.max_speed) },
            { label: 'Temps total', val: activity.elapsed_time ? fmtTime(activity.elapsed_time) : '—' },
            { label: 'FC max',      val: activity.max_heartrate ? `${Math.round(activity.max_heartrate)} bpm` : '—' },
            { label: 'Suffer score', val: activity.suffer_score != null ? String(activity.suffer_score) : '—' },
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
