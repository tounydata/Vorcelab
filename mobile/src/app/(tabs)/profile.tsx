import { useCallback, useState } from 'react'
import { GearIcon, PencilIcon, SaveIcon } from '@/components/coach/CoachIcons'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { colors, font, radius, space } from '@/lib/theme'
import CoachEngine from '@/components/profile/CoachEngine'
import CalibrationCard from '@/components/profile/CalibrationCard'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import DeleteAccount from '@/components/profile/DeleteAccount'
import { LEGAL, openLegal, openSupport } from '@/lib/legal'
import PaceZonesCard from '@/components/PaceZonesCard'
import HrZonesCard from '@/components/HrZonesCard'
import type { HrZoneConfig } from '@/lib/hrZones'
import { recomputeRunnerProfileServer } from '@/lib/recomputeRunnerProfile'
import { useLoadEffect } from '@/lib/useLoadEffect'
import {
  fmtVam,
  fmtPaceFromKmh,
  statusColor,
  statusLabel,
  confidenceLabel,
  cardioCostColor,
  cardioCostLabel,
  GRADE_BUCKETS,
  type RunnerProfileComputed,
  type BucketKey,
  type BucketStats,
  type CardioCost,
  type PostClimbRecoveryByBucket,
  type PostDownhillRecoveryByBucket,
  type RecoveryBucketStats,
  type ConditionPenalties,
} from '@/lib/runnerProfile'

const appVersion = Constants.expoConfig?.version ?? '1.0.0'

// ─── Pont couleurs : les helpers web renvoient des var(--vl-*) (CSS), inexistantes
//     en natif → on les résout vers les hex du thème. (Seule différence tolérée :
//     le moteur de rendu ; aucune valeur/donnée n'est perdue.) ──────────────────
const VL: Record<string, string> = {
  'var(--vl-growth)': colors.growth,
  'var(--vl-amber)': colors.amber,
  'var(--vl-ember)': colors.ember,
  'var(--vl-text)': colors.text,
  'var(--vl-text-2)': colors.text2,
  'var(--vl-text-3)': colors.text3,
  'var(--vl-status-rest)': colors.status.rest,
}
const vl = (c: string) => VL[c] ?? c

// ─── Helpers (portés de ProfilePage) ─────────────────────────────────────────
function fmtSecsToClock(s: number): string {
  const sec = Math.round(s)
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

function prToStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return v > 0 ? fmtSecsToClock(v) : ''
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.time === 'string') return o.time
    if (typeof o.value === 'string') return o.value
    const n = o.timeS ?? o.timeSec ?? o.value ?? o.time
    if (typeof n === 'number') return fmtSecsToClock(n)
  }
  return ''
}

// ─── Styles communs ───────────────────────────────────────────────────────────
const cardS = { backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.lg, marginBottom: space.md } as const
const clabel = { color: colors.text3, fontSize: 11, fontFamily: font.monoSemiBold, letterSpacing: 1.2 }
const mlabel = { color: colors.text3, fontSize: 11, fontFamily: font.monoSemiBold, letterSpacing: 0.8 }
const fieldLabel = { color: colors.text3, fontSize: 10, fontFamily: font.monoSemiBold, letterSpacing: 1, marginBottom: 5 }
const input = { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, color: colors.text, fontSize: 15 } as const

function Badge({ label, color, fontSize = 10 }: { label: string; color: string; fontSize?: number }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: color }}>
      <Text style={{ color: '#fff', fontSize, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  )
}

// ─── Badges & cartes d'analyse (portés des composants inline de ProfilePage) ──
const RECO_STATUS: Record<string, { color: string; label: string }> = {
  good: { color: colors.growth, label: 'Bonne' },
  moderate: { color: colors.amber, label: 'Modérée' },
  weak: { color: colors.ember, label: 'Faible' },
  unknown: { color: colors.text3, label: 'N/D' },
  stable: { color: colors.growth, label: 'Stable' },
  marked: { color: colors.ember, label: 'Marquée' },
}
function RecoveryStatusBadge({ status }: { status: string }) {
  const m = RECO_STATUS[status] ?? { color: colors.text3, label: status }
  return <Badge label={m.label} color={m.color} fontSize={11} />
}

