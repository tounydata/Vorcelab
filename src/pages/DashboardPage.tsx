import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import {
  get4WeekPhase, computeCoPerioWarnings, DUP4_LABELS, DUP4_COLORS,
  type Activity, type SessionLog,
} from '../lib/renfoUtils'
// @ts-ignore
import { FOCUS_META, RENFO_FOCUS_COLORS } from '../../renfo-data.js'
import { fetchStreams } from '../lib/streams'
import {
  computeActivityLoad, computeDailyPMC, getTsbZone, computeACWR, classifySport,
  type ActivityForLoad, type PMCDay,
} from '../lib/trainingLoad'
import { buildRunnerProfile, fetchActivitiesForProfile, saveRunnerProfile } from '../lib/buildRunnerProfile'
import type { RunnerProfileComputed } from '../lib/runnerProfile'

interface Activity2 {
  id: string
  strava_activity_id?: number | string
  name: string
  distance: number
  total_elevation_gain: number
  moving_time: number
  start_date: string
  start_date_local?: string
  type: string
  sport_type?: string
  average_heartrate?: number
  average_speed?: number
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

function formatPaceShort(distM: number, timeS: number): string {
  if (!distM || !timeS) return '—'
  const secPerKm = timeS / (distM / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()
}

function isRunning(type: string) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type)
}

// ─── 7j Bar Chart (SVG) ───────────────────────────────────────────────────────

function Bar7j({ activities, efPct, efLoading }: { activities: Activity2[]; efPct?: number | null; efLoading?: boolean }) {
  const now = new Date()
  const LABELS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const acts = activities.filter((a) => (a.start_date_local ?? a.start_date)?.slice(0, 10) === ds && isRunning(a.type))
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

  // % EF — calculé depuis les vrais streams HR (voir loadAerobicStat legacy)
  const efColor = efPct == null ? 'var(--vl-text-3)' : efPct >= 75 ? 'var(--vl-growth)' : efPct < 50 ? 'var(--vl-ember)' : 'var(--vl-amber)'
  const efLabel = efPct == null ? '' : efPct >= 75 ? 'AÉROBIE' : efPct < 50 ? 'TROP INTENSE' : 'MIXTE'

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
      <div style={{ background: 'var(--vl-surf-2)', borderRadius: 6, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left: % EF */}
        <div>
          <div className="mlabel" style={{ fontSize: 8, margin: 0, letterSpacing: '.1em' }}>% EF · 7J</div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 700, color: efColor, lineHeight: 1, marginTop: 2 }}>
            {efLoading ? '…' : efPct != null ? `${efPct}%` : '—'}
          </div>
          {efLabel && (
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: efColor, marginTop: 2, fontWeight: 700 }}>
              {efLabel}
            </div>
          )}
        </div>
        {/* Right: D+ total */}
        {totalDp > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div className="mlabel" style={{ fontSize: 8, margin: 0, letterSpacing: '.1em' }}>D+ TOTAL</div>
            <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--vl-growth)', lineHeight: 1, marginTop: 2 }}>
              {Math.round(totalDp)}
            </div>
            <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>m</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Statut d'entraînement (PMC : Fitness / Fatigue / Forme) ───────────────────

