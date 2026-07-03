import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { syncStravaRenfo } from '../lib/syncStravaRenfo'
import { type SessionLog } from '../lib/renfoUtils'
import {
  computeActivityLoad, computeDailyPMC, getTsbZone, computeACWR, classifySport,
  type ActivityForLoad, type PMCDay,
} from '../lib/trainingLoad'
import { buildRunnerProfile, fetchActivitiesForProfile, saveRunnerProfile } from '../lib/buildRunnerProfile'
import CoachCard from '../components/CoachCard'
import ProUpgradeCard from '../components/ProUpgradeCard'
import { useRaceProjection } from '../lib/useRaceProjection'
import { fmtRaceTimeS } from '../lib/raceStrategyView'
import type { RunnerProfileComputed } from '../lib/runnerProfile'
import BrandedLoader from '../components/BrandedLoader'

interface SessionLog2 extends SessionLog {
  source?: string | null
}

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
  /** Date du calcul — la projection affichée ici est un instantané synchronisé
   *  par la page Stratégie ; on l'affiche pour ne jamais présenter un chiffre
   *  périmé comme actuel (écarts Dashboard vs Stratégie). */
  computedAt?: string
}

interface NextRace {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  goal_time: string | null
  start_time?: string | null
  gpx_data: { lat: number; lon: number; ele: number }[] | null
  last_projection: LastProjection | null
  surfaces?: unknown | null
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

function formatPaceShort(distM: number, timeS: number): string {
  if (!distM || !timeS) return '—'
  const secPerKm = Math.round(timeS / (distM / 1000))
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()
}

function isRunning(type: string) {
  return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type)
}

// ─── Statut multi-facteurs (ACWR + tendance CTL + tendance EF) ───────────────
// Source : Gabbett 2016 (ACWR) · Seiler 2010 (EF comme proxy VO₂)

