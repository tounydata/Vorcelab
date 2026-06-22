import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import Svg, { Defs, LinearGradient, Stop, Line, Path, Polyline, Polygon } from 'react-native-svg'
import type { ProjectionResult } from '@/lib/computeRaceProjection'
import { findRaceActivity, toActivityLite, type ActivityLite } from '@/lib/raceComparison'
import { computeRaceDebrief, INCIDENTS, VAM_BAND_LABEL, type RaceDebrief, type DebriefPoint, type RaceAnnotation, type IncidentLabel } from '@/lib/raceDebrief'
import { fetchStreams, type StreamData } from '@/lib/streams'
import { fmtHM } from '@/lib/raceStrategyView'
import { Card, CLabel, MLabel, HButton, colors, radius } from '@/components/coach/ui'

const SLOWER = colors.ember2, FASTER = colors.growth

// INCIDENTS.color contient des var() CSS → on mappe vers les tokens natifs.
const INCIDENT_COLOR: Record<IncidentLabel, string> = {
  chute: colors.ember2, crampe: colors.ember, ravito: colors.growth, hydratation: '#3B82F6', douleur: colors.amber, autre: colors.text2,
}

interface Props {
  projection: ProjectionResult
  activities: Record<string, unknown>[]
  resultActivityId: string | null
  raceDateISO: string
  fcMax?: number | null
  annotations?: RaceAnnotation[]
  onChangeAnnotations?: (next: RaceAnnotation[]) => void
  ravitos?: { km: number; label?: string }[]
  onLink: (activityId: string) => void
  onUnlink: () => void
}

