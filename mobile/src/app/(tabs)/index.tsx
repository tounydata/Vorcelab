import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Defs, LinearGradient, Stop, Line, Path, Polyline, Rect, G } from 'react-native-svg'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { syncStravaRenfo } from '@/lib/syncStravaRenfo'
import { type SessionLog } from '@/lib/renfoUtils'
import {
  computeActivityLoad, computeDailyPMC, getTsbZone, computeACWR, classifySport,
  type ActivityForLoad, type PMCDay,
} from '@/lib/trainingLoad'
import { recomputeRunnerProfileServer } from '@/lib/recomputeRunnerProfile'
import { shouldRebuildRunnerProfile } from '@/lib/runnerProfileSchema'
import type { RunnerProfileComputed } from '@/lib/runnerProfile'
import { useRaceProjection } from '@/lib/useRaceProjection'
import { fmtRaceTimeS } from '@/lib/raceStrategyView'
import CoachCard from '@/components/CoachCard'
import BrandedLoader from '@/components/BrandedLoader'
import PostRaceModal from '@/components/races/PostRaceModal'
import { pickRacePrompt, type RaceCalendarRow } from '@/lib/racePrompt'
import { linkRaceResult } from '@/lib/linkRaceResult'
import { CaretDownIcon, CaretUpIcon, CheckIcon, ReorderIcon } from '@/components/coach/CoachIcons'
import { colors, font, radius, space } from '@/lib/theme'

interface SessionLog2 extends SessionLog { source?: string | null }
interface Activity2 {
  id: string; strava_activity_id?: number | string; name: string; distance: number; total_elevation_gain: number
  moving_time: number; start_date: string; start_date_local?: string; type: string; sport_type?: string
  average_heartrate?: number; average_speed?: number
}
interface LastProjection { cible: number; prudent: number; agressif: number; confidence: string; computedAt?: string }
interface NextRace {
  id: string; name: string; date: string; distance: number | null; elevation: number | null; type: string | null
  goal_time: string | null; start_time?: string | null; gpx_data: { lat: number; lon: number; ele: number }[] | null
  last_projection: LastProjection | null; surfaces?: unknown | null
}

const card = { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg } as const
const clabel = { fontSize: 10.5, color: colors.text3, textTransform: 'uppercase' as const, letterSpacing: 1.68, fontFamily: font.monoSemiBold }

function formatTime(seconds: number) { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min` }
function formatPaceShort(distM: number, timeS: number): string { if (!distM || !timeS) return '—'; const s = Math.round(timeS / (distM / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const FR_M = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.']
function formatDateShort(iso: string) { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')} ${FR_M[d.getMonth()]}` }
function isRunning(type: string) { return ['Run', 'TrailRun', 'Trail Run', 'Running'].includes(type) }

const ST = { over: colors.status.over, load: colors.status.load, peak: colors.status.peak, rest: colors.status.rest, prod: colors.status.prod, watch: colors.status.watch }