function computeMultiStatus(
  pmc: PMCDay[],
  acwr: ReturnType<typeof computeACWR>,
  activities: Activity2[],
  _fcMax: number,
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

  // Surcharge : on distingue un PIC ponctuel (une seule grosse séance) d'un vrai
  // SURMENAGE. On compte les JOURS de SÉANCE RÉELLE à forte charge (load du jour
  // > 1.3× le CTL) sur les 7 derniers jours — et non les jours où le ratio lissé
  // reste haut : l'ATL (τ=7j) décroît lentement, donc UNE seule grosse sortie
  // maintient atl/ctl>1.5 plusieurs jours d'affilée et serait lue à tort comme une
  // surcharge « prolongée ». Comme Garmin, un gros effort isolé = « charge élevée »
  // (informatif), pas une alerte ; le SURMENAGE exige un vrai cumul de séances dures.
  const hardDays = pmc.slice(-7).filter((d) => d.ctl > 0 && d.totalLoad > 1.3 * d.ctl).length

  // Table de décision — priorité décroissante
  if (ratio != null && ratio > 1.5) {
    if (hardDays >= 3)
      return { label: 'SURMENAGE', sub: 'charge élevée prolongée — pense à récupérer', color: 'var(--vl-status-over)', key: 'surmenage' }
    return { label: 'CHARGE ÉLEVÉE', sub: 'pic ponctuel — récupération conseillée', color: 'var(--vl-status-load)', key: 'charge_elevee' }
  }
  if (ratio != null && ratio < 0.8) {
    if (ctlTrendPct < -0.05)
      return { label: 'DÉSENTRAÎNEMENT', sub: 'charge faible + fitness en baisse', color: 'var(--vl-status-load)', key: 'desentrainement' }
    if (today.ctl > 40 && (efTrend == null || efTrend >= 0))
      return { label: 'PIC', sub: 'affûtage — forme optimale', color: 'var(--vl-status-peak)', key: 'pic' }
    return { label: 'RÉCUPÉRATION', sub: 'repos voulu — charge légère', color: 'var(--vl-status-rest)', key: 'recuperation' }
  }
  if (efTrend != null && efTrend < -0.05 && ctlTrendPct <= 0.03)
    return { label: 'IMPRODUCTIF', sub: 'charge sans progression cardio', color: 'var(--vl-status-watch)', key: 'improductif' }
  if (ctlTrendPct > 0.05 && (efTrend == null || efTrend >= -0.03))
    return { label: 'PRODUCTIF', sub: 'tu progresses', color: 'var(--vl-status-prod)', key: 'productif' }
  return { label: 'MAINTIEN', sub: 'forme stable', color: 'var(--vl-status-watch)', key: 'maintien' }
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

  // ── État parlant (sans sigle) pour le triad ──
  const formeWord = today.ctl > 55 ? 'Solide' : today.ctl >= 35 ? 'Correcte' : 'À construire'
  const fatigueWord = today.ctl > 0 && today.atl > today.ctl * 1.15 ? 'Élevée'
    : today.ctl > 0 && today.atl < today.ctl * 0.85 ? 'Basse' : 'Modérée'
  const fatigueColor = fatigueWord === 'Élevée' ? 'var(--vl-status-load)'
    : fatigueWord === 'Basse' ? 'var(--vl-status-prod)' : 'var(--vl-amber)'
  const equil = acwr.ratio == null ? { word: '—', color: 'var(--vl-text-3)' }
    : acwr.ratio < 0.8 ? { word: 'Léger', color: 'var(--vl-status-rest)' }
    : acwr.ratio <= 1.3 ? { word: 'Optimal', color: 'var(--vl-status-prod)' }
    : acwr.ratio <= 1.5 ? { word: 'Soutenu', color: 'var(--vl-status-watch)' }
    : { word: 'Élevé', color: 'var(--vl-status-over)' }

  return (
    <div data-tour="dash-state" className="card" style={{ marginBottom: '1.5rem', padding: '14px 16px', overflow: 'hidden' }}>
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
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>
            {status.sub}
          </div>
        </div>
        {/* TSB — fraîcheur seulement, sans label "risque blessure" */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800,
            color: today.tsb > 10 ? 'var(--vl-status-peak)' : today.tsb > 0 ? 'var(--vl-status-prod)' : today.tsb > -10 ? 'var(--vl-amber)' : 'var(--vl-status-over)',
            lineHeight: 1 }}>
            {today.tsb > 0 ? `+${today.tsb}` : today.tsb}
          </div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>
            FRAÎCHEUR{' '}
            <span
              title="Forme - Fatigue. Positif = tu es frais et reposé. Négatif = tu es chargé. Entre -10 et +10 : zone optimale de performance."
              style={{ cursor: 'help', opacity: .7, fontSize: 9 }}
            >?</span>
          </div>
        </div>
      </div>

      {/* ── Triad parlant : libellé clair + état (chiffre brut en secondaire) ── */}
      <div className="dash-triad" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>
            FORME{' '}
            <span title="Fitness aérobie accumulé (CTL). Se construit sur 42 jours. Solide = bonne base d'endurance." style={{ cursor: 'help', opacity: .7, fontSize: 9 }}>?</span>
          </div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--vl-status-prod)', lineHeight: 1.05, marginTop: 3 }}>{formeWord}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 3 }}>fond {today.ctl}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>
            FATIGUE{' '}
            <span title="Charge récente (ATL sur 7 jours). Élevée après une grosse semaine — normal. Basse = tu es reposé." style={{ cursor: 'help', opacity: .7, fontSize: 9 }}>?</span>
          </div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, color: fatigueColor, lineHeight: 1.05, marginTop: 3 }}>{fatigueWord}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 3 }}>récente {today.atl}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', letterSpacing: '.1em' }}>
            ÉQUILIBRE{' '}
            <span title="Ratio charge récente / charge chronique (ACWR). Optimal entre 0.8 et 1.3. Au-dessus de 1.5 : risque de blessure si ça dure." style={{ cursor: 'help', opacity: .7, fontSize: 9 }}>?</span>
          </div>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.3rem', fontWeight: 800, color: equil.color, lineHeight: 1.05, marginTop: 3 }}>{equil.word}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 3 }}>{acwr.ratio != null ? `charge ×${acwr.ratio.toFixed(2)}` : 'calibrage'}</div>
        </div>
      </div>

      {/* ── Info survol AU-DESSUS du graphe ── */}
      <div style={{ minHeight: 22, marginBottom: 5 }}>
        {hover != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', fontWeight: 700, letterSpacing: '.06em' }}>
              {fmtD(pmc[hover].date)}
            </span>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: getTsbZone(pmc[hover].tsb).color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
              Fraîcheur {pmc[hover].tsb > 0 ? `+${pmc[hover].tsb}` : pmc[hover].tsb}
            </span>
            {daySegs[hover].length === 0 ? (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>Repos</span>
            ) : daySegs[hover].map((seg, j) => (
              <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--vl-mono)', fontSize: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: seg.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ color: 'var(--vl-text-2)' }}>{seg.label}</span>
                <span style={{ color: 'var(--vl-text)', fontWeight: 700 }}>{Math.round(seg.load)}</span>
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
            Survoler pour le détail jour par jour
          </span>
        )}
      </div>

      {/* ── Graphe 42 j : fond TSB + barres par sport ── */}
      <div onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
          {/* Fond uniforme à la couleur du STATUT du jour (cohérent avec le badge) :
              évite un fond rouge « surcharge » sous un badge vert « productif ». */}
          {pmc.map((_, i) => (
            <rect key={`bg${i}`} x={i * W_COL} y={0} width={W_COL} height={H}
              fill={status.color} opacity={0.05} />
          ))}
          {[7, 14, 21, 28, 35].map((d) => (
            <line key={d} x1={(d * W_COL).toFixed(1)} y1={0} x2={(d * W_COL).toFixed(1)} y2={H}
              stroke="var(--vl-line)" strokeWidth={0.5} opacity={0.4} />
          ))}
          {pmc.map((_, i) => {
            let yTop = H
            const dim = hover != null && hover !== i ? 0.35 : 1
            return (
              <g key={`bar${i}`} opacity={dim} className="vl-bar-up" style={{ animationDelay: `${i * 14}ms` }}>
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

      {/* Repères dates */}
      <div style={{ position: 'relative', height: 12, marginTop: 4 }}>
        {labelIdx.map((i) => (
          <span key={i} style={{
            position: 'absolute', left: `${((i + 0.5) / DISPLAY) * 100}%`, transform: 'translateX(-50%)',
            fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', whiteSpace: 'nowrap',
          }}>
            {i === DISPLAY - 1 ? 'auj.' : new Date(pmc[i].date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        ))}
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
      <polyline points={tracePts} fill="none" stroke="var(--vl-ember)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} className="vl-drawline" style={{ animationDuration: '2s', animationDelay: '.25s' }} />
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
        <path d={`${pathD} L${W},${H} L0,${H} Z`} fill="url(#altiG)"
          className="vl-fadein" style={{ animationDelay: '.75s' }} />
        <path d={pathD} fill="none" stroke="var(--vl-ember)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75}
          pathLength={1} className="vl-drawline" style={{ animationDuration: '1.3s' }} />
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

  // Projection LIVE — même pipeline que la page Stratégie (hook partagé) :
  // plus jamais d'écart Dashboard vs Stratégie. Le snapshot daté ne sert que
  // de secours le temps du calcul (ou sans GPX).
  const live = useRaceProjection(race)
  // En live on garde les secondes BRUTES (pas d'arrondi prématuré) : formatées par
  // le même fmtRaceTimeS que la page Stratégie, sur les mêmes champs (estTimeS,
  // timeMax, timeMin) → le dashboard affiche rigoureusement le même temps.
  const proj: LastProjection | null = live
    ? { cible: live.estTimeS, prudent: live.timeMax, agressif: live.timeMin, confidence: live.confidence }
    : race.last_projection
  const isSnapshot = !live && !!race.last_projection

  const confColor = proj
    ? proj.confidence === 'good' ? 'var(--color-victory)' : proj.confidence === 'medium' ? 'var(--vl-amber)' : 'var(--vl-ember)'
    : ''
  const confFilled = proj
    ? proj.confidence === 'good' ? 5 : proj.confidence === 'medium' ? 3 : 1
    : 0

  return (
    <Link to={`/race/${race.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div data-tour="dash-race" className="card" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
        {/* clickable wrapper */}
        <div style={{ position: 'relative', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Header label */}
          <div style={{ position: 'relative', padding: '10px 14px 0', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '.16em', color: 'var(--vl-text-3)', textTransform: 'uppercase' }}>
              STRATÉGIE DE COURSE
            </span>
          </div>

          {/* Two-column body */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

            {/* LEFT column — tracé GPX en fond, sous le titre */}
            <div style={{ position: 'relative', flex: 1.1, padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              {gpxPts && (
                /* bottom: laisse respirer le bouton « Ouvrir la stratégie » — sinon le tracé passe dessous */
                <div style={{ position: 'absolute', top: 4, left: 0, right: 0, bottom: 72, zIndex: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                  <GpxTrace gpxData={gpxPts} />
                </div>
              )}
              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)', letterSpacing: '.18em', textTransform: 'uppercase', marginBottom: 4 }}>
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
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', textTransform: 'uppercase', letterSpacing: '.16em', marginTop: 4 }}>
                  JOURS
                </div>
                <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '10px', color: phase.color, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, marginTop: 4, marginBottom: 12 }}>
                  {phase.label}
                </div>
                <div style={{ background: 'var(--vl-ember)', color: 'var(--vl-ink)', borderRadius: 'var(--vl-r-sm)', padding: '9px 14px', fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700, letterSpacing: '.08em', textAlign: 'center', userSelect: 'none' }}>
                  OUVRIR LA STRATÉGIE →
                </div>
              </div>
              </div>
            </div>

            {/* RIGHT column */}
            <div style={{ width: '44%', borderLeft: '1px solid var(--vl-line-2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
              {/* Projection block */}
              {proj && (
                <div style={{ padding: '12px 12px 8px', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '10px', color: 'var(--vl-text-2)', letterSpacing: '.16em', marginBottom: 5, textTransform: 'uppercase', fontWeight: 700 }}>
                    PROJECTION VORCELAB
                    {isSnapshot && race.last_projection?.computedAt && (
                      <span style={{ color: 'var(--vl-text-3)', fontWeight: 400, letterSpacing: '.06em', textTransform: 'none' }}>
                        {' '}· du {new Date(race.last_projection.computedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: 'clamp(2.2rem,4vw,3rem)', fontWeight: 800, color: 'var(--color-victory)', letterSpacing: '-.03em', lineHeight: 0.82 }}>
                    {fmtRaceTimeS(proj.cible)}
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
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
                        PRUDENT <span style={{ color: 'var(--vl-text-2)' }}>{fmtRaceTimeS(proj.prudent)}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--color-victory)', fontWeight: 700 }}>
                        CIBLE {fmtRaceTimeS(proj.cible)}
                      </span>
                      <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
                        AGRESSIF <span style={{ color: 'var(--vl-text-2)' }}>{fmtRaceTimeS(proj.agressif)}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* Spacer pour pousser l'altimétrie en bas (le tracé GPX est passé à gauche) */}
              {gpxPts && <div style={{ flex: 1, minHeight: 12 }} />}
              {/* Mini altimetry at bottom */}
              {gpxPts && <MiniAlti gpxData={gpxPts} />}
            </div>

          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Dashboard réorganisable : l'ordre des sections appartient à l'utilisateur ──
const DASH_SECTIONS = ['race', 'coach', 'state', 'month'] as const
const SECTION_LABELS: Record<string, string> = {
  race: 'Stratégie de course',
  coach: 'Coach',
  state: "Statut d'entraînement",
  month: 'Ce mois & dernières sorties',
}
/** Filtre les clés inconnues et ré-ajoute les sections manquantes (résilient aux versions). */
function sanitizeOrder(raw: string[]): string[] {
  const known = raw.filter((k) => (DASH_SECTIONS as readonly string[]).includes(k))
  return [...known, ...DASH_SECTIONS.filter((k) => !known.includes(k))]
}

function loadSectionOrder(): string[] {
  try {
    return sanitizeOrder(JSON.parse(localStorage.getItem('vl-dash-order') ?? '[]') as string[])
  } catch {
    return [...DASH_SECTIONS]
  }
}

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

  const { data: renfoLogs = [] } = useQuery<SessionLog2[]>({
    queryKey: ['renfo-session-logs-dashboard'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 95 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('renfo_session_log')
        .select('focus,duration_min,session_date,source')
        .eq('user_id', user!.id)
        .gte('session_date', cutoff)
        .order('session_date', { ascending: false })
      return (data ?? []) as SessionLog2[]
    },
    enabled: !!user,
  })

  // Rattrapage Strava → renfo (musculation, yoga…) : tournait uniquement sur la
  // page Renfo ; depuis la fusion dans le Coach, on le déclenche aussi ici pour
  // que les imports continuent sans visiter /renfo. Idempotent (jamais de doublon).
  const queryClient = useQueryClient()
  useQuery({
    queryKey: ['renfo-strava-backfill', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const n = await syncStravaRenfo(user!.id)
      if (n > 0) {
        queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-dashboard'] })
        queryClient.invalidateQueries({ queryKey: ['renfo-session-logs-7d'] })
      }
      return n
    },
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
        .select('id,name,date,distance,elevation,type,goal_time,start_time,gpx_data,last_projection,surfaces')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      return data as NextRace | null
    },
  })

  const { data: profileData, refetch: refetchProfile } = useQuery<{ fc_max?: number; runner_profile?: RunnerProfileComputed | null; renfo_weekly_target?: number; dashboard_layout?: string[] | null } | null>({
    queryKey: ['profile-fcmax-dash', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase.from('profiles').select('fc_max,runner_profile,renfo_weekly_target,dashboard_layout').eq('id', user.id).single()
      return data as { fc_max?: number; runner_profile?: RunnerProfileComputed | null; renfo_weekly_target?: number; dashboard_layout?: string[] | null } | null
    },
    enabled: !!user,
  })
  const fcMax = profileData?.fc_max
  const renfoWeeklyTarget = profileData?.renfo_weekly_target ?? 3

  // Silent background recompute when:
  //   a) latest activity is newer than last profile computation, OR
  //   b) streamCoverage < 0.01 (old profile computed without streams — stale data)
  const profileTriggeredRef = useRef(false)
  useEffect(() => {
    if (!user || !activities.length || profileTriggeredRef.current) return
    // Attendre que le profil soit chargé : sinon `profileData?.fc_max` vaut
    // undefined → le recalcul partirait sur 185 (défaut) et ÉCRASERAIT la vraie
    // FC max de l'athlète. (Le hook se relance quand profileData arrive.)
    if (profileData === undefined) return
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
  }, [user?.id, activities[0]?.start_date, profileData?.runner_profile?._computedAt, profileData?.fc_max])

  const now = new Date()

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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

  // ── Ordre des sections : synchronisé entre appareils (profiles.dashboard_layout),
  // localStorage en cache local, drag & drop (pointer events) + ▲▼ en secours. ──
  const [sectionOrder, setSectionOrder] = useState<string[]>(loadSectionOrder)
  const [arranging, setArranging] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Le serveur fait foi à l'arrivée (sauf pendant un drag en cours).
  const serverLayout = profileData?.dashboard_layout
  const serverLayoutKey = serverLayout?.join(',') ?? ''
  useEffect(() => {
    if (!serverLayoutKey || dragKey) return
    const next = sanitizeOrder(serverLayout ?? [])
    setSectionOrder((prev) => (next.join(',') !== prev.join(',') ? next : prev))
    localStorage.setItem('vl-dash-order', JSON.stringify(next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLayoutKey])

  function persistOrder(next: string[]) {
    localStorage.setItem('vl-dash-order', JSON.stringify(next))
    if (user) void supabase.from('profiles').update({ dashboard_layout: next }).eq('id', user.id)
  }

  function moveSection(key: string, dir: -1 | 1) {
    setSectionOrder((prev) => {
      const i = prev.indexOf(key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      persistOrder(next)
      return next
    })
  }

  // Drag & drop : la section suit le doigt/curseur, insérée au-dessus de la
  // première section dont elle croise la moitié haute.
  function onDragStart(key: string, e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragKey(key)
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragKey) return
    const y = e.clientY
    setSectionOrder((prev) => {
      const others = prev.filter((k) => k !== dragKey)
      let insert = others.length
      for (let i = 0; i < others.length; i++) {
        const el = sectionRefs.current[others[i]]
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (y < r.top + r.height / 2) { insert = i; break }
      }
      const next = [...others.slice(0, insert), dragKey, ...others.slice(insert)]
      return next.join(',') === prev.join(',') ? prev : next
    })
  }
  function onDragEnd() {
    if (!dragKey) return
    setDragKey(null)
    setSectionOrder((prev) => { persistOrder(prev); return prev })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: '1.25rem' }}>
        <div className="clabel" style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
          DASHBOARD
        </div>
        <button className="hbtn" style={{ fontSize: 10, padding: '4px 11px', color: arranging ? 'var(--vl-ember)' : undefined, borderColor: arranging ? 'var(--vl-ember)' : undefined }} onClick={() => setArranging((a) => !a)}>
          {arranging ? '✓ TERMINÉ' : '⇅ RÉORGANISER'}
        </button>
      </div>

      {isLoading ? (
        <BrandedLoader />
      ) : (
        <>
          {/* Incitation PRO (comptes gratuits uniquement, masquable) — au-dessus des sections. */}
          <ProUpgradeCard />

          {/* ── Sections réorganisables : l'ordre appartient à l'utilisateur ── */}
          {sectionOrder.map((key, idx) => (
            <div
              key={key}
              ref={(el) => { sectionRefs.current[key] = el }}
              style={dragKey === key ? { opacity: 0.55, outline: '2px dashed var(--vl-ember)', outlineOffset: 2, borderRadius: 8 } : undefined}
            >
              {arranging && (
                <div
                  onPointerDown={(e) => onDragStart(key, e)}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    margin: '0 0 6px', padding: '6px 10px', border: '1px dashed var(--vl-line)', borderRadius: 6,
                    cursor: dragKey === key ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span aria-hidden style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', letterSpacing: '-2px' }}>⠿</span>
                    <span className="mlabel" style={{ margin: 0, letterSpacing: '.1em' }}>{SECTION_LABELS[key]}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 6 }} onPointerDown={(e) => e.stopPropagation()}>
                    <button className="hbtn" disabled={idx === 0} style={{ padding: '2px 10px', opacity: idx === 0 ? 0.35 : 1 }} onClick={() => moveSection(key, -1)} aria-label="Monter la section">▲</button>
                    <button className="hbtn" disabled={idx === sectionOrder.length - 1} style={{ padding: '2px 10px', opacity: idx === sectionOrder.length - 1 ? 0.35 : 1 }} onClick={() => moveSection(key, 1)} aria-label="Descendre la section">▼</button>
                  </span>
                </div>
              )}
              {key === 'race' && nextRace && <NextRaceWidget race={nextRace} />}
              {key === 'coach' && <CoachCard renfoLogs={renfoLogs} renfoWeeklyTarget={renfoWeeklyTarget} />}
              {key === 'state' && <TrainingStatusCard activities={pmcActs} renfoLogs={renfoLogs} fcMax={fcMax} />}
              {key === 'month' && (
          <div data-tour="dash-recent" className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div className="clabel" style={{ margin: 0 }}>CE MOIS</div>
                <Link to="/activities" style={{ textDecoration: 'none' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-ember)', fontSize: 10, letterSpacing: '.1em' }}>VOIR TOUT →</div>
                </Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1 }}>{(kmMonth / 1000).toFixed(1)}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>km COURSE</div>
                  {deltaKmPct != null && (
                    <div style={{ display: 'inline-block', marginTop: 4, background: 'var(--vl-surf-2)', borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--vl-mono)', fontSize: 10, color: deltaKmPct >= 0 ? 'var(--vl-growth)' : 'var(--vl-ember)' }}>
                      {deltaKmPct >= 0 ? '+' : ''}{deltaKmPct}% · vs M-1
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-growth)', lineHeight: 1 }}>{Math.round(elevMonth)}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>m D+</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{renfoMonthCount}</div>
                  <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 2 }}>sess. RENFO</div>
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
                        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
                          /KM · {formatDateShort(a.start_date)}
                        </div>
                        <span className="act-badge">{a.sport_type === 'TrailRun' ? 'Trail' : a.type}</span>
                      </div>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}
