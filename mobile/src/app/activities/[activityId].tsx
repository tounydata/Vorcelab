import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Svg, { Defs, LinearGradient, Stop, Path, Line, Text as SvgText, Rect, G, ClipPath } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { fetchStreams, type StreamData } from '@/lib/streams'
import { computeActivityLoad } from '@/lib/trainingLoad'
import { buildSessionInsights } from '@/lib/sessionQuality'
import { buildSessionDebrief } from '@/lib/sessionDebrief'
import { computeDecoupling, computeDurabilityThirds, type DurabilityStatus } from '@/lib/durability'
import { vamBand, VAM_BAND_LABEL } from '@/lib/coach/sessionAnalysis'
import { fetchActivityWeather, mergeStravaTemp, type WeatherData } from '@/lib/weather'
import BrandedLoader from '@/components/BrandedLoader'
import RouteMap from '@/components/RouteMap'
import ShareStickers from '@/components/ShareStickers'
import { Card, CLabel, SVal, SLbl, BackLink, colors, radius, space } from '@/components/coach/ui'

// ─── Types ──────────────────────────────────────────────────────────────────
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
  is_race: boolean | null
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
  const secPerKm = Math.round(timeS / (distM / 1000))
  return `${Math.floor(secPerKm / 60)}'${String(secPerKm % 60).padStart(2, '0')}/km`
}
function fmtPaceFromMps(mps: number | null) {
  if (!mps || mps <= 0) return '—'
  const secPerKm = Math.round(1000 / mps)
  return `${Math.floor(secPerKm / 60)}'${String(secPerKm % 60).padStart(2, '0')}/km`
}
const FR_WEEK = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const FR_MON = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${FR_WEEK[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${FR_MON[d.getMonth()]} ${d.getFullYear()}`
}
function fmtVam(mh: number) { return `${Math.round(mh)} m/h` }
function vamColor(vam: number) {
  const b = vamBand(vam)
  return b === 'elite' || b === 'strong' ? colors.growth : b === 'fair' ? colors.amber : colors.ember
}

function downsample<T>(arr: T[], targetLen: number): T[] {
  if (arr.length <= targetLen) return arr
  const step = arr.length / targetLen
  return Array.from({ length: targetLen }, (_, i) => arr[Math.round(i * step)])
}

// ─── Profil altitude + FC (SVG, survol tactile) ───────────────────────────────
interface ChartPoint { distKm: number; altM: number; hrBpm: number | null }

function DualChart({ points, onHoverKm }: { points: ChartPoint[]; onHoverKm: (km: number | null) => void }) {
  const [w, setW] = useState(0)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  if (!points.length) return null

  const W = 560, H = 150, padL = 38, padR = 38, padT = 8, padB = 22
  const cW = W - padL - padR, cH = H - padT - padB

  const altMin = Math.min(...points.map((p) => p.altM))
  const altMax = Math.max(...points.map((p) => p.altM))
  const distMax = points[points.length - 1].distKm
  const hrPoints = points.filter((p) => p.hrBpm != null)
  const hrMin = hrPoints.length ? Math.min(...hrPoints.map((p) => p.hrBpm!)) - 5 : 60
  const hrMax = hrPoints.length ? Math.max(...hrPoints.map((p) => p.hrBpm!)) + 5 : 200

  const xOf = (km: number) => padL + (km / distMax) * cW
  const yAlt = (m: number) => { const r = altMax - altMin; return padT + cH - (r > 0 ? ((m - altMin) / r) * cH : cH / 2) }
  const yHr = (bpm: number) => { const r = hrMax - hrMin; return padT + cH - (r > 0 ? ((bpm - hrMin) / r) * cH : cH / 2) }

  const altLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yAlt(p.altM).toFixed(1)}`).join(' ')
  const altPath = `${altLine} L${xOf(points[points.length - 1].distKm)},${padT + cH} L${padL},${padT + cH} Z`
  const hrPath = points.filter((p) => p.hrBpm != null).map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.distKm).toFixed(1)},${yHr(p.hrBpm!).toFixed(1)}`).join(' ')

  const tickStep = distMax > 20 ? 5 : distMax > 10 ? 2 : 1
  const ticks: number[] = []
  for (let t = 0; t <= distMax; t += tickStep) ticks.push(t)

  function handleTouch(locX: number) {
    if (!w) return
    const rawX = (locX / w) * W
    if (rawX < padL || rawX > padL + cW) { setHoverIdx(null); onHoverKm(null); return }
    const km = ((rawX - padL) / cW) * distMax
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].distKm - km) < Math.abs(points[best].distKm - km)) best = i
    setHoverIdx(best)
    onHoverKm(points[best].distKm)
  }
  const hoverP = hoverIdx != null ? points[hoverIdx] : null
  const hoverX = hoverP ? xOf(hoverP.distKm) : null

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => handleTouch(e.nativeEvent.locationX)}
      onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
      onResponderRelease={() => { setHoverIdx(null); onHoverKm(null) }}
    >
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', aspectRatio: W / H }}>
        <Defs>
          <LinearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.growth} stopOpacity={0.32} />
            <Stop offset="100%" stopColor={colors.growth} stopOpacity={0.04} />
          </LinearGradient>
          <ClipPath id="chartClip"><Rect x={padL} y={padT} width={cW} height={cH} /></ClipPath>
        </Defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Line key={f} x1={padL} y1={padT + cH * (1 - f)} x2={padL + cW} y2={padT + cH * (1 - f)} stroke={colors.line} strokeWidth={0.5} opacity={0.5} />
        ))}
        <Path d={altPath} fill="url(#altGrad)" clipPath="url(#chartClip)" />
        <Path d={altLine} fill="none" stroke={colors.growth} strokeWidth={1.5} clipPath="url(#chartClip)" />
        {hrPoints.length > 5 ? <Path d={hrPath} fill="none" stroke={colors.ember} strokeWidth={1.5} clipPath="url(#chartClip)" /> : null}
        {ticks.map((t) => (
          <G key={t}>
            <Line x1={xOf(t)} y1={padT + cH} x2={xOf(t)} y2={padT + cH + 3} stroke={colors.text3} strokeWidth={0.8} />
            <SvgText x={xOf(t)} y={H - 4} textAnchor="middle" fontSize={8} fill={colors.text3}>{String(t)}</SvgText>
          </G>
        ))}
        {[altMin, Math.round((altMin + altMax) / 2), altMax].map((v, i) => (
          <SvgText key={i} x={padL - 3} y={yAlt(v) + 3} textAnchor="end" fontSize={8} fill={colors.growth}>{String(Math.round(v))}</SvgText>
        ))}
        {hrPoints.length > 5 ? [hrMin, Math.round((hrMin + hrMax) / 2), hrMax].map((v, i) => (
          <SvgText key={i} x={padL + cW + 3} y={yHr(v) + 3} textAnchor="start" fontSize={8} fill={colors.ember}>{String(Math.round(v))}</SvgText>
        )) : null}
        {hoverX != null ? <Line x1={hoverX} y1={padT} x2={hoverX} y2={padT + cH} stroke={colors.text2} strokeWidth={1} strokeDasharray="3,3" /> : null}
        {hoverP ? (
          <G>
            <Rect x={Math.min(hoverX!, padL + cW - 80)} y={padT + 4} width={76} height={40} rx={3} fill={colors.bg} stroke={colors.line} strokeWidth={0.8} opacity={0.95} />
            <SvgText x={Math.min(hoverX!, padL + cW - 80) + 4} y={padT + 17} fontSize={8} fill={colors.text}>{`${hoverP.distKm.toFixed(1)} km`}</SvgText>
            <SvgText x={Math.min(hoverX!, padL + cW - 80) + 4} y={padT + 28} fontSize={8} fill={colors.growth}>{`${Math.round(hoverP.altM)} m`}</SvgText>
            <SvgText x={Math.min(hoverX!, padL + cW - 80) + 4} y={padT + 39} fontSize={8} fill={colors.ember}>{hoverP.hrBpm != null ? `${Math.round(hoverP.hrBpm)} bpm` : '—'}</SvgText>
          </G>
        ) : null}
      </Svg>
    </View>
  )
}

// ─── Montées — VAM ────────────────────────────────────────────────────────────
interface ClimbSection { startKm: number; endKm: number; dPlus: number; timeS: number; vam: number }
function extractClimbs(dist: number[], alt: number[], time: number[]): ClimbSection[] {
  const sections: ClimbSection[] = []
  let inClimb = false, sIdx = 0
  const MERGE_GAP_M = 400, MIN_DPLUS = 25
  for (let i = 1; i < dist.length; i++) {
    const dAlt = alt[i] - alt[i - 1], dDist = dist[i] - dist[i - 1]
    if (dDist <= 0) continue
    const grade = (dAlt / dDist) * 100
    if (grade >= 3) { if (!inClimb) { inClimb = true; sIdx = i - 1 } }
    else if (inClimb) {
      const remaining = dist[i] - dist[i - 1]
      if (remaining > MERGE_GAP_M || grade < -5) {
        const dplus = alt[i - 1] - alt[sIdx]
        if (dplus >= MIN_DPLUS) {
          const dtS = time[i - 1] - time[sIdx]
          sections.push({ startKm: dist[sIdx] / 1000, endKm: dist[i - 1] / 1000, dPlus: dplus, timeS: dtS, vam: dtS > 10 ? (dplus / dtS) * 3600 : 0 })
        }
        inClimb = false
      }
    }
  }
  if (inClimb) {
    const n = dist.length - 1, dplus = alt[n] - alt[sIdx]
    if (dplus >= MIN_DPLUS) {
      const dtS = time[n] - time[sIdx]
      sections.push({ startKm: dist[sIdx] / 1000, endKm: dist[n] / 1000, dPlus: dplus, timeS: dtS, vam: dtS > 10 ? (dplus / dtS) * 3600 : 0 })
    }
  }
  return sections.sort((a, b) => b.dPlus - a.dPlus).slice(0, 6)
}

function VamSectionsCard({ dist, alt, time }: { dist: number[]; alt: number[]; time: number[] }) {
  const climbs = extractClimbs(dist, alt, time)
  if (!climbs.length) return null
  const th = { color: colors.text3, fontSize: 9, letterSpacing: 0.54, fontWeight: '600' as const }
  return (
    <Card style={{ marginBottom: 16 }}>
      <CLabel>MONTÉES — VAM</CLabel>
      <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
        <Text style={[th, { flex: 2 }]}>KM</Text>
        <Text style={[th, { flex: 1, textAlign: 'right' }]}>D+</Text>
        <Text style={[th, { flex: 1.4, textAlign: 'right' }]}>TEMPS</Text>
        <Text style={[th, { flex: 1.2, textAlign: 'right' }]}>VAM</Text>
      </View>
      {climbs.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Text style={{ flex: 2, color: colors.text2, fontSize: 11 }}>{s.startKm.toFixed(1)} → {s.endKm.toFixed(1)}</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: colors.growth, fontWeight: '600', fontSize: 11 }}>+{Math.round(s.dPlus)}m</Text>
          <Text style={{ flex: 1.4, textAlign: 'right', color: colors.text2, fontSize: 11 }}>{fmtTime(Math.round(s.timeS))}</Text>
          <Text style={{ flex: 1.2, textAlign: 'right', fontWeight: '700', fontSize: 11, color: s.vam > 0 ? vamColor(s.vam) : colors.text3 }}>{s.vam > 0 ? fmtVam(s.vam) : '—'}</Text>
        </View>
      ))}
    </Card>
  )
}

// ─── Répartition FC ─────────────────────────────────────────────────────────
const FC_ZONE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444']
const FC_ZONE_LABELS = ['Z1 <60%', 'Z2 60–70%', 'Z3 70–80%', 'Z4 80–90%', 'Z5 >90%']
function computeFcZones(hrData: number[], fcMax: number): number[] {
  const counts = [0, 0, 0, 0, 0]
  hrData.forEach((h) => {
    const p = h / fcMax
    if (p < 0.6) counts[0]++; else if (p < 0.7) counts[1]++; else if (p < 0.8) counts[2]++; else if (p < 0.9) counts[3]++; else counts[4]++
  })
  const tot = hrData.length
  return counts.map((c) => Math.round((c / tot) * 100))
}
function FcZonesCard({ hrData, fcMax }: { hrData: number[]; fcMax: number }) {
  if (!hrData.length) return null
  const pcts = computeFcZones(hrData, fcMax)
  const highPct = pcts[3] + pcts[4]
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <CLabel style={{ marginBottom: 0 }}>RÉPARTITION FC</CLabel>
        <Text style={{ fontSize: 9, fontWeight: '700', color: highPct > 50 ? colors.ember : highPct > 25 ? colors.amber : colors.growth }}>Z4-Z5 : {highPct}%</Text>
      </View>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
        {pcts.map((p, i) => (p > 0 ? <View key={i} style={{ flex: p, backgroundColor: FC_ZONE_COLORS[i], minWidth: 2 }} /> : null))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 7 }}>
        {FC_ZONE_LABELS.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: FC_ZONE_COLORS[i] }} />
            <Text style={{ fontSize: 8, color: colors.text3 }}>{l} <Text style={{ color: pcts[i] > 0 ? colors.text : colors.text3, fontWeight: pcts[i] > 0 ? '700' : '400' }}>{pcts[i]}%</Text></Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

// ─── Lecture de séance ────────────────────────────────────────────────────────
const RUN_TYPES_DETAIL = ['Run', 'TrailRun', 'Trail Run', 'Running', 'VirtualRun']
function SessionSummaryCard({ activity, hrData, fcMax, recentRuns }: { activity: ActivityDetail; hrData: number[]; fcMax: number; recentRuns: RecentActivity[] }) {
  const distKm = activity.distance / 1000
  const fcPct = activity.average_heartrate ? Math.round((activity.average_heartrate / fcMax) * 100) : null
  const actDate = new Date(activity.start_date)
  const d28ago = new Date(actDate); d28ago.setDate(actDate.getDate() - 28)
  const d7ago = new Date(actDate); d7ago.setDate(actDate.getDate() - 7)
  const runs28 = recentRuns.filter((a) => {
    const d = new Date(a.start_date)
    return (RUN_TYPES_DETAIL.includes(a.type) || RUN_TYPES_DETAIL.includes(a.sport_type ?? '')) && d >= d28ago && d < actDate
  })
  const runs7 = runs28.filter((a) => new Date(a.start_date) >= d7ago)
  const km28 = runs28.reduce((s, a) => s + a.distance / 1000, 0)
  const km7 = runs7.reduce((s, a) => s + a.distance / 1000, 0)
  const dp28 = runs28.reduce((s, a) => s + (a.total_elevation_gain ?? 0), 0)
  let intensityLabel = '', effortComment = ''
  if (fcPct !== null) {
    if (fcPct < 70) { intensityLabel = `intensité faible (${fcPct}% FCmax)`; effortComment = 'Sortie facile ou récupératrice.' }
    else if (fcPct < 80) { intensityLabel = `intensité modérée (${fcPct}% FCmax)`; effortComment = 'Endurance active, dosage modéré.' }
    else if (fcPct < 88) { intensityLabel = `intensité élevée (${fcPct}% FCmax)`; effortComment = 'Séance soutenue — récupération correcte nécessaire.' }
    else { intensityLabel = `intensité très élevée (${fcPct}% FCmax)`; effortComment = 'Séance très intense — à ne pas répéter sans récupération.' }
  } else { intensityLabel = 'FC non disponible'; effortComment = 'Fréquence cardiaque absente — dosage cardio non évaluable.' }
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
    <Card style={{ marginBottom: 16 }}>
      <CLabel>LECTURE DE SÉANCE</CLabel>
      {lines.map((l, i) => <Text key={i} style={{ fontSize: 12.5, lineHeight: 22, color: colors.text2 }}>{l}</Text>)}
    </Card>
  )
}

// ─── Débrief ──────────────────────────────────────────────────────────────────
function SessionDebriefCard({ activity, fcMax, recentRuns }: { activity: ActivityDetail; fcMax: number; recentRuns: RecentActivity[] }) {
  const debrief = buildSessionDebrief(activity as never, recentRuns as never, fcMax)
  return (
    <Card style={{ marginBottom: 16, borderLeftWidth: 3, borderLeftColor: colors.ember }}>
      <CLabel>DÉBRIEF</CLabel>
      <Text style={{ fontSize: 17, lineHeight: 21, color: colors.text, marginBottom: 10, fontWeight: '700' }}>{debrief.headline}</Text>
      {debrief.comparisons.length > 0 ? (
        <View style={{ marginBottom: 10 }}>
          {debrief.comparisons.map((c, i) => <Text key={i} style={{ fontSize: 12.5, lineHeight: 21, color: colors.text2 }}>· {c}</Text>)}
        </View>
      ) : null}
      <Text style={{ fontSize: 13, lineHeight: 21, color: colors.text, marginBottom: debrief.tip ? 8 : 0 }}>{debrief.impact}</Text>
      {debrief.tip ? <Text style={{ fontSize: 12.5, lineHeight: 20, color: colors.text3, fontStyle: 'italic' }}>💡 {debrief.tip}</Text> : null}
    </Card>
  )
}

// ─── Facteurs de course ─────────────────────────────────────────────────────
function RaceContextCard({ activity, weather }: { activity: ActivityDetail; weather?: WeatherData | null }) {
  const factors: { label: string; value: string; adj: string; color: string }[] = []
  let totalAdj = 0
  if (weather?.temp != null) {
    const a = Math.max(0, (weather.temp - 15) * 0.005)
    if (a > 0.001) { totalAdj += a; factors.push({ label: 'Température', value: `${weather.temp.toFixed(1)}°C`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.04 ? colors.ember : a > 0.02 ? colors.amber : colors.growth }) }
  }
  if (weather?.precip != null && weather.precip > 0.5) {
    const a = Math.min(0.035, Math.log1p(weather.precip) * 0.018)
    totalAdj += a; factors.push({ label: 'Pluie', value: `${weather.precip.toFixed(1)} mm`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.02 ? colors.amber : colors.growth })
  }
  if (weather?.wind != null && weather.wind > 5) {
    const a = Math.min(0.045, Math.pow(weather.wind / 30, 2) * 0.04)
    if (a > 0.001) { totalAdj += a; factors.push({ label: 'Vent', value: `${Math.round(weather.wind)} km/h`, adj: `+${(a * 100).toFixed(1)}%`, color: a > 0.02 ? colors.amber : colors.growth }) }
  }
  const dp = activity.total_elevation_gain ?? 0, dk = (activity.distance ?? 1) / 1000
  if (dp > 0 && dk > 0.5) {
    const ga = Math.min(0.45, (dp / (dk * 1000)) * 5.5)
    totalAdj += ga; factors.push({ label: 'Dénivelé', value: `+${Math.round(dp)} m`, adj: `+${(ga * 100).toFixed(1)}%`, color: ga > 0.15 ? colors.amber : colors.growth })
  }
  const dateStr = activity.start_date_local ?? activity.start_date
  const h = parseInt(dateStr.split('T')[1]?.split(':')[0] ?? '12', 10)
  if (h < 5 || h >= 21) { totalAdj += 0.02; factors.push({ label: 'Nuit', value: `${h}h`, adj: '+2.0%', color: '#8b5cf6' }) }
  if (['TrailRun', 'Trail Run'].includes(activity.type) || ['TrailRun', 'Trail Run'].includes(activity.sport_type ?? '')) {
    totalAdj += 0.04; factors.push({ label: 'Trail', value: 'Terrain varié', adj: '+4.0%', color: colors.amber })
  }
  if (factors.length === 0) return null
  const rawPaceSec = activity.moving_time > 0 && activity.distance > 0 ? activity.moving_time / (activity.distance / 1000) : 0
  const normPaceSec = rawPaceSec > 0 ? rawPaceSec / (1 + totalAdj) : 0
  const paceNorm = normPaceSec > 0 ? `${Math.floor(Math.round(normPaceSec) / 60)}:${String(Math.round(normPaceSec) % 60).padStart(2, '0')}` : '—'
  return (
    <Card style={{ marginBottom: 16 }}>
      <CLabel style={{ marginBottom: 10 }}>FACTEURS DE COURSE</CLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {factors.map((f, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surf2, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 }}>
            <View>
              <Text style={{ fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.48, color: colors.text3 }}>{f.label}</Text>
              <Text style={{ fontSize: 10, color: colors.text2 }}>{f.value}</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: f.color }}>{f.adj}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 9, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.54 }}>Allure contextualisée</Text>
        <Text style={{ fontSize: 22, color: colors.text2, fontWeight: '700' }}>{paceNorm}<Text style={{ fontSize: 10, color: colors.text3 }}> /km</Text></Text>
        <Text style={{ fontSize: 8, color: colors.text3 }}>conditions +{(totalAdj * 100).toFixed(0)}%</Text>
      </View>
      <Text style={{ fontSize: 7.5, color: colors.text3, marginTop: 6, fontStyle: 'italic' }}>Minetti et al. 2002 · Lejeune et al. 1998</Text>
    </Card>
  )
}

// ─── Profil athlète (VAM + récup) ─────────────────────────────────────────────
interface VAMData {
  uphillSections: { vam: number; dAlt: number; dist: number; avgHR: number | null }[]
  downhillSections: { speed: number; grade: number }[]
  recoveries: { drop: number; hrAtTop: number; hrAfter60: number }[]
  avgVAM: number | null; maxVAM: number | null; avgRecovery: number | null; avgDownhill: number | null
}
function computeVAMFromStreams(streams: StreamData): VAMData | null {
  const altD = streams.altitude?.data ?? [], hrD = streams.heartrate?.data ?? []
  const velD = streams.velocity_smooth?.data ?? [], distD = streams.distance?.data ?? [], timeD = streams.time?.data ?? []
  if (!altD.length || !velD.length || !timeD.length || timeD.length !== altD.length) return null
  const uphillSections: VAMData['uphillSections'] = [], downhillSections: VAMData['downhillSections'] = [], recoveries: VAMData['recoveries'] = []
  let inUphill = false
  let uphillStart: { idx: number; alt: number; dist: number; time: number } | null = null
  const WIN = Math.min(30, Math.floor(altD.length / 10))
  for (let i = WIN; i < altD.length - WIN; i++) {
    const elevN = altD[i + WIN] - altD[i], distN = distD[i + WIN] - distD[i]
    const grade = distN > 0 ? (elevN / distN) * 100 : 0
    if (grade > 4 && !inUphill) { inUphill = true; uphillStart = { idx: i, alt: altD[i], dist: distD[i], time: timeD[i] } }
    else if (grade <= 1.5 && inUphill && uphillStart) {
      inUphill = false
      const dAlt = altD[i] - uphillStart.alt, dTime = timeD[i] - uphillStart.time
      if (dAlt > 10 && dTime > 0) {
        const vam = Math.round((dAlt / dTime) * 3600)
        const slice = hrD.slice(uphillStart.idx, i)
        const avgHR = slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : null
        uphillSections.push({ vam, dAlt: Math.round(dAlt), dist: Math.round(distD[i] - uphillStart.dist), avgHR })
        if (hrD.length && hrD[i]) {
          const hrAtTop = hrD[i], hrAfter60 = hrD[Math.min(i + 60, hrD.length - 1)] ?? 0
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
  const avgDownhillKmh = downhillSections.length ? parseFloat((downhillSections.reduce((a, b) => a + b.speed, 0) / downhillSections.length).toFixed(1)) : null
  return {
    uphillSections, downhillSections, recoveries,
    avgVAM: Math.round(uphillSections.reduce((a, b) => a + b.vam, 0) / uphillSections.length),
    maxVAM: Math.max(...uphillSections.map((s) => s.vam)),
    avgRecovery: recoveries.length ? Math.round(recoveries.reduce((a, b) => a + b.drop, 0) / recoveries.length) : null,
    avgDownhill: avgDownhillKmh,
  }
}
function AthleteProfileCard({ streams }: { streams: StreamData }) {
  const data = computeVAMFromStreams(streams)
  if (!data || !data.uphillSections.length) return null
  const { avgVAM, maxVAM, avgRecovery, avgDownhill, uphillSections } = data
  const vamLvl = maxVAM == null ? null : { l: ({ elite: 'Excellent', strong: 'Bon', fair: 'Correct', weak: 'À développer' } as const)[vamBand(maxVAM)], c: vamColor(maxVAM) }
  const recovLvl = avgRecovery == null ? null
    : avgRecovery > 30 ? { l: 'Rapide', c: colors.growth } : avgRecovery > 20 ? { l: 'Correct', c: colors.growth }
    : avgRecovery > 10 ? { l: 'Lent', c: colors.amber } : { l: 'Très lent', c: colors.ember }
  const downhillPace = avgDownhill && avgDownhill > 0 ? fmtPaceFromMps((avgDownhill * 1000) / 3600) : null
  return (
    <Card style={{ marginBottom: 16 }}>
      <CLabel>PROFIL ATHLÈTE — SÉANCE</CLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        {avgVAM != null && vamLvl ? (
          <View><Text style={{ fontSize: 22, fontWeight: '700', color: vamLvl.c }}>{avgVAM}</Text><SLbl>VAM moy. montée</SLbl><Text style={{ fontSize: 8, color: colors.text3, marginTop: 2 }}>{vamLvl.l} · max {maxVAM} m/h</Text></View>
        ) : null}
        {avgRecovery != null && recovLvl ? (
          <View><Text style={{ fontSize: 22, fontWeight: '700', color: recovLvl.c }}>{avgRecovery}</Text><SLbl>Récup FC · bpm/min</SLbl><Text style={{ fontSize: 8, color: colors.text3, marginTop: 2 }}>{recovLvl.l}</Text></View>
        ) : null}
        {downhillPace ? (
          <View><Text style={{ fontSize: 22, fontWeight: '700', color: colors.text2 }}>{downhillPace}</Text><SLbl>Allure moy. descente</SLbl></View>
        ) : null}
        <View><Text style={{ fontSize: 22, fontWeight: '700', color: colors.text2 }}>{uphillSections.length}</Text><SLbl>Montées analysées</SLbl></View>
      </View>
      {avgVAM != null ? (
        <Text style={{ fontSize: 12, color: colors.text2, lineHeight: 20 }}>
          <Text style={{ fontWeight: '700' }}>Grimpeur :</Text> VAM {avgVAM} m/h — {VAM_BAND_LABEL[vamBand(avgVAM)]}.
          {avgRecovery != null && recovLvl ? `\nRécupération cardio : −${avgRecovery} bpm/min post-montée — ${avgRecovery > 25 ? 'excellente capacité.' : avgRecovery > 15 ? 'capacité correcte.' : 'à travailler — programme Récup dans Renfo.'}` : ''}
        </Text>
      ) : null}
    </Card>
  )
}

// ─── Qualité de séance ────────────────────────────────────────────────────────
function SessionQCard({ activity, streams, fcMax }: { activity: ActivityDetail; streams: StreamData | undefined; fcMax: number }) {
  const data = buildSessionInsights(activity as never, streams ?? {}, fcMax)
  const { type, drift, insights, hasHR } = data
  const decoupling = streams ? computeDecoupling(streams) : null
  const durabThirds = streams ? computeDurabilityThirds(streams) : null
  const DURABILITY_COLOR: Record<DurabilityStatus, string> = { strong: colors.growth, moderate: colors.amber, deficit: colors.ember, unknown: colors.text3 }
  if (!hasHR && insights.length === 0 && !drift && !decoupling) return null
  const driftColor = drift && drift.driftPct > 10 ? colors.ember : drift && drift.driftPct > 5 ? colors.amber : colors.growth
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <CLabel style={{ marginBottom: 0 }}>QUALITÉ DE SÉANCE</CLabel>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3, backgroundColor: colors.surf2, color: colors.text2, overflow: 'hidden' }}>{type.toUpperCase()}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {drift != null && Math.abs(drift.driftPct) >= 3 ? (
          <View><Text style={{ fontSize: 20, fontWeight: '700', color: driftColor }}>{drift.driftPct > 0 ? '+' : ''}{drift.driftPct.toFixed(1)}%</Text><SLbl>Dérive FC</SLbl></View>
        ) : null}
        {decoupling != null ? (
          <View><Text style={{ fontSize: 20, fontWeight: '700', color: DURABILITY_COLOR[decoupling.status] }}>{decoupling.decouplingPct > 0 ? '+' : ''}{decoupling.decouplingPct.toFixed(1)}%</Text><SLbl>Découplage{decoupling.gapAdjusted ? ' GAP:FC' : ''}</SLbl></View>
        ) : null}
        {durabThirds != null ? (
          <View><Text style={{ fontSize: 20, fontWeight: '700', color: DURABILITY_COLOR[durabThirds.status] }}>{durabThirds.fadePct > 0 ? '−' : '+'}{Math.abs(durabThirds.fadePct).toFixed(1)}%</Text><SLbl>Durabilité (tiers)</SLbl></View>
        ) : null}
        {insights.map((ins) => (
          <View key={ins.key}><Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{ins.value}</Text><SLbl>{ins.key}</SLbl></View>
        ))}
        {hasHR && activity.average_heartrate ? (
          <View><Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{Math.round(activity.average_heartrate)} bpm</Text><SLbl>FC moy.</SLbl></View>
        ) : null}
      </View>
    </Card>
  )
}

// ─── Streams (profil + carte + VAM) ───────────────────────────────────────────
function StreamsSection({ streams }: { streams: StreamData }) {
  const [hoverKm, setHoverKm] = useState<number | null>(null)
  if (!streams || streams._authError || !streams.altitude?.data?.length) return null
  const time = streams.time?.data ?? [], dist = streams.distance?.data ?? [], alt = streams.altitude.data
  const hr = streams.heartrate?.data, latlng = streams.latlng?.data
  const raw: ChartPoint[] = []
  for (let i = 0; i < alt.length; i++) { if (dist[i] == null) continue; raw.push({ distKm: dist[i] / 1000, altM: alt[i], hrBpm: hr ? hr[i] : null }) }
  const chartPts = downsample(raw, 300)
  const hasDist = dist.length > 0, hasLatlng = !!latlng && latlng.length > 5
  return (
    <>
      {hasDist ? (
        <Card style={{ marginBottom: 16 }}>
          <CLabel style={{ marginBottom: 8 }}>PROFIL ALTITUDE{hr ? '  + FC' : ''}</CLabel>
          <DualChart points={chartPts} onHoverKm={setHoverKm} />
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
            <Text style={{ fontSize: 9, color: colors.growth }}>■ Altitude (m)</Text>
            {hr ? <Text style={{ fontSize: 9, color: colors.ember }}>— FC (bpm)</Text> : null}
          </View>
        </Card>
      ) : null}
      {hasLatlng ? (
        <Card style={{ marginBottom: 16 }}>
          <CLabel style={{ marginBottom: 8 }}>TRACÉ GPS</CLabel>
          <RouteMap latlng={latlng!} hoverKm={hoverKm} distArr={dist} />
        </Card>
      ) : null}
      {hasDist && time.length > 0 ? <VamSectionsCard dist={dist} alt={alt} time={time} /> : null}
    </>
  )
}

// ─── Écran principal ──────────────────────────────────────────────────────────
const RUN_SET = ['Run', 'TrailRun', 'Trail Run', 'VirtualRun']

export default function ActivityDetailScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const router = useRouter()
  const [shareOpen, setShareOpen] = useState(false)

  const [fcMax, setFcMax] = useState(185)
  const [activity, setActivity] = useState<ActivityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [recent, setRecent] = useState<RecentActivity[]>([])
  const [streams, setStreams] = useState<StreamData | undefined>(undefined)
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [savingRace, setSavingRace] = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('fc_max').eq('id', userId).single().then(({ data }) => { if (data?.fc_max) setFcMax(data.fc_max) })
  }, [userId])

  useEffect(() => {
    if (!activityId) return
    setLoading(true); setError(false)
    supabase.from('strava_activities')
      .select('id,strava_activity_id,name,distance,total_elevation_gain,moving_time,elapsed_time,start_date,start_date_local,type,sport_type,average_heartrate,max_heartrate,average_speed,max_speed,suffer_score,is_race,kudos_count:raw_data->kudos_count,average_temp:raw_data->average_temp')
      .eq('id', activityId).single()
      .then(({ data, error: err }) => { if (err || !data) setError(true); else setActivity(data as ActivityDetail); setLoading(false) })
  }, [activityId])

  // Contexte récent (90 j) pour débrief / lecture.
  useEffect(() => {
    if (!activity) return
    const actDate = new Date(activity.start_date)
    const cutoff = new Date(actDate); cutoff.setDate(actDate.getDate() - 90)
    supabase.from('strava_activities')
      .select('id,distance,total_elevation_gain,moving_time,start_date,type,sport_type,average_heartrate,average_speed')
      .gte('start_date', cutoff.toISOString().slice(0, 10)).lte('start_date', activity.start_date)
      .order('start_date', { ascending: false })
      .then(({ data }) => setRecent((data ?? []) as RecentActivity[]))
  }, [activity])

  // Streams.
  const stravaId = activity?.strava_activity_id != null ? String(activity.strava_activity_id) : undefined
  useEffect(() => {
    if (!stravaId) return
    fetchStreams(stravaId).then(setStreams).catch(() => setStreams(undefined))
  }, [stravaId])

  // Météo historique (Open-Meteo), cachée pour le profil.
  useEffect(() => {
    const start = streams?.latlng?.data?.[0]
    if (!start || !activity) return
    fetchActivityWeather(start[0], start[1], activity.start_date_local ?? activity.start_date).then((result) => {
      setWeather(result)
      if (result && activity.strava_activity_id && userId) {
        supabase.from('activity_weather').upsert({
          user_id: userId, activity_id: Number(activity.strava_activity_id),
          temp: result.temp, wind: result.wind, precip: result.precip, cached_at: new Date().toISOString(),
        }, { onConflict: 'user_id,activity_id' }).then(() => {})
      }
    }).catch(() => {})
  }, [streams, activity, userId])

  async function toggleRace() {
    if (!activity || !activityId) return
    setSavingRace(true)
    const next = !activity.is_race
    await supabase.from('strava_activities').update({ is_race: next }).eq('id', activityId)
    setActivity((a) => (a ? { ...a, is_race: next } : a))
    setSavingRace(false)
  }

  const back = <BackLink label="← Activités" onPress={() => router.push('/activities')} />

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}><View style={{ padding: space.lg }}>{back}</View><BrandedLoader /></SafeAreaView>
  }
  if (error || !activity) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}><ScrollView contentContainerStyle={{ padding: space.lg }}>{back}<Text style={{ color: colors.text3, fontSize: 13 }}>Activité introuvable.</Text></ScrollView></SafeAreaView>
  }

  const load = computeActivityLoad(activity as never, fcMax)
  const paceStr = fmtPace(activity.distance, activity.moving_time)
  const dpKm = activity.distance > 0 ? (activity.total_elevation_gain ?? 0) / (activity.distance / 1000) : 0
  const hrData = streams?.heartrate?.data ?? []
  const isRun = RUN_SET.includes(activity.sport_type ?? activity.type)

  const metrics = [
    { label: 'D+/km', val: `${dpKm.toFixed(0)} m/km` },
    { label: 'Allure max', val: fmtPaceFromMps(activity.max_speed) },
    { label: 'Temps total', val: activity.elapsed_time ? fmtTime(activity.elapsed_time) : '—' },
    { label: 'FC max', val: activity.max_heartrate ? `${Math.round(activity.max_heartrate)} bpm` : '—' },
    { label: 'Suffer score', val: activity.suffer_score != null ? String(activity.suffer_score) : '—' },
  ]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        {back}

        {/* Header */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 26, lineHeight: 29, color: colors.text, marginBottom: 6, fontWeight: '700' }}>{activity.name}</Text>
          <Text style={{ fontSize: 11, color: colors.text3 }}>{fmtDate(activity.start_date_local ?? activity.start_date)} · {activity.sport_type ?? activity.type}</Text>
          {activity.description ? <Text style={{ fontSize: 12.5, color: colors.text3, marginTop: 8 }}>{activity.description}</Text> : null}
          {isRun ? (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable onPress={toggleRace} disabled={savingRace}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1,
                    borderColor: activity.is_race ? colors.ember : colors.line, backgroundColor: activity.is_race ? 'rgba(214,128,62,0.16)' : colors.surf }}>
                  <Text style={{ fontSize: 12, letterSpacing: 0.48, color: activity.is_race ? colors.ember : colors.text2 }}>{activity.is_race ? '★ Course — référence d’allure' : '☆ Marquer comme course'}</Text>
                </Pressable>
                <Pressable onPress={() => setShareOpen(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf }}>
                  <Text style={{ fontSize: 12, letterSpacing: 0.48, color: colors.text2 }}>↗ Partager</Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 11, color: colors.text3, marginTop: 6, maxWidth: 460 }}>
                {activity.is_race ? 'Cet effort sert de référence pour caler l’allure de tes projections de course.' : 'Marque une course (ou un effort à fond) pour que tes projections soient calées sur ton allure de course, pas d’entraînement.'}
              </Text>
            </View>
          ) : null}
        </View>

        {shareOpen ? (
          <ShareStickers
            data={{ movingTimeS: activity.moving_time, distanceM: activity.distance, dplusM: activity.total_elevation_gain ?? 0, latlng: streams?.latlng?.data, altitude: streams?.altitude?.data, distance: streams?.distance?.data }}
            onClose={() => setShareOpen(false)}
          />
        ) : null}

        {/* Stats strip */}
        <View style={{ flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.line, marginBottom: 16 }}>
          {[
            { v: fmtKm(activity.distance), l: 'KM' },
            { v: fmtTime(activity.moving_time), l: 'Temps' },
            { v: paceStr, l: 'Allure' },
            { v: `+${Math.round(activity.total_elevation_gain ?? 0)}`, l: 'D+' },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: colors.surf, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', marginRight: i < 3 ? 1 : 0 }}>
              <SVal style={{ fontSize: 18 }}>{s.v}</SVal>
              <SLbl>{s.l}</SLbl>
            </View>
          ))}
        </View>

        <SessionDebriefCard activity={activity} fcMax={fcMax} recentRuns={recent} />
        <FcZonesCard hrData={hrData} fcMax={fcMax} />
        <SessionSummaryCard activity={activity} hrData={hrData} fcMax={fcMax} recentRuns={recent} />
        <RaceContextCard activity={activity} weather={mergeStravaTemp(activity.average_temp, weather)} />

        {streams ? <StreamsSection streams={streams} /> : null}
        {streams ? <AthleteProfileCard streams={streams} /> : null}
        <SessionQCard activity={activity} streams={streams} fcMax={fcMax} />

        {/* Métriques */}
        <Card style={{ marginBottom: 16 }}>
          <CLabel>MÉTRIQUES</CLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {metrics.map((m) => (
              <View key={m.label} style={{ width: '50%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={{ fontSize: 10.5, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.47 }}>{m.label}</Text>
                <Text style={{ fontSize: 10.5, color: colors.text, textTransform: 'uppercase', letterSpacing: 1.47 }}>{m.val}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Charge TRIMP */}
        <Card style={{ marginBottom: 24 }}>
          <CLabel style={{ marginBottom: 8 }}>CHARGE TRIMP</CLabel>
          <SVal style={{ color: load > 200 ? colors.ember : load > 100 ? colors.amber : colors.growth }}>{load}</SVal>
          <Text style={{ fontSize: 10.5, color: colors.text3, marginTop: 4 }}>Durée × intensité × dénivelé × type</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