function BucketCard({ bucketKey, stats }: { bucketKey: BucketKey; stats: BucketStats }) {
  const b = GRADE_BUCKETS.find((x) => x.key === bucketKey)
  const isUp = b?.type === 'up'
  const sc = vl(statusColor(stats.status))
  return (
    <View style={cardS}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>{b?.label ?? bucketKey}</Text>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Badge label={cardioCostLabel(stats.cardioCost as CardioCost)} color={vl(cardioCostColor(stats.cardioCost as CardioCost))} />
          <Badge label={statusLabel(stats.status)} color={sc} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: sc }}>{isUp ? fmtVam(stats.vamMH) : fmtPaceFromKmh(stats.avgSpeedKmH)}</Text>
          <Text style={{ color: colors.text3, fontSize: 10 }}>{isUp ? `VAM · ${fmtPaceFromKmh(stats.avgSpeedKmH)}` : 'Allure'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{stats.avgHrPctFcMax != null ? `${stats.avgHrPctFcMax.toFixed(0)}%` : '—'}</Text>
          <Text style={{ color: colors.text3, fontSize: 10 }}>FCmax</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{stats.efficiencyScore != null ? stats.efficiencyScore.toFixed(0) : '—'}</Text>
          <Text style={{ color: colors.text3, fontSize: 10 }}>Efficacité</Text>
        </View>
      </View>

      {stats.statusReason ? (
        <Text style={{ fontSize: 11, color: stats.status === 'walk' ? '#3d8eb9' : colors.text3, fontStyle: 'italic', marginBottom: 4 }}>{stats.statusReason}</Text>
      ) : null}

      {stats.relanceStatus && stats.relanceStatus !== 'unknown' ? (
        <Text style={{ fontSize: 10, color: colors.text3 }}>
          Relance après montée : {{ strong: 'Bonne reprise', normal: 'Reprise normale', limited: 'Reprise limitée' }[stats.relanceStatus] ?? stats.relanceStatus}
        </Text>
      ) : null}

      <Text style={{ marginTop: 4, fontSize: 9, color: colors.text3 }}>
        Confiance : {confidenceLabel(stats.confidence as 'high' | 'medium' | 'low' | 'none')}
        {' · '}{Math.round(stats.totalSeconds / 60)} min · {stats.runCount} sortie(s)
        {stats.sampleCount != null ? ` · ${stats.sampleCount.toLocaleString('fr-FR')} pts GPS` : ''}
      </Text>

      {isUp && stats.altGainM != null && stats.altGainM > 0 ? (
        <Text style={{ marginTop: 2, fontSize: 9, color: colors.text3 }}>
          D+ cumulé {Math.round(stats.altGainM)}m
          {stats.totalDistanceM > 0 ? ` · ${(stats.totalDistanceM / 1000).toFixed(1)}km · pente moy ${((stats.altGainM / stats.totalDistanceM) * 100).toFixed(1)}%` : ''}
        </Text>
      ) : null}

      {stats.status === 'strength' ? (
        <Text style={{ fontSize: 9, color: colors.text3, fontStyle: 'italic', marginTop: 2 }}>Seuil Vorcelab (référence trail)</Text>
      ) : null}
    </View>
  )
}

const CONDITION_META: { key: keyof ConditionPenalties; label: string; desc: string }[] = [
  { key: 'heat', label: 'Chaleur (>22°C)', desc: 'Effet mesuré sur tes sorties, terrain normalisé par D+/km' },
  { key: 'cold', label: 'Froid (<5°C)', desc: 'Effet mesuré sur tes sorties hivernales, D+/km normalisé' },
  { key: 'night', label: 'Nocturne (20h–5h)', desc: 'Effet mesuré sur tes sorties de nuit, D+/km normalisé' },
  { key: 'wind', label: 'Vent (>25 km/h)', desc: 'Approche isotrope trail — alimenté par les météos vues en détail activité' },
]
function ConditionPenaltiesCard({ rp }: { rp: RunnerProfileComputed }) {
  const cp = rp.conditionPenalties
  if (!cp || Object.keys(cp).length === 0) return null
  return (
    <View style={cardS}>
      <Text style={[clabel, { marginBottom: 10 }]}>CONDITIONS MÉTÉO & CONTEXTE</Text>
      <Text style={{ fontSize: 11, color: colors.text3, marginBottom: 10, lineHeight: 17 }}>
        Impact mesuré sur tes sorties des 90 derniers jours — normalisé par le D+/km de chaque sortie pour isoler l’effet condition du terrain. Quand tes données sont peu nombreuses, on s’appuie sur un socle physiologique (la chaleur, par ex., ralentit toujours un humain) et on l’affine au fil de tes sorties. Positif = tu es plus lent. Alimentera l’algorithme de projection.
      </Text>
      {CONDITION_META.map(({ key, label, desc }) => {
        const p = cp[key]
        if (!p) return null
        const isSlower = p.paceImpactPct > 0
        const abs = Math.abs(p.paceImpactPct)
        const color = abs < 1.5 ? colors.growth : abs < 4 ? colors.amber : colors.ember
        return (
          <View key={key} style={{ marginBottom: 10, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: color }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color }}>{isSlower ? '+' : '−'}{abs.toFixed(1)}%</Text>
                <Text style={{ fontSize: 10, color }}>{abs < 1 ? 'sans effet' : isSlower ? 'plus lent' : 'plus rapide'}</Text>
              </View>
            </View>
            <Text style={{ fontSize: 10, color: colors.text3, lineHeight: 14 }}>{desc} · {p.sampleCount} sortie(s) · Confiance : {confidenceLabel(p.confidence)}</Text>
          </View>
        )
      })}
      <Text style={{ fontSize: 9, color: colors.text3, marginTop: 6, fontStyle: 'italic' }}>Pluie à venir · Vent : se remplit au fur et à mesure de tes consultations d’activités.</Text>
    </View>
  )
}