function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}'${String(sec).padStart(2, '0')}`
}
function fmtPace(sPerKm: number): string { const s = Math.max(0, Math.round(sPerKm)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
function fmtDelta(deltaS: number): string {
  const sign = deltaS >= 0 ? '+' : '−'
  const t = Math.round(Math.abs(deltaS)), m = Math.floor(t / 60), s = t % 60
  return m > 0 ? `${sign}${m} min ${String(s).padStart(2, '0')}` : `${sign}${s} s`
}
const FR_MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
function fmtDate(iso: string) { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')} ${FR_MON[d.getMonth()]}` }

export default function RaceResult({ projection, activities, resultActivityId, raceDateISO, fcMax, annotations = [], onChangeAnnotations, ravitos = [], onLink, onUnlink }: Props) {
  const [picking, setPicking] = useState(false)
  const runChoices = useMemo<ActivityLite[]>(() => {
    const raceDay = new Date(raceDateISO).getTime()
    return activities.map(toActivityLite).filter((a) => {
      if (!a.start_date) return false
      const kind = a.sport_type || a.type || ''
      if (!['Run', 'TrailRun', 'VirtualRun'].includes(kind)) return false
      return Math.abs(new Date(a.start_date).getTime() - raceDay) / 86_400_000 <= 7
    }).sort((a, b) => new Date(b.start_date!).getTime() - new Date(a.start_date!).getTime())
  }, [activities, raceDateISO])
  const linked = useMemo<ActivityLite | null>(() => {
    if (!resultActivityId) return null
    const row = activities.find((a) => String((a as { id?: unknown }).id) === resultActivityId)
    return row ? toActivityLite(row) : null
  }, [activities, resultActivityId])
  const suggestion = useMemo(() => (resultActivityId ? null : findRaceActivity(activities, raceDateISO, projection.totalDistM)), [activities, raceDateISO, projection.totalDistM, resultActivityId])

  if (!linked) {
    return (
      <Card style={{ padding: 20 }}>
        <CLabel style={{ marginBottom: 10 }}>DÉBRIEF DE COURSE</CLabel>
        {suggestion && !picking ? (
          <>
            <MLabel style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>On dirait que tu as couru cette course. C'est bien elle ?</MLabel>
            <ActivityRow a={suggestion} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <HButton label="Oui — analyser ma course" onPress={() => onLink(suggestion.id)} style={{ backgroundColor: colors.ember, borderColor: colors.ember }} textStyle={{ color: colors.bg }} />
              <HButton label="Choisir une autre" onPress={() => setPicking(true)} />
            </View>
          </>
        ) : (
          <>
            <MLabel style={{ marginBottom: 12, textTransform: 'none', letterSpacing: 0 }}>{runChoices.length ? "Associe l'activité Strava de ta course pour le débrief complet." : 'Aucune sortie course à pied trouvée autour de la date de la course.'}</MLabel>
            {runChoices.length > 0 ? (
              <View style={{ gap: 8 }}>
                {runChoices.map((a) => (
                  <Pressable key={a.id} onPress={() => onLink(a.id)} style={{ backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: 10 }}>
                    <ActivityRow a={a} compact />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {suggestion ? <HButton label="← Revenir à la suggestion" onPress={() => setPicking(false)} style={{ marginTop: 12, alignSelf: 'flex-start' }} /> : null}
          </>
        )}
      </Card>
    )
  }
  return <Debrief projection={projection} activity={linked} fcMax={fcMax} annotations={annotations} onChangeAnnotations={onChangeAnnotations} ravitos={ravitos} onUnlink={onUnlink} />
}

function ActivityRow({ a, compact }: { a: ActivityLite; compact?: boolean }) {
  const km = a.distance != null ? (a.distance / 1000).toFixed(1) : '—'
  const time = a.moving_time != null ? fmtClock(a.moving_time) : (a.elapsed_time != null ? fmtClock(a.elapsed_time) : '—')
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: '600', fontSize: compact ? 14 : 16, color: colors.text }} numberOfLines={1}>{a.name || 'Sortie'}</Text>
        <Text style={{ fontSize: 11, color: colors.text3 }}>{a.start_date ? fmtDate(a.start_date) : '—'} · {km} km{a.total_elevation_gain != null ? ` · ↑${Math.round(a.total_elevation_gain)} m` : ''}</Text>
      </View>
      <Text style={{ fontSize: compact ? 15 : 17, fontWeight: '700', color: colors.text }}>{time}</Text>
    </View>
  )
}

function Debrief({ projection, activity, fcMax, annotations = [], onChangeAnnotations, ravitos = [], onUnlink }: { projection: ProjectionResult; activity: ActivityLite; fcMax?: number | null; annotations?: RaceAnnotation[]; onChangeAnnotations?: (next: RaceAnnotation[]) => void; ravitos?: { km: number; label?: string }[]; onUnlink: () => void }) {
  const streamId = activity.stravaActivityId
  const [stream, setStream] = useState<StreamData | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!streamId) { setLoading(false); return }
    setLoading(true)
    fetchStreams(streamId).then((s) => setStream(s)).catch(() => setStream(undefined)).finally(() => setLoading(false))
  }, [streamId])
  const ravitoKms = useMemo(() => ravitos.map((r) => r.km), [ravitos])
  const d = useMemo(() => (stream ? computeRaceDebrief(projection, stream, fcMax, { movingTimeS: activity.moving_time, elapsedTimeS: activity.elapsed_time, ravitoKms, annotations }) : null), [projection, stream, fcMax, activity.moving_time, activity.elapsed_time, ravitoKms, annotations])

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <CLabel style={{ marginBottom: 0 }}>DÉBRIEF DE COURSE</CLabel>
        <HButton label="Délier" onPress={onUnlink} style={{ paddingVertical: 5, paddingHorizontal: 10 }} />
      </View>
      {loading ? <Card><MLabel>Analyse de ta course…</MLabel></Card> : null}
      {!loading && !d ? <Card><MLabel style={{ textTransform: 'none', letterSpacing: 0 }}>Impossible de lire le détail de l'activité (streams indisponibles). Réessaie plus tard.</MLabel></Card> : null}
      {d ? (
        <>
          <VerdictBlock d={d} />
          <PaceProfileCard d={d} annotations={annotations} />
          {(d.stoppedS >= 30 || annotations.length > 0) ? <IncidentsBlock d={d} annotations={annotations} ravitos={ravitos} onChange={onChangeAnnotations} /> : null}
          <PacingBlock d={d} />
          {d.hasHR ? <CardiacBlock d={d} /> : null}
          {d.terrain.length > 0 ? <TerrainBlock d={d} /> : null}
          <BenchBlock d={d} />
          <TakeawaysBlock d={d} />
          <ProfileLoopBlock d={d} />
          <Text style={{ fontSize: 10.5, color: colors.text3, textAlign: 'center' }}>D'après {activity.name || 'ton activité'} · {activity.distance != null ? (activity.distance / 1000).toFixed(1) : '—'} km</Text>
        </>
      ) : null}
    </View>
  )
}

function VerdictBlock({ d }: { d: RaceDebrief }) {
  const scoreColor = d.executionScore >= 85 ? FASTER : d.executionScore >= 70 ? colors.growth : d.executionScore >= 55 ? colors.amber : SLOWER
  const deltaColor = d.deltaS <= 0 ? FASTER : SLOWER
  return (
    <Card style={{ padding: 20, borderTopWidth: 3, borderTopColor: scoreColor }}>
      <Text style={{ fontSize: 15, color: colors.text, lineHeight: 22, fontWeight: '600', marginBottom: 18 }}>{d.verdict}</Text>
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.surf2, borderRadius: radius.sm, padding: 14 }}>
          <MLabel style={{ marginBottom: 6 }}>RÉSULTAT</MLabel>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 32, color: colors.text, fontWeight: '700' }}>{fmtHM(d.actualTotalS / 60)}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: deltaColor }}>{fmtDelta(d.deltaS)}</Text>
          </View>
          <Text style={{ fontSize: 10.5, color: colors.text3, marginTop: 4 }}>projeté {fmtHM(d.projTotalS / 60)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.surf2, borderRadius: radius.sm, padding: 14 }}>
          <MLabel style={{ marginBottom: 6 }}>EXÉCUTION</MLabel>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ fontSize: 32, color: scoreColor, fontWeight: '700' }}>{d.executionScore}</Text>
            <Text style={{ fontSize: 13, color: colors.text2 }}>/100 · {d.executionLabel}</Text>
          </View>
          <View style={{ height: 5, borderRadius: 999, backgroundColor: colors.line, marginTop: 10, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${d.executionScore}%`, backgroundColor: scoreColor, borderRadius: 999 }} />
          </View>
        </View>
        {d.stoppedS >= 30 ? (
          <View style={{ flex: 1, minWidth: 150, backgroundColor: colors.surf2, borderRadius: radius.sm, padding: 14 }}>
            <MLabel style={{ marginBottom: 6 }}>EN MOUVEMENT</MLabel>
            <Text style={{ fontSize: 32, color: colors.text, fontWeight: '700' }}>{fmtHM(d.movingS / 60)}</Text>
            <Text style={{ fontSize: 10.5, color: colors.amber, marginTop: 4 }}>{d.stopCount > 0 ? `${d.stopCount} arrêt${d.stopCount > 1 ? 's' : ''}` : 'Arrêts'} · {fmtClock(d.stoppedS)} à l'arrêt</Text>
          </View>
        ) : null}
      </View>
    </Card>
  )
}

function PaceProfileCard({ d, annotations = [] }: { d: RaceDebrief; annotations?: RaceAnnotation[] }) {
  const totalKm = d.points.length ? d.points[d.points.length - 1].km : 1
  const W = 1000, PH = 150, EH = 64
  const x = (km: number) => (km / totalKm) * W
  const yPace = (p: number) => 10 + ((Math.min(Math.max(p, d.paceLoS), d.paceHiS) - d.paceLoS) / Math.max(1, d.paceHiS - d.paceLoS)) * (PH - 20)
  const yAlt = (a: number) => (EH - 6) - ((a - d.altMin) / Math.max(1, d.altMax - d.altMin)) * (EH - 12)
  const pts = d.points.filter((p): p is DebriefPoint & { actualPaceS: number; projPaceS: number } => p.actualPaceS != null && p.projPaceS != null)
  const fills = pts.slice(1).map((p, i) => {
    const a0 = pts[i], a1 = p
    const ahead = (a0.actualPaceS + a1.actualPaceS) / 2 <= (a0.projPaceS + a1.projPaceS) / 2
    const poly = `${x(a0.km)},${yPace(a0.projPaceS)} ${x(a1.km)},${yPace(a1.projPaceS)} ${x(a1.km)},${yPace(a1.actualPaceS)} ${x(a0.km)},${yPace(a0.actualPaceS)}`
    return { poly, color: ahead ? FASTER : SLOWER }
  })
  const actualLine = pts.map((p) => `${x(p.km)},${yPace(p.actualPaceS)}`).join(' ')
  const projLine = pts.map((p) => `${x(p.km)},${yPace(p.projPaceS)}`).join(' ')
  const altPts = d.points.filter((p): p is DebriefPoint & { alt: number } => p.alt != null)
  const altLine = altPts.map((p) => `${x(p.km)},${yAlt(p.alt)}`).join(' ')
  const altArea = altPts.length ? `M${altPts.map((p) => `${x(p.km)},${yAlt(p.alt)}`).join(' L')} L${x(altPts[altPts.length - 1].km)},${EH} L${x(altPts[0].km)},${EH} Z` : ''
  const thirds = [totalKm / 3, (2 * totalKm) / 3]
  return (
    <Card style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <CLabel style={{ marginBottom: 0 }}>ALLURE · PRÉVU vs RÉEL</CLabel>
        <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
          <Legend c={FASTER} label="devant le plan" /><Legend c={SLOWER} label="derrière" />
          {d.stops.length > 0 ? <Legend c={colors.amber} label="arrêt" /> : null}
        </View>
      </View>
      <Svg viewBox={`0 0 ${W} ${PH}`} preserveAspectRatio="none" width="100%" height={150}>
        {thirds.map((k, i) => <Line key={i} x1={x(k)} y1={0} x2={x(k)} y2={PH} stroke={colors.line} strokeWidth={1} />)}
        {fills.map((f, i) => <Polygon key={i} points={f.poly} fill={f.color} opacity={0.22} />)}
        <Polyline points={projLine} fill="none" stroke={colors.text3} strokeWidth={1.5} strokeDasharray="5 4" />
        <Polyline points={actualLine} fill="none" stroke={colors.text} strokeWidth={2.2} strokeLinejoin="round" />
        {d.stops.map((s, i) => (s.startKm <= totalKm && !annotations.some((a) => Math.abs(a.km - s.startKm) < 0.3) ? (
          <Line key={`stop${i}`} x1={x(s.startKm)} y1={0} x2={x(s.startKm)} y2={PH} stroke={s.isRavito ? INCIDENT_COLOR.ravito : colors.amber} strokeWidth={1.3} strokeDasharray={s.isRavito ? undefined : '2 3'} opacity={0.85} />
        ) : null))}
        {annotations.map((a, i) => (a.km <= totalKm ? <Line key={`an${i}`} x1={x(a.km)} y1={0} x2={x(a.km)} y2={PH} stroke={INCIDENT_COLOR[a.label]} strokeWidth={1.6} opacity={0.9} /> : null))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: 9, color: colors.text3 }}>rapide ↑ {fmtPace(d.paceLoS)}/km</Text>
        <Text style={{ fontSize: 9, color: colors.text3 }}>réel ⎯ · projeté ┄</Text>
      </View>
      <Svg viewBox={`0 0 ${W} ${EH}`} preserveAspectRatio="none" width="100%" height={64} style={{ marginTop: 6 }}>
        <Defs><LinearGradient id="dbg-alt" x1="0" x2="0" y1="0" y2="1"><Stop offset="0" stopColor={colors.ember} stopOpacity={0.28} /><Stop offset="1" stopColor={colors.ember} stopOpacity={0.02} /></LinearGradient></Defs>
        {altArea ? <Path d={altArea} fill="url(#dbg-alt)" /> : null}
        {altLine ? <Polyline points={altLine} fill="none" stroke={colors.ember} strokeWidth={1.4} opacity={0.7} /> : null}
        {thirds.map((k, i) => <Line key={i} x1={x(k)} y1={0} x2={x(k)} y2={EH} stroke={colors.line} strokeWidth={1} />)}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ fontSize: 9, color: colors.text3 }}>km 0</Text>
        <Text style={{ fontSize: 9, color: colors.text3 }}>profil · {Math.round(d.altMax - d.altMin)} m d'amplitude</Text>
        <Text style={{ fontSize: 9, color: colors.text3 }}>km {totalKm.toFixed(0)}</Text>
      </View>
    </Card>
  )
}

const INCIDENT_KEYS: IncidentLabel[] = ['chute', 'crampe', 'ravito', 'hydratation', 'douleur', 'autre']

function IncidentsBlock({ d, annotations, ravitos = [], onChange }: { d: RaceDebrief; annotations: RaceAnnotation[]; ravitos?: { km: number; label?: string }[]; onChange?: (next: RaceAnnotation[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [addKm, setAddKm] = useState('')
  const [addLabel, setAddLabel] = useState<IncidentLabel>('chute')
  const annNear = (km: number) => annotations.find((a) => Math.abs(a.km - km) < 0.3)
  const ravitoName = (km: number) => ravitos.find((r) => Math.abs(r.km - km) < 0.3)?.label
  function tagStop(km: number, label: IncidentLabel | '') {
    if (!onChange) return
    const rest = annotations.filter((a) => Math.abs(a.km - km) >= 0.3)
    onChange(label ? [...rest, { km: +km.toFixed(1), label }] : rest)
  }
  function removeAnn(km: number) { onChange?.(annotations.filter((a) => a.km !== km)) }
  function addManual() {
    const km = parseFloat(addKm.replace(',', '.'))
    if (!onChange || !Number.isFinite(km)) return
    onChange([...annotations, { km: +km.toFixed(1), label: addLabel }])
    setAddKm(''); setAdding(false)
  }
  const manualOnly = annotations.filter((a) => !d.stops.some((s) => Math.abs(s.startKm - a.km) < 0.3))

  return (
    <Card style={{ padding: 16 }}>
      <CLabel style={{ marginBottom: 4 }}>ÉTIQUETER LES ARRÊTS</CLabel>
      <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 18, marginBottom: 14 }}>Pose un motif sur chaque arrêt — avec ou sans pause de la montre. Ton débrief raconte alors ta vraie course.</Text>
      <View style={{ gap: 12 }}>
        {d.stops.map((s, i) => {
          const cur = annNear(s.startKm)
          const autoRavito = !cur && s.isRavito
          const eff: IncidentLabel | '' = cur?.label ?? (s.isRavito ? 'ravito' : '')
          const dotColor = cur ? INCIDENT_COLOR[cur.label] : s.isRavito ? INCIDENT_COLOR.ravito : colors.amber
          return (
            <View key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: dotColor }} />
                <Text style={{ fontSize: 12, color: colors.text }}>km {s.startKm.toFixed(1)}</Text>
                <Text style={{ fontSize: 11, color: colors.text3 }}>· {fmtClock(s.durationS)}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {INCIDENT_KEYS.map((k) => {
                  const on = eff === k
                  return (
                    <Pressable key={k} onPress={() => onChange && tagStop(s.startKm, on ? '' : k)} disabled={!onChange}
                      style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1, borderColor: on ? INCIDENT_COLOR[k] : colors.line, backgroundColor: on ? `${INCIDENT_COLOR[k]}22` : colors.surf2 }}>
                      <Text style={{ fontSize: 10.5, color: on ? INCIDENT_COLOR[k] : colors.text2 }}>{INCIDENTS[k].fr}</Text>
                    </Pressable>
                  )
                })}
              </View>
              {autoRavito ? <Text style={{ fontSize: 10, color: INCIDENT_COLOR.ravito, marginTop: 3, marginLeft: 17 }}>Ravito connu{ravitoName(s.startKm) ? ` : ${ravitoName(s.startKm)}` : ''} · reconnu automatiquement</Text> : null}
            </View>
          )
        })}
        {manualOnly.map((a, i) => (
          <View key={`m${i}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: INCIDENT_COLOR[a.label] }} />
              <Text style={{ fontSize: 12, color: colors.text }}>km {a.km.toFixed(1)}</Text>
              <Text style={{ fontSize: 11, color: INCIDENT_COLOR[a.label] }}>· {INCIDENTS[a.label].fr}</Text>
            </View>
            {onChange ? <HButton label="Retirer" onPress={() => removeAnn(a.km)} style={{ paddingVertical: 4, paddingHorizontal: 9 }} /> : null}
          </View>
        ))}
      </View>
      {onChange ? (adding ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <TextInput value={addKm} onChangeText={setAddKm} keyboardType="decimal-pad" placeholder="km" placeholderTextColor={colors.text3}
            style={{ width: 64, backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: 6, color: colors.text, fontSize: 12, paddingVertical: 6, paddingHorizontal: 8 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {INCIDENT_KEYS.map((k) => (
              <Pressable key={k} onPress={() => setAddLabel(k)} style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: addLabel === k ? INCIDENT_COLOR[k] : colors.line, backgroundColor: colors.surf2 }}>
                <Text style={{ fontSize: 10, color: addLabel === k ? INCIDENT_COLOR[k] : colors.text2 }}>{INCIDENTS[k].fr}</Text>
              </Pressable>
            ))}
          </View>
          <HButton label="Ajouter" onPress={addManual} style={{ backgroundColor: colors.ember, borderColor: colors.ember }} textStyle={{ color: colors.bg }} />
          <HButton label="Annuler" onPress={() => { setAdding(false); setAddKm('') }} />
        </View>
      ) : (
        <HButton label="+ Ajouter un incident (chute, pause non détectée…)" onPress={() => setAdding(true)} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
      )) : null}
    </Card>
  )
}