function computeMultiStatus(pmc: PMCDay[], acwr: ReturnType<typeof computeACWR>, activities: Activity2[]): { label: string; sub: string; color: string } {
  const today = pmc[pmc.length - 1]
  if (!today || today.calibrating) return { label: 'CALIBRAGE', sub: "construction de l'historique (≥ 28 j)", color: colors.text3 }
  const ratio = acwr.ratio
  const idx28 = Math.max(0, pmc.length - 29)
  const ctlTrendPct = pmc[idx28].ctl > 0 ? (today.ctl - pmc[idx28].ctl) / pmc[idx28].ctl : 0
  const now = Date.now()
  const hasHR = (a: Activity2) => isRunning(a.type) && a.average_heartrate && a.average_speed
  const recentRuns = activities.filter((a) => hasHR(a) && Date.now() - new Date(a.start_date).getTime() < 21 * 86400000)
  const baseRuns = activities.filter((a) => { const age = now - new Date(a.start_date).getTime(); return hasHR(a) && age >= 21 * 86400000 && age < 42 * 86400000 })
  const efOf = (arr: Activity2[]) => (arr.length >= 2 ? arr.reduce((s, a) => s + a.average_speed! / a.average_heartrate!, 0) / arr.length : null)
  const efRecent = efOf(recentRuns), efBase = efOf(baseRuns)
  const efTrend = efRecent != null && efBase != null && efBase > 0 ? (efRecent - efBase) / efBase : null
  const hardDays = pmc.slice(-7).filter((d) => d.ctl > 0 && d.totalLoad > 1.3 * d.ctl).length
  if (ratio != null && ratio > 1.5) {
    if (hardDays >= 3) return { label: 'CHARGE PROLONGÉE', sub: 'charge élevée prolongée — pense à récupérer', color: ST.over }
    return { label: 'CHARGE ÉLEVÉE', sub: 'pic ponctuel — récupération conseillée', color: ST.load }
  }
  if (ratio != null && ratio < 0.8) {
    if (ctlTrendPct < -0.05) return { label: 'FORME EN BAISSE', sub: 'charge faible + fitness en baisse', color: ST.load }
    if (today.ctl > 40 && (efTrend == null || efTrend >= 0)) return { label: 'PIC', sub: 'affûtage — forme optimale', color: ST.peak }
    return { label: 'RÉCUPÉRATION', sub: 'repos voulu — charge légère', color: ST.rest }
  }
  if (efTrend != null && efTrend < -0.05 && ctlTrendPct <= 0.03) return { label: 'PROGRESSION EN PAUSE', sub: 'charge sans progression cardio', color: ST.watch }
  if (ctlTrendPct > 0.05 && (efTrend == null || efTrend >= -0.03)) return { label: 'PRODUCTIF', sub: 'tu progresses', color: ST.prod }
  return { label: 'MAINTIEN', sub: 'forme stable', color: ST.watch }
}