function GlobalAnalysisCard({ rp }: { rp: RunnerProfileComputed }) {
  return (
    <View style={cardS}>
      <Text style={[clabel, { marginBottom: 10 }]}>ANALYSE GLOBALE</Text>
      <View style={{ marginBottom: 10 }}>
        <Text style={[mlabel, { marginBottom: 4 }]}>Récupération post-montée</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RecoveryStatusBadge status={rp.postClimbRecoveryStatus} />
          {rp.postClimbHrRecoveryBpmPerMin != null ? <Text style={{ color: colors.text2, fontSize: 11 }}>{rp.postClimbHrRecoveryBpmPerMin.toFixed(0)} bpm/min</Text> : null}
          {rp.postClimbResumeSpeedKmH != null ? <Text style={{ color: colors.text3, fontSize: 11 }}>reprise {fmtPaceFromKmh(rp.postClimbResumeSpeedKmH)}</Text> : null}
          {rp.postClimbRecoveryStatus === 'unknown' && rp.postClimbHrRecoveryBpmPerMin == null ? (
            <Text style={{ fontSize: 11, color: colors.text3, fontStyle: 'italic' }}>En cours de construction — besoin de sorties trail avec GPS</Text>
          ) : null}
        </View>
        <Text style={{ marginTop: 3, fontSize: 9, color: colors.text3 }}>Confiance : {confidenceLabel(rp.postClimbRecoveryConfidence)}</Text>
      </View>
      <View>
        <Text style={[mlabel, { marginBottom: 4 }]}>Dérive cardiaque</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RecoveryStatusBadge status={rp.hrDriftStatus} />
          {rp.hrDriftPct != null ? <Text style={{ color: colors.text2, fontSize: 11 }}>{rp.hrDriftPct.toFixed(1)}% dérive</Text> : null}
        </View>
        {rp.hrDriftStatus === 'marked' ? (
          <Text style={{ fontSize: 10, color: colors.text3, fontStyle: 'italic', marginTop: 3 }}>Signal compatible avec fatigue, chaleur, hydratation insuffisante, pacing trop agressif ou endurance insuffisante.</Text>
        ) : null}
        <Text style={{ marginTop: 3, fontSize: 9, color: colors.text3 }}>Confiance : {confidenceLabel(rp.hrDriftConfidence)}</Text>
      </View>
    </View>
  )
}