function PacingBlock({ d }: { d: RaceDebrief }) {
  const maxPace = Math.max(...d.thirds.map((t) => t.actualPaceS), 1)
  return (
    <Card style={{ padding: 16 }}>
      <CLabel style={{ marginBottom: 4 }}>PACING</CLabel>
      <Text style={{ fontSize: 13, color: colors.text2, lineHeight: 18, marginBottom: 14 }}>{d.splitVerdict}</Text>
      <View style={{ gap: 10 }}>
        {d.thirds.map((t, i) => {
          const slower = t.deltaS > 1
          const c = slower ? SLOWER : FASTER
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ width: 58, fontSize: 11, color: colors.text2, fontWeight: '600' }}>{t.label}</Text>
              <View style={{ flex: 1, height: 16, backgroundColor: colors.surf2, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${(t.actualPaceS / maxPace) * 100}%`, backgroundColor: c, opacity: 0.8, borderRadius: 4 }} />
                <Text style={{ marginLeft: 8, fontSize: 10.5, color: colors.text, fontWeight: '700' }}>{fmtPace(t.actualPaceS)}/km</Text>
              </View>
              <Text style={{ width: 92, fontSize: 11, color: c, fontWeight: '700', textAlign: 'right' }}>{fmtDelta(t.deltaS)}</Text>
            </View>
          )
        })}
      </View>
    </Card>
  )
}

function CardiacBlock({ d }: { d: RaceDebrief }) {
  const ZONE_COLORS = ['#5da084', '#7bb37a', '#d4a843', '#d6803e', '#d1583a']
  const drift = d.decouplingPct
  const driftColor = drift == null ? colors.text2 : drift < 5 ? FASTER : drift < 10 ? colors.amber : SLOWER
  const driftWord = drift == null ? '—' : drift < 5 ? 'maîtrisé' : drift < 10 ? 'modéré' : 'élevé'
  const fade = d.durabilityFadePct
  const fadeColor = d.durabilityBand === 'solid' ? FASTER : d.durabilityBand === 'moderate' ? colors.amber : SLOWER
  const fadeWord = d.durabilityBand === 'solid' ? 'solide' : d.durabilityBand === 'moderate' ? 'modérée' : 'à renforcer'
  return (
    <Card style={{ padding: 16 }}>
      <CLabel style={{ marginBottom: 12 }}>EFFORT CARDIAQUE</CLabel>
      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', marginBottom: d.zones ? 14 : 0 }}>
        <Stat label="FC MOY." value={d.avgHR != null ? `${d.avgHR}` : '—'} unit="bpm" />
        <Stat label="FC MAX" value={d.maxHR != null ? `${d.maxHR}` : '—'} unit="bpm" />
        <Stat label={d.decouplingGapAdjusted ? 'DÉRIVE GAP:FC' : 'DÉRIVE H1→H2'} value={drift != null ? `${drift >= 0 ? '+' : ''}${drift.toFixed(0)}%` : '—'} unit={driftWord} color={driftColor} />
        {fade != null ? <Stat label="DURABILITÉ" value={`${fade > 0 ? '−' : '+'}${Math.abs(fade).toFixed(0)}%`} unit={fadeWord} color={fadeColor} /> : null}
      </View>
      {drift != null ? (
        <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 18, marginBottom: d.zones ? 14 : 0 }}>
          {drift < 5 ? 'Allure et fréquence cardiaque restées couplées : endurance solide sur la durée.' : drift < 10 ? "Légère dérive en 2ᵉ moitié — l'effort a coûté un peu plus cher sur la fin." : 'Forte dérive : à allure égale, ta FC a grimpé — signe de fatigue, chaleur ou nutrition à revoir.'}
          {d.decouplingGapAdjusted ? ' Dérive ajustée à la pente (GAP:FC), donc interprétable malgré le dénivelé.' : ''}
          {d.hrDriftPredicted ? " La projection l'avait anticipé." : ''}
        </Text>
      ) : null}
      {d.zones ? (
        <View>
          <View style={{ flexDirection: 'row', height: 12, borderRadius: 4, overflow: 'hidden' }}>
            {d.zones.map((z) => (z.pct > 0 ? <View key={z.z} style={{ width: `${z.pct}%`, backgroundColor: ZONE_COLORS[z.z - 1] }} /> : null))}
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {d.zones.map((z) => (z.pct >= 8 ? <Text key={z.z} style={{ fontSize: 10, color: colors.text3 }}><Text style={{ color: ZONE_COLORS[z.z - 1] }}>■</Text> Z{z.z} {z.pct}%</Text> : null))}
          </View>
        </View>
      ) : null}
    </Card>
  )
}

function TerrainBlock({ d }: { d: RaceDebrief }) {
  const oColor = (o: string) => (o === 'better' ? FASTER : o === 'worse' ? SLOWER : colors.text2)
  return (
    <Card style={{ padding: 16 }}>
      <CLabel style={{ marginBottom: 12 }}>BILAN TERRAIN</CLabel>
      <View style={{ gap: 12 }}>
        {d.terrain.map((t, i) => (
          <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: oColor(t.outcome), paddingLeft: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, flex: 1 }}>{t.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: oColor(t.outcome) }}>{fmtDelta(t.deltaS)}</Text>
            </View>
            <Text style={{ fontSize: 11, color: colors.text3, marginTop: 3 }}>{t.note}{t.actualVamMH != null && t.projVamMH != null ? ` · VAM ${t.actualVamMH} vs ${t.projVamMH} m/h prévue` : ''}{t.vamBand ? ` (${VAM_BAND_LABEL[t.vamBand]})` : ''}</Text>
          </View>
        ))}
        {d.descentFade === 'marked' ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: SLOWER, paddingLeft: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Fatigue de descente</Text>
            <Text style={{ fontSize: 11, color: colors.text3, marginTop: 3 }}>Tes descentes ont nettement ralenti en fin de course{d.eccLoadEq ? ` · charge excentrique ~${d.eccLoadEq} m éq.` : ''} — renfo excentrique + habituation descente avant la prochaine.</Text>
          </View>
        ) : null}
      </View>
    </Card>
  )
}

function BenchBlock({ d }: { d: RaceDebrief }) {
  const accColor = d.accuracyPct >= 97 ? FASTER : d.accuracyPct >= 92 ? colors.amber : colors.text2
  return (
    <Card style={{ padding: 16 }}>
      <CLabel style={{ marginBottom: 12 }}>LA PROJECTION AU BANC D'ESSAI</CLabel>
      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: 38, color: accColor, fontWeight: '700' }}>{d.accuracyPct.toFixed(1)}%</Text>
          <MLabel style={{ marginTop: 4 }}>DE PRÉCISION{d.stoppedS >= 30 ? ' · HORS ARRÊTS' : ''}</MLabel>
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 20 }}>Projeté <Text style={{ color: colors.text, fontWeight: '700' }}>{fmtHM(d.projTotalS / 60)}</Text></Text>
          {d.stoppedS >= 30 ? (
            <>
              <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 20 }}>En mouvement <Text style={{ color: colors.text, fontWeight: '700' }}>{fmtHM(d.movingS / 60)}</Text> <Text style={{ color: d.movingS - d.projTotalS <= 0 ? FASTER : SLOWER }}>({fmtDelta(d.movingS - d.projTotalS)})</Text></Text>
              <Text style={{ fontSize: 11, color: colors.text3 }}>Temps total {fmtHM(d.actualTotalS / 60)} · {fmtClock(d.stoppedS)} d'arrêts</Text>
            </>
          ) : (
            <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 20 }}>Réel <Text style={{ color: colors.text, fontWeight: '700' }}>{fmtHM(d.actualTotalS / 60)}</Text> <Text style={{ color: d.deltaS <= 0 ? FASTER : SLOWER }}>({fmtDelta(d.deltaS)})</Text></Text>
          )}
        </View>
      </View>
    </Card>
  )
}

function TakeawaysBlock({ d }: { d: RaceDebrief }) {
  const tone = (t: string) => (t === 'good' ? FASTER : t === 'work' ? colors.amber : colors.text2)
  return (
    <Card style={{ padding: 16 }}>
      <CLabel style={{ marginBottom: 12 }}>CE QU'IL FAUT EN RETENIR</CLabel>
      <View style={{ gap: 11 }}>
        {d.takeaways.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: `${tone(t.tone)}38`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ color: tone(t.tone), fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 }}>{t.text}</Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

function ProfileLoopBlock({ d }: { d: RaceDebrief }) {
  return (
    <Card style={{ padding: 16, borderTopWidth: 2, borderTopColor: colors.growth }}>
      <CLabel style={{ marginBottom: 6 }}>CE QUE TA COURSE APPREND AU COACH</CLabel>
      <Text style={{ fontSize: 12.5, color: colors.text2, lineHeight: 18, marginBottom: 12 }}>Ces mesures réelles affinent ton profil — ta prochaine projection sera plus juste.</Text>
      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        {d.raceVamMH != null ? <Stat label="VAM DE COURSE" value={`${d.raceVamMH}`} unit="m/h" /> : null}
        {d.decouplingPct != null ? <Stat label="ENDURANCE" value={d.decouplingPct < 8 ? 'Solide' : 'À renforcer'} unit={`dérive ${d.decouplingPct >= 0 ? '+' : ''}${d.decouplingPct.toFixed(0)}%`} /> : null}
        <Stat label="PACING" value={d.splitPct <= 2 ? 'Régulier' : 'Positif'} unit={`split ${d.splitPct >= 0 ? '+' : ''}${d.splitPct.toFixed(0)}%`} />
      </View>
    </Card>
  )
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <View>
      <MLabel style={{ marginBottom: 4 }}>{label}</MLabel>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
        <Text style={{ fontSize: 24, color: color ?? colors.text, fontWeight: '700' }}>{value}</Text>
        {unit ? <Text style={{ fontSize: 11, color: colors.text3 }}>{unit}</Text> : null}
      </View>
    </View>
  )
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c }} />
      <Text style={{ fontSize: 10, color: colors.text2 }}>{label}</Text>
    </View>
  )
}