function TrainingStatusCard({ activities, renfoLogs, fcMax }: { activities: Activity2[]; renfoLogs: SessionLog[]; fcMax?: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const [w, setW] = useState(0)
  const DISPLAY = 42
  const renfoActs: ActivityForLoad[] = renfoLogs.filter((r) => r.session_date).map((r) => {
    const f = r.focus ?? ''
    const sport = f.includes('yoga') || f.includes('stretching') ? 'Yoga' : f.includes('pilates') ? 'Pilates' : 'WeightTraining'
    return { start_date: r.session_date! + 'T12:00:00', type: sport, sport_type: sport, moving_time: (r.duration_min ?? 40) * 60 }
  })
  const combined: ActivityForLoad[] = [...activities, ...renfoActs]
  const pmc = computeDailyPMC(combined, fcMax, { totalDays: 90, displayDays: DISPLAY })
  if (pmc.length === 0) return null
  if (!pmc.some((d) => d.totalLoad > 0) && !pmc.some((d) => d.ctl > 0)) return null

  const dateIdx: Record<string, number> = {}
  pmc.forEach((d, i) => { dateIdx[d.date] = i })
  type Seg = { color: string; label: string; load: number }
  const segByDay: Record<number, Record<string, Seg>> = {}
  for (const a of combined) {
    const ds = (a.start_date || '').slice(0, 10)
    const i = dateIdx[ds]; if (i === undefined) continue
    const load = computeActivityLoad(a, fcMax); if (load <= 0) continue
    const info = classifySport(a.type, a.sport_type)
    segByDay[i] ??= {}
    const e = (segByDay[i][info.label] ??= { color: info.color, label: info.label, load: 0 })
    e.load += load
  }
  const daySegs: Seg[][] = pmc.map((_, i) => Object.values(segByDay[i] ?? {}).sort((a, b) => b.load - a.load))
  const today = pmc[pmc.length - 1]
  const acwr = computeACWR(pmc)
  const status = computeMultiStatus(pmc, acwr, activities)
  const maxAxis = Math.max(1, ...pmc.map((d) => d.totalLoad)) * 1.1
  const VW = 420, H = 96, W_COL = VW / DISPLAY, GAP = 2.4, BAR_W = W_COL - GAP
  const FR_W = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
  const FR_MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  const fmtD = (ds: string) => { const d = new Date(ds + 'T12:00:00'); return `${FR_W[d.getDay()]} ${d.getDate()} ${FR_MS[d.getMonth()]}` }
  const labelIdx = [0, 14, 28, DISPLAY - 1]
  const formeWord = today.ctl > 55 ? 'Solide' : today.ctl >= 35 ? 'Correcte' : 'À construire'
  const fatigueWord = today.ctl > 0 && today.atl > today.ctl * 1.15 ? 'Élevée' : today.ctl > 0 && today.atl < today.ctl * 0.85 ? 'Basse' : 'Modérée'
  const fatigueColor = fatigueWord === 'Élevée' ? ST.load : fatigueWord === 'Basse' ? ST.prod : colors.amber
  const equil = acwr.ratio == null ? { word: '—', color: colors.text3 } : acwr.ratio < 0.8 ? { word: 'Léger', color: ST.rest } : acwr.ratio <= 1.3 ? { word: 'Optimal', color: ST.prod } : acwr.ratio <= 1.5 ? { word: 'Soutenu', color: ST.watch } : { word: 'Élevé', color: ST.over }

  function touch(locX: number) { if (!w) return; const i = Math.floor((Math.max(0, Math.min(w, locX)) / w) * DISPLAY); setHover(Math.max(0, Math.min(DISPLAY - 1, i))) }

  return (
    <View style={[card, { marginBottom: 24, padding: 14, overflow: 'hidden' }]}>
      <Text style={[clabel, { marginBottom: 10 }]}>Statut d’entraînement</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: `${status.color}1f`, borderLeftWidth: 4, borderLeftColor: status.color, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontFamily: font.display, color: status.color, letterSpacing: 0.24 }}>{status.label}</Text>
          <Text style={{ fontSize: 10, color: colors.text2, marginTop: 4 }}>{status.sub}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 22, fontFamily: font.display, color: colors.text2 }}>{today.tsb > 0 ? `+${today.tsb}` : today.tsb}</Text>
          <Text style={{ fontSize: 10, fontFamily: font.mono, color: colors.text3, marginTop: 2 }}>FRAÎCHEUR</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        {[{ l: 'FORME', w: formeWord, c: ST.prod, sub: `fond ${today.ctl}` }, { l: 'FATIGUE', w: fatigueWord, c: fatigueColor, sub: `récente ${today.atl}` }, { l: 'ÉQUILIBRE', w: equil.word, c: equil.color, sub: acwr.ratio != null ? `charge ×${acwr.ratio.toFixed(2)}` : 'calibrage' }].map((t) => (
          <View key={t.l} style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontFamily: font.mono, color: colors.text3, letterSpacing: 1 }}>{t.l}</Text>
            <Text style={{ fontSize: 18, fontFamily: font.display, color: t.c, marginTop: 3 }}>{t.w}</Text>
            <Text style={{ fontSize: 10, color: colors.text3, marginTop: 3 }}>{t.sub}</Text>
          </View>
        ))}
      </View>
      <View style={{ minHeight: 22, marginBottom: 5 }}>
        {hover != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 10, color: colors.text2, fontWeight: '700', letterSpacing: 0.6 }}>{fmtD(pmc[hover].date)}</Text>
            <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: getTsbZone(pmc[hover].tsb).color }} />
            <Text style={{ fontSize: 10, color: colors.text3 }}>Fraîcheur {pmc[hover].tsb > 0 ? `+${pmc[hover].tsb}` : pmc[hover].tsb}</Text>
            {daySegs[hover].length === 0 ? <Text style={{ fontSize: 10, color: colors.text3 }}>Repos</Text> : daySegs[hover].map((seg, j) => (
              <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: seg.color }} />
                <Text style={{ fontSize: 10, color: colors.text2 }}>{seg.label}</Text>
                <Text style={{ fontSize: 10, color: colors.text, fontWeight: '700' }}>{Math.round(seg.load)}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={{ fontSize: 10, color: colors.text3 }}>Touche pour le détail jour par jour</Text>}
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => touch(e.nativeEvent.locationX)} onResponderMove={(e) => touch(e.nativeEvent.locationX)} onResponderRelease={() => setHover(null)}>
        <Svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {pmc.map((_, i) => <Rect key={`bg${i}`} x={i * W_COL} y={0} width={W_COL} height={H} fill={status.color} opacity={0.05} />)}
          {[7, 14, 21, 28, 35].map((d) => <Line key={d} x1={d * W_COL} y1={0} x2={d * W_COL} y2={H} stroke={colors.line} strokeWidth={0.5} opacity={0.4} />)}
          {pmc.map((_, i) => {
            let yTop = H
            const dim = hover != null && hover !== i ? 0.35 : 1
            return <G key={`bar${i}`} opacity={dim}>{daySegs[i].map((seg, j) => { const bh = (seg.load / maxAxis) * H; yTop -= bh; return <Rect key={j} x={i * W_COL + GAP / 2} y={yTop} width={BAR_W} height={bh} fill={seg.color} rx={1} /> })}</G>
          })}
        </Svg>
      </View>
      <View style={{ height: 12, marginTop: 4 }}>
        {labelIdx.map((i) => (
          <Text key={i} style={{ position: 'absolute', left: `${((i + 0.5) / DISPLAY) * 100}%`, fontSize: 10, color: colors.text3, transform: [{ translateX: -16 }] }}>
            {i === DISPLAY - 1 ? 'auj.' : `${new Date(pmc[i].date + 'T12:00:00').getDate()} ${FR_MS[new Date(pmc[i].date + 'T12:00:00').getMonth()]}`}
          </Text>
        ))}
      </View>
    </View>
  )
}