// Catmull-Rom spline (tension 0.18) — pour la ligne CTL
function chargeSpline(pts: { x: number; y: number }[], maxY: number): string {
  if (pts.length < 2) return `M${pts[0]?.x ?? 0},${pts[0]?.y ?? maxY}`
  const cl = (v: number) => Math.max(0, Math.min(maxY, v))
  let path = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  const t = 0.18
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    path += ` C${(p1.x + (p2.x - p0.x) * t).toFixed(1)},${cl(p1.y + (p2.y - p0.y) * t).toFixed(1)} ${(p2.x - (p3.x - p1.x) * t).toFixed(1)},${cl(p2.y - (p3.y - p1.y) * t).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return path
}

// ─── Statut multi-facteurs (ACWR + tendance CTL + tendance EF) ───────────────
// Source : Gabbett 2016 (ACWR) · Seiler 2010 (EF comme proxy VO₂)

function computeMultiStatus(
  pmc: PMCDay[],
  acwr: ReturnType<typeof computeACWR>,
  activities: Activity2[],
  fcMax: number,
): { label: string; sub: string; color: string; key: string } {
  const today = pmc[pmc.length - 1]
  if (!today || today.calibrating) {
    return { label: 'CALIBRAGE', sub: "construction de l'historique (≥ 28 j)", color: 'var(--vl-text-3)', key: 'calibrage' }
  }

  const ratio = acwr.ratio

  // Tendance CTL sur 28j
  const idx28 = Math.max(0, pmc.length - 29)
  const ctlTrendPct = pmc[idx28].ctl > 0 ? (today.ctl - pmc[idx28].ctl) / pmc[idx28].ctl : 0

  // Tendance EF (Efficiency Factor = vitesse / FC) sur 21j vs 21j précédents
  const now = Date.now()
  const hasHR = (a: Activity2) => isRunning(a.type) && a.average_heartrate && a.average_speed
  const recentRuns = activities.filter(a => hasHR(a) && Date.now() - new Date(a.start_date).getTime() < 21 * 86400000)
  const baseRuns = activities.filter(a => {
    const age = now - new Date(a.start_date).getTime()
    return hasHR(a) && age >= 21 * 86400000 && age < 42 * 86400000
  })
  const efOf = (arr: Activity2[]) => arr.length >= 2
    ? arr.reduce((s, a) => s + (a.average_speed! / a.average_heartrate!), 0) / arr.length
    : null
  const efRecent = efOf(recentRuns)
  const efBase = efOf(baseRuns)
  const efTrend = efRecent != null && efBase != null && efBase > 0 ? (efRecent - efBase) / efBase : null

  // Table de décision — priorité décroissante
  if (ratio != null && ratio > 1.5)
    return { label: 'SURMENAGE', sub: 'pic de charge — risque de blessure', color: '#EF4444', key: 'surmenage' }
  if (ratio != null && ratio < 0.8) {
    if (ctlTrendPct < -0.05)
      return { label: 'DÉSENTRAÎNEMENT', sub: 'charge faible + fitness en baisse', color: '#F97316', key: 'desentrainement' }
    if (today.ctl > 40 && (efTrend == null || efTrend >= 0))
      return { label: 'PIC', sub: 'affûtage — forme optimale', color: '#34D399', key: 'pic' }
    return { label: 'RÉCUPÉRATION', sub: 'repos voulu — charge légère', color: '#3B82F6', key: 'recuperation' }
  }
  if (efTrend != null && efTrend < -0.05 && ctlTrendPct <= 0.03)
    return { label: 'IMPRODUCTIF', sub: 'charge sans progression cardio', color: '#EAB308', key: 'improductif' }
  if (ctlTrendPct > 0.05 && (efTrend == null || efTrend >= -0.03))
    return { label: 'PRODUCTIF', sub: 'tu progresses', color: '#22C55E', key: 'productif' }
  return { label: 'MAINTIEN', sub: 'forme stable', color: '#EAB308', key: 'maintien' }
}

function TrainingStatusCard({ activities, renfoLogs, fcMax }: { activities: Activity2[]; renfoLogs: SessionLog[]; fcMax?: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const DISPLAY = 42

  const renfoActs: ActivityForLoad[] = renfoLogs
    .filter((r) => r.session_date)
    .map((r) => {
      const f = r.focus ?? ''
      const sport = f.includes('yoga') || f.includes('stretching') ? 'Yoga' : f.includes('pilates') ? 'Pilates' : 'WeightTraining'
      return { start_date: r.session_date! + 'T12:00:00', type: sport, sport_type: sport, moving_time: (r.duration_min ?? 40) * 60 }
    })
  const combined: ActivityForLoad[] = [...activities, ...renfoActs]

  const pmc = computeDailyPMC(combined, fcMax, { totalDays: 90, displayDays: DISPLAY })
  if (pmc.length === 0) return null
  const hasData = pmc.some((d) => d.totalLoad > 0) || pmc.some((d) => d.ctl > 0)
  if (!hasData) return null

  const dateIdx: Record<string, number> = {}
  pmc.forEach((d, i) => { dateIdx[d.date] = i })
  type Seg = { color: string; label: string; load: number }
  const segByDay: Record<number, Record<string, Seg>> = {}
  for (const a of combined) {
    const ds = (a.start_date || '').slice(0, 10)
    const i = dateIdx[ds]
    if (i === undefined) continue
    const load = computeActivityLoad(a, fcMax)
    if (load <= 0) continue
    const info = classifySport(a.type, a.sport_type)
    segByDay[i] ??= {}
    const e = (segByDay[i][info.label] ??= { color: info.color, label: info.label, load: 0 })
    e.load += load
  }
  const daySegs: Seg[][] = pmc.map((_, i) => Object.values(segByDay[i] ?? {}).sort((a, b) => b.load - a.load))

  const today = pmc[pmc.length - 1]
  const acwr = computeACWR(pmc)
  const status = computeMultiStatus(pmc, acwr, activities, fcMax ?? 185)

  const maxAxis = Math.max(1, ...pmc.map((d) => d.totalLoad)) * 1.1
  const VW = 420, H = 96, W_COL = VW / DISPLAY
  const GAP = 2.4, BAR_W = W_COL - GAP

  const fmtD = (ds: string) => new Date(ds + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  const labelIdx = [0, 14, 28, DISPLAY - 1]

  const hovered = hover != null ? pmc[hover] : null

  return (
    <div className="card" style={{ marginBottom: '1.5rem', padding: '14px 16px', overflow: 'hidden' }}>
      <div className="clabel" style={{ margin: '0 0 10px' }}>Statut d'entraînement</div>

      {/* ── Badge ÉTAT DU JOUR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        background: `color-mix(in srgb, ${status.color} 12%, transparent)`,
        borderLeft: `4px solid ${status.color}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.5rem', fontWeight: 800, color: status.color, lineHeight: 1, letterSpacing: '.01em' }}>
            {status.label}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9.5, color: 'var(--vl-text-2)', marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
            {status.sub}
          </div>
        </div>
        {/* TSB — fraîcheur seulement, sans label "risque blessure" */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--vl-text-2)', lineHeight: 1 }}>
            {today.tsb > 0 ? `+${today.tsb}` : today.tsb}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>FRAÎCHEUR</div>
        </div>
      </div>

      {/* ── Graphe 42 j : fond TSB + barres par sport (pas de courbe CTL) ── */}
      <div onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
          {pmc.map((d, i) => (
            <rect key={`bg${i}`} x={i * W_COL} y={0} width={W_COL} height={H}
              fill={getTsbZone(d.tsb).color} opacity={0.08} />
          ))}
          {[7, 14, 21, 28, 35].map((d) => (
            <line key={d} x1={(d * W_COL).toFixed(1)} y1={0} x2={(d * W_COL).toFixed(1)} y2={H}
              stroke="var(--vl-line)" strokeWidth={0.5} opacity={0.4} />
          ))}
          {pmc.map((_, i) => {
            let yTop = H
            const dim = hover != null && hover !== i ? 0.35 : 1
            return (
              <g key={`bar${i}`} opacity={dim}>
                {daySegs[i].map((seg, j) => {
                  const bh = (seg.load / maxAxis) * H
                  yTop -= bh
                  return <rect key={j} x={i * W_COL + GAP / 2} y={yTop} width={BAR_W} height={bh} fill={seg.color} rx={1} />
                })}
              </g>
            )
          })}
          {pmc.map((_, i) => (
            <rect key={`ov${i}`} x={i * W_COL} y={0} width={W_COL} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} style={{ cursor: 'crosshair' }} />
          ))}
        </svg>
      </div>

      {/* ── Info strip survol (sous le graphe, ne bloque jamais la vue) ── */}
      <div style={{ minHeight: 32, marginTop: 4, padding: '4px 0' }}>
        {hovered ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, color: 'var(--vl-text-2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {fmtD(hovered.date)}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: getTsbZone(hovered.tsb).color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, color: 'var(--vl-text-3)' }}>
              Fraîcheur {hovered.tsb > 0 ? `+${hovered.tsb}` : hovered.tsb}
            </span>
            {daySegs[hover!].length === 0 ? (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, color: 'var(--vl-text-3)' }}>Repos</span>
            ) : daySegs[hover!].map((seg, j) => (
              <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--vl-mono)', fontSize: 8.5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: seg.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: 'var(--vl-text-2)' }}>{seg.label}</span>
                <span style={{ color: 'var(--vl-text)', fontWeight: 700 }}>{Math.round(seg.load)}</span>
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)' }}>
            Survoler le graphe pour le détail jour par jour
          </span>
        )}
      </div>

      {/* Repères dates */}
      <div style={{ position: 'relative', height: 12, marginTop: 2 }}>
        {labelIdx.map((i) => (
          <span key={i} style={{
            position: 'absolute', left: `${((i + 0.5) / DISPLAY) * 100}%`, transform: 'translateX(-50%)',
            fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', whiteSpace: 'nowrap',
          }}>
            {i === DISPLAY - 1 ? 'auj.' : new Date(pmc[i].date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        ))}
      </div>

      {/* ── Jauge ACWR ── */}
      <div style={{ marginTop: 12 }}>
        <div style={{ position: 'relative', height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 0.3, background: '#3B82F6', opacity: 0.55 }} />
          <div style={{ flex: 0.5, background: '#22C55E', opacity: 0.55 }} />
          <div style={{ flex: 0.2, background: '#F97316', opacity: 0.55 }} />
          <div style={{ flex: 0.5, background: '#EF4444', opacity: 0.55 }} />
          {acwr.ratio != null && (
            <div style={{ position: 'absolute', top: -2, left: `${acwr.pct}%`, transform: 'translateX(-50%)', width: 3, height: 12, background: 'var(--vl-text)', borderRadius: 2, boxShadow: '0 0 0 1.5px var(--vl-surf)' }} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, color: 'var(--vl-text-3)' }}>ÉQUILIBRE CHARGE (ACWR)</span>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, color: acwr.color }}>
            {acwr.ratio != null ? `${acwr.ratio.toFixed(2)} · ${acwr.label}` : 'calibrage en cours'}
          </span>
        </div>
      </div>
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
              {/* Countdown */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column' }}>
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
        .select('id,strava_activity_id,name,distance,total_elevation_gain,moving_time,start_date,start_date_local,type,sport_type,average_heartrate,average_speed')
        .order('start_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as Activity2[]
    },
  })

  const { data: renfoLogs = [] } = useQuery<SessionLog[]>({
    queryKey: ['renfo-session-logs-dashboard'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 95 * 86_400_000).toISOString().slice(0, 10)
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

  // Activités sur 100 j pour le PMC (Fitness/Fatigue/Forme) — fiabilise le CTL
  const { data: pmcActs = [] } = useQuery<Activity2[]>({
    queryKey: ['pmc-activities'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('strava_activities')
        .select('id,name,distance,total_elevation_gain,moving_time,start_date,start_date_local,type,sport_type,average_heartrate,average_speed')
        .gte('start_date', cutoff)
        .order('start_date', { ascending: false })
      return (data ?? []) as Activity2[]
    },
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

  const { data: profileData, refetch: refetchProfile } = useQuery<{ fc_max?: number; runner_profile?: RunnerProfileComputed | null } | null>({
    queryKey: ['profile-fcmax-dash', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase.from('profiles').select('fc_max,runner_profile').eq('id', user.id).single()
      return data as { fc_max?: number; runner_profile?: RunnerProfileComputed | null } | null
    },
    enabled: !!user,
  })
  const fcMax = profileData?.fc_max

  // Silent background recompute when:
  //   a) latest activity is newer than last profile computation, OR
  //   b) streamCoverage < 0.01 (old profile computed without streams — stale data)
  const profileTriggeredRef = useRef(false)
  useEffect(() => {
    if (!user || !activities.length || profileTriggeredRef.current) return
    const latestActivityDate = activities[0].start_date
    const computedAt = profileData?.runner_profile?._computedAt
    const streamCoverage = profileData?.runner_profile?.streamCoverage ?? 0
    const needsRecompute =
      !computedAt ||
      new Date(latestActivityDate) > new Date(computedAt) ||
      streamCoverage < 0.01
    if (!needsRecompute) return

    profileTriggeredRef.current = true
    ;(async () => {
      try {
        const acts = await fetchActivitiesForProfile(user.id, 50)
        const rp = await buildRunnerProfile(acts, profileData?.fc_max ?? 185)
        await saveRunnerProfile(user.id, rp)
        await refetchProfile()
      } catch (e) {
        console.warn('[VL] background profile recompute failed:', e)
        profileTriggeredRef.current = false
      }
    })()
  }, [user?.id, activities[0]?.start_date, profileData?.runner_profile?._computedAt])

  const now = new Date()

  // Précompute les IDs des runs 7j pour la query EF (stable key pour TanStack)
  const ef7jCutoffStr = (() => {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const runs7jIds = activities
    .filter((a) => isRunning(a.type) && (a.start_date_local ?? a.start_date)?.slice(0, 10) >= ef7jCutoffStr)
    .map((a) => a.id)

  // % EF réel depuis les streams HR — port exact de loadAerobicStat (dashboard-activities.js)
  const { data: efData, isLoading: efLoading } = useQuery({
    queryKey: ['ef-7j', runs7jIds, fcMax ?? 185],
    queryFn: async () => {
      const threshold = (fcMax ?? 185) * 0.75
      const runs = activities.filter((a) => isRunning(a.type) && runs7jIds.includes(a.id))
      let totalPts = 0, aerobicPts = 0, authError = false
      await Promise.all(runs.map(async (a) => {
        try {
          const streams = await fetchStreams(String(a.strava_activity_id ?? a.id))
          if (streams._authError) { authError = true; return }
          const hr = streams.heartrate?.data
          if (!hr?.length) return
          totalPts   += hr.length
          aerobicPts += hr.filter((v) => v < threshold).length
        } catch { /* ignore */ }
      }))
      if (authError && totalPts === 0) return { pct: null as number | null, authError: true }
      if (totalPts === 0)            return { pct: null as number | null, authError: false }
      return { pct: Math.round(aerobicPts / totalPts * 100), authError: false }
    },
    enabled: runs7jIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const runs = activities.filter((a) => isRunning(a.type))
  const monthRuns = runs.filter((a) => new Date(a.start_date) >= startOfMonth)

  const kmMonth = monthRuns.reduce((s, a) => s + a.distance, 0)
  const elevMonth = monthRuns.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)

  // Prev month delta
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const prevMonthRuns = runs.filter((a) => {
    const d = new Date(a.start_date)
    return d >= prevMonthStart && d <= prevMonthEnd
  })
  const kmPrevMonth = prevMonthRuns.reduce((s, a) => s + a.distance, 0)
  const deltaKmPct = kmPrevMonth > 0 ? Math.round(((kmMonth - kmPrevMonth) / kmPrevMonth) * 100) : null

  // Renfo sessions ce mois
  const monthCutoffStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const renfoMonthCount = [...new Set(renfoLogs.filter((r) => r.session_date && r.session_date >= monthCutoffStr).map((r) => r.session_date))].length

  const recent = runs.slice(0, 4)

  // Renfo count this week
  const weekCutoff = new Date(now)
  weekCutoff.setDate(now.getDate() - 7)
  const weekCutoffStr = weekCutoff.toISOString().slice(0, 10)
  const renfoWeekCount = [...new Set(renfoLogs.filter((r) => r.session_date && r.session_date >= weekCutoffStr).map((r) => r.session_date))].length

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
        <div className="dash-grid">

          {/* ── COLONNE GAUCHE 60% : course → charge 28j → renfo ── */}
          <div className="dash-col">

            {/* Prochaine course */}
            {nextRace && <NextRaceWidget race={nextRace} />}

            {/* Statut d'entraînement (PMC) */}
            <TrainingStatusCard activities={pmcActs} renfoLogs={renfoLogs} fcMax={fcMax} />

            {/* Renfo */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div className="mlabel" style={{ margin: 0, color: '#a78bfa', letterSpacing: '.14em' }}>
                  RENFO · LIBRE · {renfoWeekCount}/{3} SEM.
                </div>
                <Link to="/renfo" style={{ textDecoration: 'none' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-ember)', fontSize: 9, letterSpacing: '.1em' }}>VOIR RENFO →</div>
                </Link>
              </div>
              <div className="mlabel" style={{ fontSize: 9, color: DUP4_COLORS[phase], marginBottom: '0.75rem', marginTop: 2 }}>
                {DUP4_LABELS[phase]}
              </div>
              {warnings.length > 0 && (
                <div style={{ marginBottom: '0.75rem', padding: '6px 10px', borderLeft: `3px solid ${warnings[0].severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)'}` }}>
                  <div className="mlabel" style={{ color: warnings[0].severity === 'alert' ? 'var(--vl-ember)' : 'var(--vl-amber)', textTransform: 'none', letterSpacing: 0, fontSize: '0.8rem' }}>
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
                    <Link key={focus} to={`/renfo/session/${focus}`} style={{ textDecoration: 'none' }}>
                      <div style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid var(--vl-line)`, borderLeft: `3px solid ${color}`, opacity: isAvoided ? 0.4 : 1, background: 'var(--vl-card)' }}>
                        {isPref && <div className="mlabel" style={{ color, fontSize: '0.7rem', marginBottom: 2 }}>★</div>}
                        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.8rem', color, lineHeight: 1.2 }}>{meta.label}</div>
                        <div className="mlabel" style={{ fontSize: '0.7rem', color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
                          {lastDate ? fmtLastDate(lastDate) : `${meta.duration_min} min`}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

          </div>

          {/* ── COLONNE DROITE 40% : graphique 7j → stats mois + activités ── */}
          <div className="dash-col">

            {/* 7j bar chart */}
            {runs.length > 0 && <Bar7j activities={activities} efPct={efData?.pct} efLoading={efLoading} />}

            {/* CE MOIS + DERNIÈRES SORTIES */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div className="clabel" style={{ margin: 0 }}>CE MOIS</div>
                <Link to="/activities" style={{ textDecoration: 'none' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-ember)', fontSize: 9, letterSpacing: '.1em' }}>VOIR TOUT →</div>
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1 }}>{(kmMonth / 1000).toFixed(1)}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>km COURSE</div>
                  {deltaKmPct != null && (
                    <div style={{ display: 'inline-block', marginTop: 4, background: 'var(--vl-surf-2)', borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--vl-mono)', fontSize: 8, color: deltaKmPct >= 0 ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                      {deltaKmPct >= 0 ? '+' : ''}{deltaKmPct}% · vs M-1
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-growth)', lineHeight: 1 }}>{Math.round(elevMonth)}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>m D+</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{renfoMonthCount}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', marginTop: 2 }}>sess. RENFO</div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--vl-line)', margin: '0.75rem 0' }} />
              <div className="clabel" style={{ margin: '0 0 0.75rem' }}>DERNIÈRES SORTIES</div>
              {recent.length === 0 ? (
                <div className="mlabel">Aucune activité enregistrée</div>
              ) : (
                <div className="acts-grid">
                  {recent.map((a) => (
                    <NavLink key={a.id} to={`/activities/${a.id}`} className="act-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="act-name" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{a.name}</div>
                        <div className="act-meta">
                          {(a.distance / 1000).toFixed(1)} km · {formatTime(a.moving_time)} · D+ {Math.round(a.total_elevation_gain ?? 0)}m{a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1 }}>
                          {formatPaceShort(a.distance, a.moving_time)}
                        </div>
                        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
                          /KM · {formatDateShort(a.start_date)}
                        </div>
                        <span className="act-badge">{a.sport_type === 'TrailRun' ? 'Trail' : a.type}</span>
                      </div>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  )
}