function recColor(status: string): string {
  if (status === 'good') return colors.growth
  if (status === 'moderate') return colors.amber
  if (status === 'weak') return colors.ember
  return colors.text3
}
function RecoveryBucketRow({ label, rec }: { label: string; rec: RecoveryBucketStats }) {
  if (rec.sampleCount === 0) return null
  return (
    <View style={{ marginBottom: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: recColor(rec.status) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <Text style={{ fontSize: 11, color: colors.text2 }}>{label}</Text>
        <RecoveryStatusBadge status={rec.status} />
      </View>
      <Text style={{ fontSize: 10, color: colors.text3, lineHeight: 15 }}>
        {rec.hrDropBpmPerMin != null ? `${rec.hrDropBpmPerMin.toFixed(0)} bpm/min` : ''}
        {rec.resumeSpeedKmH != null ? ` · reprise ${fmtPaceFromKmh(rec.resumeSpeedKmH)}` : ''}
        {rec.speedDropVsNormalPct != null && rec.speedDropVsNormalPct > 0 ? ` (−${rec.speedDropVsNormalPct.toFixed(0)}%)` : ''}
        {` · ${rec.sampleCount} événement(s)`}
        {' · '}{confidenceLabel(rec.confidence)}
      </Text>
    </View>
  )
}
function RecoveryByBucketSection({ rp }: { rp: RunnerProfileComputed }) {
  const climbKeys: { key: keyof PostClimbRecoveryByBucket; label: string }[] = [
    { key: 'after_steep_up', label: 'Après montée raide (>12%)' },
    { key: 'after_mod_up', label: 'Après montée modérée (6–12%)' },
    { key: 'after_mild_up', label: 'Après montée légère (2–6%)' },
  ]
  const descentKeys: { key: keyof PostDownhillRecoveryByBucket; label: string }[] = [
    { key: 'after_steep_down', label: 'Après descente raide (<−12%)' },
    { key: 'after_mod_down', label: 'Après descente modérée (−6 à −12%)' },
    { key: 'after_mild_down', label: 'Après descente légère (−2 à −6%)' },
  ]
  const hasClimb = climbKeys.some((k) => rp.postClimbRecoveryByBucket?.[k.key]?.sampleCount)
  const hasDesc = descentKeys.some((k) => rp.postDownhillRecoveryByBucket?.[k.key]?.sampleCount)
  if (!hasClimb && !hasDesc) return null
  return (
    <View style={cardS}>
      <Text style={[clabel, { marginBottom: 10 }]}>RÉCUPÉRATION PAR GRADIENT</Text>
      {hasClimb ? (
        <>
          <Text style={[mlabel, { marginBottom: 6 }]}>Post-montée</Text>
          {climbKeys.map(({ key, label }) => { const rec = rp.postClimbRecoveryByBucket?.[key]; return rec ? <RecoveryBucketRow key={key} label={label} rec={rec} /> : null })}
        </>
      ) : null}
      {hasDesc ? (
        <>
          <Text style={[mlabel, { marginTop: hasClimb ? 10 : 0, marginBottom: 6 }]}>Post-descente</Text>
          {descentKeys.map(({ key, label }) => { const rec = rp.postDownhillRecoveryByBucket?.[key]; return rec ? <RecoveryBucketRow key={key} label={label} rec={rec} /> : null })}
        </>
      ) : null}
      {rp.downhillFatigue && rp.downhillFatigue.status !== 'unknown' ? (
        <View style={{ marginTop: 10, padding: 10, backgroundColor: colors.surf, borderRadius: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[mlabel, { fontSize: 10 }]}>SIGNAL FATIGUE DESCENTE</Text>
            <Badge label={{ low: 'Faible', moderate: 'Modéré', high: 'Élevé' }[rp.downhillFatigue.status] ?? '—'}
              color={rp.downhillFatigue.status === 'high' ? colors.ember : rp.downhillFatigue.status === 'moderate' ? colors.amber : colors.growth} />
          </View>
          {rp.downhillFatigue.steepDownLateRaceEfficiencyDrop != null && rp.downhillFatigue.steepDownLateRaceEfficiencyDrop > 0 ? (
            <Text style={{ fontSize: 10, color: colors.text3, marginTop: 3 }}>Vitesse reprise estimée {rp.downhillFatigue.steepDownLateRaceEfficiencyDrop.toFixed(0)}% inférieure à la normale après descente</Text>
          ) : null}
          <Text style={{ marginTop: 3, fontSize: 9, color: colors.text3 }}>Confiance : {confidenceLabel(rp.downhillFatigue.confidence)}</Text>
        </View>
      ) : null}
    </View>
  )
}

// ─── Types de ligne profil ────────────────────────────────────────────────────
interface ProfileRow {
  id: string
  name?: string | null
  weight?: number | null
  height?: number | null
  vo2max?: number | null
  fc_max?: number | null
  lactate_threshold?: number | null
  lactate_pace?: string | null
  sex?: string | null
  birthdate?: string | null
  prs?: Record<string, unknown> | null
  runner_profile?: RunnerProfileComputed | null
  fc_zones?: HrZoneConfig | null
}

type TabKey = 'compte' | 'records' | 'analyse'

export default function ProfileScreen() {
  const { session } = useAuth()
  const user = session?.user
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('compte')
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<ProfileRow | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [sex, setSex] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [vo2max, setVo2max] = useState('')
  const [fcMax, setFcMax] = useState('')
  const [lactate, setLactate] = useState('')
  const [lactatePace, setLactatePace] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  // Records state
  const [prsEdit, setPrsEdit] = useState<Record<string, string>>({})
  const [prsMode, setPrsMode] = useState<'view' | 'edit'>('view')
  const [prsSaveMsg, setPrsSaveMsg] = useState('')

  // LABO : recalcul du profil coureur + zones FC.
  const [computing, setComputing] = useState(false)
  const [computeProgress, setComputeProgress] = useState(0)
  const [computeLabel, setComputeLabel] = useState('')
  const [savingZones, setSavingZones] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('id,name,weight,height,vo2max,fc_max,lactate_threshold,lactate_pace,sex,birthdate,prs,runner_profile,fc_zones')
      .eq('id', user.id)
      .single()
    const r = (data as ProfileRow) ?? null
    setRow(r)
    if (r) {
      setName(r.name ?? '')
      setBirthdate(r.birthdate ?? '')
      setSex(r.sex ?? '')
      setWeight(r.weight != null ? String(r.weight) : '')
      setHeight(r.height != null ? String(r.height) : '')
      setVo2max(r.vo2max != null ? String(r.vo2max) : '')
      setFcMax(r.fc_max != null ? String(r.fc_max) : '')
      setLactate(r.lactate_threshold != null ? String(r.lactate_threshold) : '')
      setLactatePace(r.lactate_pace ?? '')
    }
    setLoading(false)
  }, [user])
  useLoadEffect(load, [load])

  async function handleSave() {
    if (!user) return
    await supabase.from('profiles').upsert({
      id: user.id,
      name: name || null,
      birthdate: birthdate || null,
      sex: sex || null,
      weight: weight ? parseFloat(weight) : null,
      height: height ? parseInt(height) : null,
      vo2max: vo2max ? parseFloat(vo2max) : null,
      fc_max: fcMax ? parseInt(fcMax) : null,
      lactate_threshold: lactate ? parseInt(lactate) : null,
      lactate_pace: lactatePace || null,
    })
    await load()
    setSaveMsg('Sauvegardé ✓')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function handleComputeProfile() {
    if (!user) return
    // §1 : recalcul CÔTÉ SERVEUR uniquement (compute-runner-profile) — source unique de
    // vérité (fenêtre moteur complète). Plus de build local sur 50 activités tronquées.
    setComputing(true); setComputeProgress(15); setComputeLabel('Recalcul du profil côté serveur…')
    try {
      await recomputeRunnerProfileServer()
      setComputeProgress(100)
      await load()
    } catch (e) {
      console.error('[VL] compute profile error:', e)
    } finally {
      setComputing(false); setComputeProgress(0); setComputeLabel('')
    }
  }

  async function saveZones(cfg: HrZoneConfig) {
    if (!user) return
    setSavingZones(true)
    const { error } = await supabase.from('profiles').update({ fc_zones: cfg }).eq('id', user.id)
    if (!error) await load()
    setSavingZones(false)
  }

  const rp = row?.runner_profile

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}>
        <Text style={{ color: colors.text, fontSize: 24, fontFamily: font.display, letterSpacing: 1, marginBottom: space.md }}>MON PROFIL</Text>

        {/* Identité */}
        <View style={[cardS, { flexDirection: 'row', alignItems: 'center', gap: space.md }]}>
          <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: colors.surf3, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.ember, fontSize: 20, fontFamily: font.display }}>{(name || 'Coureur').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{name || 'Coureur'}</Text>
            <Text style={{ color: colors.text3, fontSize: 12 }} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>

        {/* Sous-onglets */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: space.md }}>
          {([['compte', 'PROFIL'], ['records', 'RECORDS'], ['analyse', 'LABO']] as [TabKey, string][]).map(([k, lbl]) => {
            const on = activeTab === k
            return (
              <Pressable key={k} onPress={() => setActiveTab(k)} hitSlop={6} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: on ? colors.ember : 'transparent' }}>
                <Text style={{ color: on ? colors.ember : colors.text2, fontSize: 11, fontFamily: font.monoSemiBold, letterSpacing: 1 }}>{lbl}</Text>
              </Pressable>
            )
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.ember} style={{ marginTop: space.xl }} />
        ) : activeTab === 'compte' ? (
          <>
            <View style={cardS}>
              <Text style={[clabel, { marginBottom: 12 }]}>DONNÉES PHYSIOLOGIQUES</Text>
              {([
                ['PRÉNOM / NOM', name, setName, 'Prénom Nom', 'default'],
                ['DATE DE NAISSANCE', birthdate, setBirthdate, 'AAAA-MM-JJ', 'numbers-and-punctuation'],
              ] as const).map(([lbl, val, set, ph, kb]) => (
                <View key={lbl} style={{ marginBottom: space.md }}>
                  <Text style={fieldLabel}>{lbl}</Text>
                  <TextInput value={val} onChangeText={set as (s: string) => void} placeholder={ph} placeholderTextColor={colors.text3} keyboardType={kb as 'default'} style={input} />
                </View>
              ))}
              <View style={{ marginBottom: space.md }}>
                <Text style={fieldLabel}>SEXE</Text>
                <View style={{ flexDirection: 'row', alignSelf: 'flex-start', borderRadius: radius.sm, overflow: 'hidden' }}>
                  {([['', '—'], ['M', 'Homme'], ['F', 'Femme']] as [string, string][]).map(([v, l]) => {
                    const on = sex === v
                    return (
                      <Pressable key={v} onPress={() => setSex(v)} style={{ paddingHorizontal: 16, paddingVertical: 9, backgroundColor: on ? colors.ember : colors.surf }}>
                        <Text style={{ color: on ? colors.bg : colors.text2, fontWeight: '700', fontSize: 12 }}>{l}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
              {([
                ['POIDS (KG)', weight, setWeight, '70.0'],
                ['TAILLE (CM)', height, setHeight, '175'],
                ['VO2MAX', vo2max, setVo2max, '55'],
                ['FC MAX (BPM)', fcMax, setFcMax, '185'],
                ['SEUIL LACTIQUE (BPM)', lactate, setLactate, '165'],
              ] as const).map(([lbl, val, set, ph]) => (
                <View key={lbl} style={{ marginBottom: space.md }}>
                  <Text style={fieldLabel}>{lbl}</Text>
                  <TextInput value={val} onChangeText={set as (s: string) => void} placeholder={ph} placeholderTextColor={colors.text3} keyboardType="numeric" style={input} />
                </View>
              ))}
              <View style={{ marginBottom: space.md }}>
                <Text style={fieldLabel}>SEUIL LACTIQUE (/KM)</Text>
                <TextInput value={lactatePace} onChangeText={setLactatePace} placeholder="4:50" placeholderTextColor={colors.text3} style={input} />
              </View>
              <Pressable onPress={handleSave} style={({ pressed }) => ({ backgroundColor: colors.ember, borderRadius: radius.sm, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><SaveIcon size={12} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>Sauvegarder</Text></View>
              </Pressable>
              {saveMsg ? <Text style={{ marginTop: 6, fontSize: 11, color: colors.growth }}>{saveMsg}</Text> : null}
            </View>

            <Pressable onPress={() => router.push('/settings')} style={({ pressed }) => [cardS, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}><GearIcon size={12} color={colors.text3} /><Text style={clabel}>RÉGLAGES DE L’APP</Text></View>
                <Text style={{ fontSize: 12, color: colors.text2, lineHeight: 19 }}>Strava, orientation du coach, jours de course, renfo, 1RM, nutrition, compte.</Text>
              </View>
              <Text style={{ color: colors.ember, fontSize: 20, marginLeft: 12 }}>›</Text>
            </Pressable>

            <Pressable onPress={() => router.push('/renfo/equipment')} style={({ pressed }) => [cardS, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[clabel, { marginBottom: 6 }]}>MATÉRIEL RENFO — MAISON / SALLE</Text>
                <Text style={{ fontSize: 12, color: colors.text2, lineHeight: 19 }}>Ce que tu as chez toi et en salle. Détermine les variantes d’exercices proposées en séance.</Text>
              </View>
              <Text style={{ color: colors.ember, fontSize: 20, marginLeft: 12 }}>›</Text>
            </Pressable>

            <View style={cardS}>
              <Text style={[clabel, { marginBottom: 6 }]}>HISTORIQUE COMPLET — ARCHIVE STRAVA</Text>
              <Text style={{ fontSize: 12, color: colors.text2, lineHeight: 19 }}>Strava → Paramètres → Mes données → Demander une archive → uploade le ZIP reçu par email.</Text>
            </View>

            <Pressable onPress={() => supabase.auth.signOut()} style={({ pressed }) => ({ marginTop: space.sm, borderWidth: 1, borderColor: colors.ember, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: colors.ember, fontWeight: '700', letterSpacing: 0.5 }}>Déconnexion</Text>
            </Pressable>

            <DeleteAccount />

            {/* Pied de page légal & support — requis pour la publication. */}
            <View style={{ marginTop: space.xl, alignItems: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: space.lg }}>
                <Pressable onPress={() => openLegal(LEGAL.privacy)} hitSlop={8}>
                  <Text style={{ color: colors.text3, fontSize: 12, textDecorationLine: 'underline' }}>Confidentialité</Text>
                </Pressable>
                <Pressable onPress={() => openLegal(LEGAL.terms)} hitSlop={8}>
                  <Text style={{ color: colors.text3, fontSize: 12, textDecorationLine: 'underline' }}>CGU / CGV</Text>
                </Pressable>
                <Pressable onPress={() => openSupport()} hitSlop={8}>
                  <Text style={{ color: colors.text3, fontSize: 12, textDecorationLine: 'underline' }}>Support</Text>
                </Pressable>
              </View>
              <Text style={{ color: colors.text3, fontSize: 11 }}>Vorcelab v{appVersion}</Text>
            </View>
          </>
        ) : activeTab === 'records' ? (
          <View style={cardS}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={clabel}>RECORDS PERSONNELS</Text>
              {prsMode === 'view' ? (
                <Pressable onPress={() => {
                  const raw = row?.prs ?? {}
                  const flat: Record<string, string> = {}
                  for (const k of ['5K', '10K', '15K', 'Semi', 'Marathon', 'Ultra']) flat[k] = prToStr(raw[k])
                  setPrsEdit(flat); setPrsMode('edit')
                }} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.line2, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <PencilIcon size={10} color={colors.text3} />
                  <Text style={{ color: colors.text3, fontSize: 10, letterSpacing: 0.4 }}>Modifier</Text>
                </Pressable>
              ) : null}
            </View>
            {prsMode === 'edit' ? (
              <>
                {(['5K', '10K', '15K', 'Semi', 'Marathon'] as const).map((k) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={[fieldLabel, { width: 76, marginBottom: 0 }]}>{k}</Text>
                    <TextInput value={prsEdit[k] ?? ''} onChangeText={(t) => setPrsEdit((p) => ({ ...p, [k]: t }))} placeholder={k === 'Semi' ? '1:45:30' : k === 'Marathon' ? '3:45:00' : '23:45'} placeholderTextColor={colors.text3} style={[input, { flex: 1 }]} />
                  </View>
                ))}
                <View style={{ marginBottom: 8 }}>
                  <Text style={fieldLabel}>Ultra</Text>
                  <TextInput value={prsEdit['Ultra'] ?? ''} onChangeText={(t) => setPrsEdit((p) => ({ ...p, Ultra: t }))} placeholder="ex: UTMB 170K en 45h23, ou 67K 3500D+ 11h30" placeholderTextColor={colors.text3} style={input} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Pressable style={({ pressed }) => ({ flex: 1, backgroundColor: colors.ember, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
                    onPress={async () => {
                      const cleaned: Record<string, string> = {}
                      for (const [k, v] of Object.entries(prsEdit)) if (v.trim()) cleaned[k] = v.trim()
                      const { error } = await supabase.from('profiles').update({ prs: cleaned }).eq('id', user!.id)
                      if (!error) { await load(); setPrsMode('view'); setPrsSaveMsg('Sauvegardé ✓'); setTimeout(() => setPrsSaveMsg(''), 2000) }
                      else setPrsSaveMsg(`⚠ Échec de la sauvegarde : ${error.message}`)
                    }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><SaveIcon size={12} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700' }}>Sauvegarder</Text></View>
                  </Pressable>
                  <Pressable style={({ pressed }) => ({ flex: 1, borderWidth: 1, borderColor: colors.line2, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center', opacity: pressed ? 0.7 : 1 })} onPress={() => setPrsMode('view')}>
                    <Text style={{ color: colors.text2, fontWeight: '700' }}>Annuler</Text>
                  </Pressable>
                </View>
                {prsSaveMsg ? <Text style={{ marginTop: 6, fontSize: 11, color: prsSaveMsg.startsWith('⚠') ? colors.ember : colors.growth }}>{prsSaveMsg}</Text> : null}
              </>
            ) : (() => {
              const entries = Object.entries(row?.prs ?? {}).filter(([, v]) => prToStr(v))
              return entries.length > 0 ? (
                <View>
                  {entries.map(([dist, val]) => (
                    <View key={dist} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={fieldLabel}>{dist}</Text>
                      <Text style={{ color: colors.text2, fontSize: 13 }}>{prToStr(val)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: colors.text3, fontSize: 13 }}>Aucun record enregistré. Touche « Modifier » pour les saisir.</Text>
              )
            })()}
          </View>
        ) : (
          // ── LABO ──
          <>
            {/* Ton moteur — ce que l'algo lit du coureur. */}
            <CoachEngine />

            {/* Calibrage VMA (demi-Cooper) — accessible à tout moment. */}
            <CalibrationCard />

            {/* Allures de référence + zones FC éditables. */}
            <PaceZonesCard prs={row?.prs} vo2max={row?.vo2max} fcMax={row?.fc_max} showFcZones={false} />
            <HrZonesCard config={row?.fc_zones ?? null} inputs={{ fcMax: row?.fc_max, lthr: row?.lactate_threshold }} saving={savingZones} onSave={saveZones} />

            {/* Progression (recalcul). */}
            {computing ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, color: colors.text2, marginBottom: 6 }}>{computeLabel}</Text>
                <View style={{ height: 3, backgroundColor: colors.surf, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${computeProgress}%`, backgroundColor: colors.ember, borderRadius: 2 }} />
                </View>
              </View>
            ) : null}

            {rp ? (
              <>
                {/* En-tête analyse : date + FCmax + bouton recalcul. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
                  <Text style={{ fontSize: 9, color: colors.text3, flex: 1 }}>
                    Mis à jour le {new Date(rp._computedAt).toLocaleDateString('fr-FR')} · FCmax {row?.fc_max ?? rp.fcMax} bpm{!row?.fc_max ? ' (défaut)' : ''}
                    {rp.analyzedRuns != null ? ` · ${rp.analyzedRuns} sorties` : ''} · {Math.round(rp.totalStreamSeconds / 3600)}h analysées
                  </Text>
                  <Pressable onPress={() => !computing && handleComputeProfile()} disabled={computing} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ color: colors.text2, fontSize: 10, letterSpacing: 0.4 }}>↺ Recalculer</Text>
                  </Pressable>
                </View>
                {!row?.fc_max ? (
                  <View style={{ marginBottom: 10, padding: 12, borderRadius: 6, backgroundColor: 'rgba(214,128,62,0.10)', borderWidth: 1, borderColor: colors.ember }}>
                    <Text style={{ fontSize: 11, color: colors.ember, lineHeight: 17 }}>⚠ FCmax non renseignée — calcul basé sur 185 bpm par défaut. Les pourcentages FCmax et l’efficacité cardio sont inexacts. Renseigne ta FCmax dans l’onglet PROFIL puis recalcule.</Text>
                  </View>
                ) : null}
                {!!row?.fc_max && rp.fcMax !== row.fc_max ? (
                  <View style={{ marginBottom: 10, padding: 12, borderRadius: 6, backgroundColor: 'rgba(214,128,62,0.10)', borderWidth: 1, borderColor: colors.ember }}>
                    <Text style={{ fontSize: 11, color: colors.ember, lineHeight: 17 }}>⚠ Ta FCmax ({row.fc_max} bpm) a changé depuis le dernier calcul — l’analyse ci-dessous utilise encore {rp.fcMax} bpm.</Text>
                  </View>
                ) : null}

                {rp.analyzedMonths && rp.analyzedMonths.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {rp.analyzedMonths.map((m) => {
                      const d = new Date(m + '-01')
                      return <View key={m} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, backgroundColor: colors.surf }}><Text style={{ fontSize: 9, color: colors.text3, letterSpacing: 0.4, textTransform: 'uppercase' }}>{d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}</Text></View>
                    })}
                  </View>
                ) : null}

                <GlobalAnalysisCard rp={rp} />
                <ConditionPenaltiesCard rp={rp} />
                <RecoveryByBucketSection rp={rp} />
                <Text style={[clabel, { marginBottom: 8 }]}>PROFIL PAR GRADIENT</Text>
                {GRADE_BUCKETS.map((b) => {
                  const bkey = b.key as BucketKey
                  const stats = rp.buckets?.[bkey]
                  if (stats && stats.totalSeconds > 0) return <BucketCard key={bkey} bucketKey={bkey} stats={stats as BucketStats} />
                  return (
                    <View key={bkey} style={[cardS, { opacity: 0.45 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 }}>{b.label}</Text>
                        <Text style={{ fontSize: 9, color: colors.text3 }}>Pas de données</Text>
                      </View>
                    </View>
                  )
                })}
              </>
            ) : !computing ? (
              <View style={cardS}>
                <Text style={{ color: colors.text3, fontSize: 13, marginBottom: 10 }}>Profil non encore calculé — lance l’analyse de tes sorties (allures par gradient, récup, dérive cardiaque…).</Text>
                <Pressable onPress={handleComputeProfile} style={({ pressed }) => ({ backgroundColor: colors.ember, borderRadius: radius.sm, paddingVertical: 11, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ color: colors.bg, fontWeight: '700' }}>Calculer mon profil</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