function getPhase(daysLeft: number): { label: string; color: string } {
  if (daysLeft <= 7) return { label: 'SEMAINE DE COURSE', color: colors.ember }
  if (daysLeft <= 21) return { label: 'AFFÛTAGE', color: colors.amber }
  if (daysLeft <= 42) return { label: 'PRÉPARATION SPÉCIFIQUE', color: colors.growth }
  return { label: 'CONSTRUCTION DE BASE', color: colors.text2 }
}

function GpxTrace({ gpxData }: { gpxData: { lat: number; lon: number; ele: number }[] }) {
  const step = Math.max(1, Math.floor(gpxData.length / 300))
  const pts = gpxData.filter((_, i) => i % step === 0)
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const dLat = maxLat - minLat || 0.001, dLon = maxLon - minLon || 0.001
  const VW = 240, VH = 130, scale = Math.min(VW / dLon, VH / dLat) * 0.82
  const ox = (VW - dLon * scale) / 2, oy = (VH - dLat * scale) / 2
  const tracePts = pts.map((p) => `${(ox + (p.lon - minLon) * scale).toFixed(1)},${(oy + (maxLat - p.lat) * scale).toFixed(1)}`).join(' ')
  return <Svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', opacity: 0.22 }}><Polyline points={tracePts} fill="none" stroke={colors.ember} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}

function MiniAlti({ gpxData }: { gpxData: { lat: number; lon: number; ele: number }[] }) {
  const step = Math.max(1, Math.floor(gpxData.length / 80))
  const eles = gpxData.filter((_, i) => i % step === 0).map((p) => p.ele || 0)
  if (eles.length < 4) return null
  const mn = Math.min(...eles), mx = Math.max(...eles), range = mx - mn || 1
  const W = 100, H = 36
  const coords = eles.map((v, i) => `${((i / (eles.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - mn) / range) * (H - 6)).toFixed(1)}`)
  const pathD = `M${coords.join(' L')}`
  return (
    <Svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={44}>
      <Defs><LinearGradient id="altiG" x1="0" x2="0" y1="0" y2="1"><Stop offset="0" stopColor={colors.ember} stopOpacity={0.35} /><Stop offset="1" stopColor={colors.ember} stopOpacity={0} /></LinearGradient></Defs>
      <Path d={`${pathD} L${W},${H} L0,${H} Z`} fill="url(#altiG)" />
      <Path d={pathD} fill="none" stroke={colors.ember} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
    </Svg>
  )
}

function NextRaceWidget({ race }: { race: NextRace }) {
  const router = useRouter()
  const raceDate = new Date(race.date)
  const daysLeft = Math.ceil((raceDate.getTime() - Date.now()) / 86400000)
  const phase = getPhase(daysLeft)
  const dStr = `${raceDate.getDate()} ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][raceDate.getMonth()]} ${raceDate.getFullYear()}`
  const gpxPts = Array.isArray(race.gpx_data) && race.gpx_data.length > 4 ? race.gpx_data : null
  const live = useRaceProjection(race)
  const proj: LastProjection | null = live ? { cible: live.estTimeS, prudent: live.timeMax, agressif: live.timeMin, confidence: live.confidence } : race.last_projection
  const isSnapshot = !live && !!race.last_projection
  const confColor = proj ? (proj.confidence === 'good' ? colors.growth2 : proj.confidence === 'medium' ? colors.amber : colors.ember) : ''
  const confFilled = proj ? (proj.confidence === 'good' ? 5 : proj.confidence === 'medium' ? 3 : 1) : 0

  return (
    <Pressable onPress={() => router.push(`/race/${race.id}` as never)} style={[card, { marginBottom: 24, overflow: 'hidden' }]}>
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        <Text style={{ fontSize: 10, fontFamily: font.monoSemiBold, letterSpacing: 1.6, color: colors.text3 }}>STRATÉGIE DE COURSE</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1.1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, position: 'relative' }}>
          {gpxPts ? <View style={{ position: 'absolute', top: 4, left: 0, right: 0, bottom: 72, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none"><GpxTrace gpxData={gpxPts} /></View> : null}
          <Text style={{ fontSize: 10, fontFamily: font.mono, color: colors.ember, letterSpacing: 1.8, marginBottom: 4 }}>{(race.type ?? 'COURSE').toUpperCase()} · COURSE VISÉE</Text>
          <Text style={{ fontSize: 28, fontFamily: font.display, letterSpacing: 0.56, textTransform: 'uppercase', lineHeight: 27, marginBottom: 6, color: colors.text }}>{race.name}</Text>
          <Text style={{ fontSize: 11, color: colors.text2, marginBottom: 10 }}>{dStr}{race.distance ? ` · ${race.distance} km` : ''}{race.elevation ? ` · D+ ${race.elevation} m` : ''}</Text>
          <Text style={{ fontSize: 56, fontFamily: font.displayBlack, color: colors.ember, lineHeight: 50 }}>{daysLeft}</Text>
          <Text style={{ fontSize: 10, fontFamily: font.mono, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.6, marginTop: 4 }}>JOURS</Text>
          <Text style={{ fontSize: 10, fontFamily: font.monoSemiBold, color: phase.color, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4, marginBottom: 12 }}>{phase.label}</Text>
          <Text style={{ backgroundColor: colors.ember, color: colors.bg, borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 14, fontSize: 13, fontFamily: font.displayBold, letterSpacing: 1, textAlign: 'center', overflow: 'hidden' }}>OUVRIR LA STRATÉGIE →</Text>
        </View>
        <View style={{ width: '44%', borderLeftWidth: 1, borderLeftColor: colors.line2 }}>
          {proj ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: font.monoSemiBold, color: colors.text2, letterSpacing: 1.6, marginBottom: 5, textTransform: 'uppercase' }}>
                PROJECTION VORCELAB{isSnapshot && race.last_projection?.computedAt ? <Text style={{ color: colors.text3, fontWeight: '400' }}> · du {new Date(race.last_projection.computedAt).getDate()}/{new Date(race.last_projection.computedAt).getMonth() + 1}</Text> : null}
              </Text>
              <Text style={{ fontSize: 30, fontFamily: font.display, color: colors.growth2, lineHeight: 28 }}>{fmtRaceTimeS(proj.cible)}</Text>
              <Text style={{ fontSize: 11, letterSpacing: 2, marginTop: 6 }}>{Array.from({ length: 5 }, (_, i) => <Text key={i} style={{ color: i < confFilled ? confColor : colors.text3 }}>{i < confFilled ? '●' : '○'}</Text>)}</Text>
              {proj.prudent && proj.agressif ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <Text style={{ fontSize: 10, fontFamily: font.mono, color: colors.text3 }}>PRUDENT <Text style={{ color: colors.text2 }}>{fmtRaceTimeS(proj.prudent)}</Text></Text>
                  <Text style={{ fontSize: 10, fontFamily: font.monoSemiBold, color: colors.growth2 }}>CIBLE {fmtRaceTimeS(proj.cible)}</Text>
                  <Text style={{ fontSize: 10, fontFamily: font.mono, color: colors.text3 }}>AGRESSIF <Text style={{ color: colors.text2 }}>{fmtRaceTimeS(proj.agressif)}</Text></Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {gpxPts ? <View style={{ flex: 1, minHeight: 12 }} /> : null}
          {gpxPts ? <MiniAlti gpxData={gpxPts} /> : null}
        </View>
      </View>
    </Pressable>
  )
}

const DASH_SECTIONS = ['race', 'coach', 'state', 'month'] as const
const SECTION_LABELS: Record<string, string> = { race: 'Stratégie de course', coach: 'Coach', state: "Statut d'entraînement", month: 'Ce mois & dernières sorties' }
function sanitizeOrder(raw: string[]): string[] {
  const known = raw.filter((k) => (DASH_SECTIONS as readonly string[]).includes(k))
  return [...known, ...DASH_SECTIONS.filter((k) => !known.includes(k))]
}

export default function Dashboard() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activities, setActivities] = useState<Activity2[]>([])
  const [renfoLogs, setRenfoLogs] = useState<SessionLog2[]>([])
  const [pmcActs, setPmcActs] = useState<Activity2[]>([])
  const [nextRace, setNextRace] = useState<NextRace | null>(null)
  const [recentRaces, setRecentRaces] = useState<RaceCalendarRow[]>([])
  const [dismissedRaces, setDismissedRaces] = useState<string[]>([])
  const [profileData, setProfileData] = useState<{ fc_max?: number; runner_profile?: RunnerProfileComputed | null; renfo_weekly_target?: number; dashboard_layout?: string[] | null } | null>(null)
  const [sectionOrder, setSectionOrder] = useState<string[]>([...DASH_SECTIONS])
  const [arranging, setArranging] = useState(false)
  const profileTriggeredRef = useRef(false)

  const load = useCallback(async () => {
    const [{ data: acts }, { data: pmc }, { data: race }, { data: recent }] = await Promise.all([
      supabase.from('strava_activities').select('id,strava_activity_id,name,distance,total_elevation_gain,moving_time,start_date,start_date_local,type,sport_type,average_heartrate,average_speed').order('start_date', { ascending: false }).limit(100),
      supabase.from('strava_activities').select('id,name,distance,total_elevation_gain,moving_time,start_date,start_date_local,type,sport_type,average_heartrate,average_speed').gte('start_date', new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10)).order('start_date', { ascending: false }),
      supabase.from('race_calendar').select('id,name,date,distance,elevation,type,goal_time,start_time,gpx_data,last_projection,surfaces').gte('date', new Date().toISOString().slice(0, 10)).order('date', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('race_calendar').select('id,name,date,distance,start_time,result_activity_id').gte('date', new Date(Date.now() - 12 * 86_400_000).toISOString().slice(0, 10)).lte('date', new Date().toISOString().slice(0, 10)).is('result_activity_id', null).order('date', { ascending: false }),
    ])
    setActivities((acts ?? []) as Activity2[])
    setPmcActs((pmc ?? []) as Activity2[])
    setNextRace((race ?? null) as NextRace | null)
    setRecentRaces((recent ?? []) as RaceCalendarRow[])
    if (userId) {
      const cutoff = new Date(Date.now() - 95 * 86_400_000).toISOString().slice(0, 10)
      const [{ data: renfo }, { data: prof }] = await Promise.all([
        supabase.from('renfo_session_log').select('focus,duration_min,session_date,source').eq('user_id', userId).gte('session_date', cutoff).order('session_date', { ascending: false }),
        supabase.from('profiles').select('fc_max,runner_profile,renfo_weekly_target,dashboard_layout').eq('id', userId).single(),
      ])
      setRenfoLogs((renfo ?? []) as SessionLog2[])
      setProfileData((prof ?? null) as typeof profileData)
    }
  }, [userId])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  // Ordre des sections : AsyncStorage (cache) puis serveur (fait foi).
  useEffect(() => { AsyncStorage.getItem('vl-dash-order').then((v) => { if (v) try { setSectionOrder(sanitizeOrder(JSON.parse(v))) } catch { /* ignore */ } }) }, [])

  // Pop-up post-course : courses récemment écartées (mémorisées).
  useEffect(() => { AsyncStorage.getItem('vl-race-prompt-dismissed').then((v) => { if (v) try { setDismissedRaces(JSON.parse(v)) } catch { /* ignore */ } }) }, [])
  const racePrompt = pickRacePrompt(recentRaces, activities as unknown as Record<string, unknown>[], dismissedRaces)
  const dismissRacePrompt = (id: string) => {
    setDismissedRaces((prev) => {
      const next = [...new Set([...prev, id])]
      AsyncStorage.setItem('vl-race-prompt-dismissed', JSON.stringify(next))
      return next
    })
  }
  useEffect(() => {
    const sl = profileData?.dashboard_layout
    if (!sl?.length) return
    const next = sanitizeOrder(sl)
    setSectionOrder((prev) => (next.join(',') !== prev.join(',') ? next : prev))
    AsyncStorage.setItem('vl-dash-order', JSON.stringify(next))
  }, [profileData?.dashboard_layout])

  // Rattrapage Strava → renfo (idempotent).
  useEffect(() => { if (userId) syncStravaRenfo(userId).then((n) => { if (n > 0) load() }).catch(() => {}) }, [userId, load])

  // Recalcul silencieux du profil coureur si activité plus récente / sans streams.
  useEffect(() => {
    if (!userId || !activities.length || profileTriggeredRef.current) return
    // Recalcul auto si profil absent, INCOMPATIBLE (ancien schéma), périmé, ou sans streams.
    if (!shouldRebuildRunnerProfile(profileData?.runner_profile ?? null, { latestActivityAt: activities[0].start_date })) return
    profileTriggeredRef.current = true
    ;(async () => {
      try {
        // §1 : recalcul CÔTÉ SERVEUR (compute-runner-profile) — source unique.
        await recomputeRunnerProfileServer()
        load()
      } catch (e) { console.warn('[VL] background profile recompute failed:', e); profileTriggeredRef.current = false }
    })()
  }, [userId, activities, profileData, load])

  function persistOrder(next: string[]) {
    AsyncStorage.setItem('vl-dash-order', JSON.stringify(next))
    if (userId) supabase.from('profiles').update({ dashboard_layout: next }).eq('id', userId).then(() => {})
  }
  function moveSection(key: string, dir: -1 | 1) {
    setSectionOrder((prev) => {
      const i = prev.indexOf(key), j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]
      persistOrder(next); return next
    })
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const runs = activities.filter((a) => isRunning(a.type))
  const monthRuns = runs.filter((a) => new Date(a.start_date) >= startOfMonth)
  const kmMonth = monthRuns.reduce((s, a) => s + a.distance, 0)
  const elevMonth = monthRuns.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  const prevMonthRuns = runs.filter((a) => { const d = new Date(a.start_date); return d >= prevMonthStart && d <= prevMonthEnd })
  const kmPrevMonth = prevMonthRuns.reduce((s, a) => s + a.distance, 0)
  const deltaKmPct = kmPrevMonth > 0 ? Math.round(((kmMonth - kmPrevMonth) / kmPrevMonth) * 100) : null
  const monthCutoffStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const renfoMonthCount = [...new Set(renfoLogs.filter((r) => r.session_date && r.session_date >= monthCutoffStr).map((r) => r.session_date))].length
  const recent = runs.slice(0, 4)
  const renfoWeeklyTarget = profileData?.renfo_weekly_target ?? 3

  const renderSection = (key: string) => {
    if (key === 'race') return nextRace ? <NextRaceWidget race={nextRace} /> : null
    if (key === 'coach') return <CoachCard renfoLogs={renfoLogs} renfoWeeklyTarget={renfoWeeklyTarget} />
    if (key === 'state') return <TrainingStatusCard activities={pmcActs} renfoLogs={renfoLogs} fcMax={profileData?.fc_max} />
    // month
    return (
      <View style={[card, { marginBottom: 24, padding: space.lg }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={clabel}>CE MOIS</Text>
          <Pressable onPress={() => router.push('/activities')} hitSlop={12}><Text style={{ color: colors.ember, fontSize: 10, fontFamily: font.monoSemiBold, letterSpacing: 1 }}>VOIR TOUT →</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontFamily: font.display, color: colors.ember, lineHeight: 26 }}>{(kmMonth / 1000).toFixed(1)}</Text>
            <Text style={{ fontSize: 10, color: colors.text3, marginTop: 2 }}>km COURSE</Text>
            {deltaKmPct != null ? <Text style={{ alignSelf: 'flex-start', marginTop: 4, backgroundColor: colors.surf2, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, fontSize: 10, color: deltaKmPct >= 0 ? colors.growth : colors.ember, overflow: 'hidden' }}>{deltaKmPct >= 0 ? '+' : ''}{deltaKmPct}% · vs M-1</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontFamily: font.display, color: colors.growth, lineHeight: 26 }}>{Math.round(elevMonth)}</Text>
            <Text style={{ fontSize: 10, color: colors.text3, marginTop: 2 }}>m D+</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontFamily: font.display, color: colors.violet, lineHeight: 26 }}>{renfoMonthCount}</Text>
            <Text style={{ fontSize: 10, color: colors.text3, marginTop: 2 }}>sess. RENFO</Text>
          </View>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginVertical: 12 }} />
        <Text style={[clabel, { marginBottom: 12 }]}>DERNIÈRES SORTIES</Text>
        {recent.length === 0 ? <Text style={{ color: colors.text3, fontSize: 13 }}>Aucune activité enregistrée</Text> : recent.map((a) => (
          <Pressable key={a.id} onPress={() => router.push(`/activities/${a.id}` as never)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={1}>{a.name}</Text>
              <Text style={{ color: colors.text2, fontSize: 11, marginTop: 2 }}>{(a.distance / 1000).toFixed(1)} km · {formatTime(a.moving_time)} · D+ {Math.round(a.total_elevation_gain ?? 0)}m{a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 24, fontFamily: font.display, color: colors.ember, lineHeight: 24 }}>{formatPaceShort(a.distance, a.moving_time)}</Text>
              <Text style={{ fontSize: 10, color: colors.text3, marginTop: 2 }}>/KM · {formatDateShort(a.start_date)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {racePrompt ? (
        <PostRaceModal
          prompt={racePrompt}
          onLink={async (activityId) => { await linkRaceResult(racePrompt.race.id, activityId); load(); router.push(`/race/${racePrompt.race.id}` as never) }}
          onOpenRace={() => { dismissRacePrompt(racePrompt.race.id); router.push(`/race/${racePrompt.race.id}` as never) }}
          onDismiss={() => dismissRacePrompt(racePrompt.race.id)}
        />
      ) : null}
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)) }} tintColor={colors.ember} />}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
          <Text style={{ fontSize: 24, fontFamily: font.display, letterSpacing: 1, color: colors.text }}>DASHBOARD</Text>
          <Pressable onPress={() => setArranging((a) => !a)} hitSlop={8} style={{ borderWidth: 1, borderColor: arranging ? colors.ember : colors.line2, borderRadius: radius.sm, minHeight: 32, paddingVertical: 4, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {arranging ? <CheckIcon size={11} color={colors.ember} /> : <ReorderIcon size={11} color={colors.text2} />}
            <Text style={{ fontSize: 10, fontFamily: font.monoSemiBold, letterSpacing: 0.8, color: arranging ? colors.ember : colors.text2 }}>{arranging ? 'TERMINÉ' : 'RÉORGANISER'}</Text>
          </Pressable>
        </View>

        {loading ? <BrandedLoader fullScreen={false} /> : sectionOrder.map((key, idx) => (
          <View key={key}>
            {arranging ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', borderRadius: 6 }}>
                <Text style={{ fontSize: 10.5, color: colors.text3, letterSpacing: 1, fontWeight: '700' }}>{SECTION_LABELS[key]}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {/* Cibles tactiles ≥ 44 pt (audit transverse) — hitSlop compense la hauteur visuelle. */}
                  <Pressable disabled={idx === 0} onPress={() => moveSection(key, -1)} hitSlop={10} style={{ minWidth: 44, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, opacity: idx === 0 ? 0.35 : 1 }}><CaretUpIcon size={14} color={colors.text2} /></Pressable>
                  <Pressable disabled={idx === sectionOrder.length - 1} onPress={() => moveSection(key, 1)} hitSlop={10} style={{ minWidth: 44, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, opacity: idx === sectionOrder.length - 1 ? 0.35 : 1 }}><CaretDownIcon size={14} color={colors.text2} /></Pressable>
                </View>
              </View>
            ) : null}
            {renderSection(key)}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
