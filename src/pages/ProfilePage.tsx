import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import PaceZonesCard from '../components/PaceZonesCard'
import HrZonesCard from '../components/HrZonesCard'
import type { HrZoneConfig } from '../lib/hrZones'
import ProfileTabs from '../components/ProfileTabs'
import CoachEngine from '../components/coach/CoachEngine'
import CalibrationCard from '../components/coach/CalibrationCard'
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
} from '../lib/runnerProfile'
import { buildRunnerProfile, fetchActivitiesForProfile, fillMissingWeather, saveRunnerProfile } from '../lib/buildRunnerProfile'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Secondes → chrono lisible (m:ss ou h:mm:ss). */
function fmtSecsToClock(s: number): string {
  const sec = Math.round(s)
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

/** Normalise une valeur de record (string, secondes, ou objet {time|value|timeS}) en texte éditable. */
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

function RecoveryStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    good:     'var(--vl-growth)',
    moderate: 'var(--vl-amber)',
    weak:     'var(--vl-ember)',
    unknown:  'var(--vl-text-3)',
    stable:   'var(--vl-growth)',
    marked:   'var(--vl-ember)',
  }
  const labelMap: Record<string, string> = {
    good:     'Bonne',
    moderate: 'Modérée',
    weak:     'Faible',
    unknown:  'N/D',
    stable:   'Stable',
    marked:   'Marquée',
  }
  const color = colorMap[status] ?? 'var(--vl-text-3)'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      background: color,
      color: '#fff',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {labelMap[status] ?? status}
    </span>
  )
}

function CardioCostBadge({ cost }: { cost: CardioCost }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      background: cardioCostColor(cost),
      color: '#fff',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {cardioCostLabel(cost)}
    </span>
  )
}

// ─── Bucket card ──────────────────────────────────────────────────────────────

function BucketCard({ bucketKey, stats }: { bucketKey: BucketKey; stats: BucketStats }) {
  const b = GRADE_BUCKETS.find((b) => b.key === bucketKey)
  const isUp = b?.type === 'up'

  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.85rem', letterSpacing: '0.04em' }}>
          {b?.label ?? bucketKey}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CardioCostBadge cost={stats.cardioCost} />
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            background: statusColor(stats.status),
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {statusLabel(stats.status)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: statusColor(stats.status) }}>
            {isUp ? fmtVam(stats.vamMH) : fmtPaceFromKmh(stats.avgSpeedKmH)}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>
            {isUp ? `VAM · ${fmtPaceFromKmh(stats.avgSpeedKmH)}` : 'Allure'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {stats.avgHrPctFcMax != null ? `${stats.avgHrPctFcMax.toFixed(0)}%` : '—'}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>FCmax</div>
        </div>

        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {stats.efficiencyScore != null ? stats.efficiencyScore.toFixed(0) : '—'}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>Efficacité</div>
        </div>
      </div>

      {stats.statusReason && (
        <div style={{ fontSize: 11, color: stats.status === 'walk' ? '#3d8eb9' : 'var(--vl-text-3)', fontStyle: 'italic', marginBottom: 4 }}>
          {stats.statusReason}
        </div>
      )}

      {stats.relanceStatus && stats.relanceStatus !== 'unknown' && (
        <div className="mlabel" style={{ fontSize: 10, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Relance après montée&nbsp;:&nbsp;
          {{
            strong:  'Bonne reprise',
            normal:  'Reprise normale',
            limited: 'Reprise limitée',
          }[stats.relanceStatus] ?? stats.relanceStatus}
        </div>
      )}

      <div className="mlabel" style={{ marginTop: 4, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
        Confiance : {confidenceLabel(stats.confidence as 'high' | 'medium' | 'low' | 'none')}
        {' · '}
        {Math.round(stats.totalSeconds / 60)} min · {stats.runCount} sortie(s)
        {stats.sampleCount != null && ` · ${stats.sampleCount.toLocaleString('fr-FR')} pts GPS`}
      </div>

      {/* Debug row: altGainM, avgGrade, totalDist — visible pour vérification */}
      {isUp && stats.altGainM != null && stats.altGainM > 0 && (
        <div style={{ marginTop: 2, fontSize: 9, color: 'var(--vl-text-3)', fontFamily: 'var(--vl-mono)' }}>
          D+ cumulé&nbsp;{Math.round(stats.altGainM)}m
          {stats.totalDistanceM > 0 && (
            <>
              {' · '}{(stats.totalDistanceM / 1000).toFixed(1)}km
              {' · '}pente moy {((stats.altGainM / stats.totalDistanceM) * 100).toFixed(1)}%
            </>
          )}
        </div>
      )}

      {stats.status === 'strength' && (
        <div style={{ fontSize: 9, color: 'var(--vl-text-3)', fontStyle: 'italic', marginTop: 2 }}>
          Seuil Vorcelab (référence trail)
        </div>
      )}
    </div>
  )
}

// ─── Condition penalties card ─────────────────────────────────────────────────

const CONDITION_META: { key: keyof ConditionPenalties; label: string; desc: string }[] = [
  { key: 'heat',  label: 'Chaleur (>22°C)',    desc: 'Effet mesuré sur tes sorties, terrain normalisé par D+/km' },
  { key: 'cold',  label: 'Froid (<5°C)',        desc: 'Effet mesuré sur tes sorties hivernales, D+/km normalisé' },
  { key: 'night', label: 'Nocturne (20h–5h)',   desc: 'Effet mesuré sur tes sorties de nuit, D+/km normalisé' },
  { key: 'wind',  label: 'Vent (>25 km/h)',     desc: 'Approche isotrope trail — alimenté par les météos vues en détail activité' },
]

function ConditionPenaltiesCard({ rp }: { rp: RunnerProfileComputed }) {
  const cp = rp.conditionPenalties
  if (!cp || Object.keys(cp).length === 0) return null

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        Impact mesuré sur <em>tes</em> sorties des 90 derniers jours — normalisé par le D+/km de chaque sortie pour isoler l'effet condition du terrain. Quand tes données sont peu nombreuses, on s'appuie sur un socle physiologique (la chaleur, par ex., ralentit <em>toujours</em> un humain) et on l'affine au fil de tes sorties. Positif = tu es plus lent. Alimentera l'algorithme de projection.
      </div>

      {CONDITION_META.map(({ key, label, desc }) => {
        const p = cp[key]
        if (!p) return null
        const isSlower = p.paceImpactPct > 0
        const abs = Math.abs(p.paceImpactPct)
        const color = abs < 1.5 ? 'var(--vl-growth)' : abs < 4 ? 'var(--vl-amber)' : 'var(--vl-ember)'
        return (
          <div key={key} style={{ marginBottom: 10, paddingLeft: 8, borderLeft: `2px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color }}>
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 13, fontWeight: 700 }}>
                  {isSlower ? '+' : '−'}{abs.toFixed(1)}%
                </span>
                <span style={{ fontSize: 10 }}>{abs < 1 ? 'sans effet' : isSlower ? 'plus lent' : 'plus rapide'}</span>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--vl-text-3)', lineHeight: 1.4 }}>
              {desc}
              {' · '}{p.sampleCount} sortie(s)
              {' · '}Confiance : {confidenceLabel(p.confidence)}
            </div>
          </div>
        )
      })}

      <div style={{ fontSize: 9, color: 'var(--vl-text-3)', marginTop: 6, fontStyle: 'italic' }}>
        Pluie à venir · Vent : se remplit au fur et à mesure de tes consultations d'activités.
      </div>
    </div>
  )
}

// ─── Global analysis card ─────────────────────────────────────────────────────

function GlobalAnalysisCard({ rp }: { rp: RunnerProfileComputed }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <div className="mlabel" style={{ marginBottom: 4 }}>Récupération post-montée</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RecoveryStatusBadge status={rp.postClimbRecoveryStatus} />
          {rp.postClimbHrRecoveryBpmPerMin != null && (
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)' }}>
              {rp.postClimbHrRecoveryBpmPerMin.toFixed(0)} bpm/min
            </span>
          )}
          {rp.postClimbResumeSpeedKmH != null && (
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)' }}>
              reprise {fmtPaceFromKmh(rp.postClimbResumeSpeedKmH)}
            </span>
          )}
          {rp.postClimbRecoveryStatus === 'unknown' && rp.postClimbHrRecoveryBpmPerMin == null && (
            <span style={{ fontSize: 11, color: 'var(--vl-text-3)', fontStyle: 'italic' }}>
              En cours de construction — besoin de sorties trail avec GPS
            </span>
          )}
        </div>
        <div className="mlabel" style={{ marginTop: 3, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Confiance : {confidenceLabel(rp.postClimbRecoveryConfidence)}
        </div>
      </div>

      <div>
        <div className="mlabel" style={{ marginBottom: 4 }}>Dérive cardiaque</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RecoveryStatusBadge status={rp.hrDriftStatus} />
          {rp.hrDriftPct != null && (
            <span className="mlabel" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-2)' }}>
              {rp.hrDriftPct.toFixed(1)}% dérive
            </span>
          )}
        </div>
        {rp.hrDriftStatus === 'marked' && (
          <div style={{ fontSize: 10, color: 'var(--vl-text-3)', fontStyle: 'italic', marginTop: 3 }}>
            Signal compatible avec fatigue, chaleur, hydratation insuffisante, pacing trop agressif ou endurance insuffisante.
          </div>
        )}
        <div className="mlabel" style={{ marginTop: 3, fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
          Confiance : {confidenceLabel(rp.hrDriftConfidence)}
        </div>
      </div>
    </div>
  )
}

// ─── Recovery by bucket ───────────────────────────────────────────────────────

function recColor(status: string): string {
  if (status === 'good') return 'var(--vl-growth)'
  if (status === 'moderate') return 'var(--vl-amber)'
  if (status === 'weak') return 'var(--vl-ember)'
  return 'var(--vl-text-3)'
}

function RecoveryBucketRow({ label, rec }: { label: string; rec: RecoveryBucketStats }) {
  if (rec.sampleCount === 0) return null
  return (
    <div style={{ marginBottom: 8, paddingLeft: 8, borderLeft: `2px solid ${recColor(rec.status)}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ fontSize: 11, color: 'var(--vl-text-2)' }}>{label}</div>
        <RecoveryStatusBadge status={rec.status} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--vl-text-3)', lineHeight: 1.5 }}>
        {rec.hrDropBpmPerMin != null && `${rec.hrDropBpmPerMin.toFixed(0)} bpm/min`}
        {rec.resumeSpeedKmH != null && ` · reprise ${fmtPaceFromKmh(rec.resumeSpeedKmH)}`}
        {rec.speedDropVsNormalPct != null && rec.speedDropVsNormalPct > 0 && ` (−${rec.speedDropVsNormalPct.toFixed(0)}%)`}
        {` · ${rec.sampleCount} événement(s)`}
        {' · '}{confidenceLabel(rec.confidence)}
      </div>
    </div>
  )
}

function RecoveryByBucketSection({ rp }: { rp: RunnerProfileComputed }) {
  const climbKeys: { key: keyof PostClimbRecoveryByBucket; label: string }[] = [
    { key: 'after_steep_up', label: 'Après montée raide (>12%)' },
    { key: 'after_mod_up',   label: 'Après montée modérée (6–12%)' },
    { key: 'after_mild_up',  label: 'Après montée légère (2–6%)' },
  ]
  const descentKeys: { key: keyof PostDownhillRecoveryByBucket; label: string }[] = [
    { key: 'after_steep_down', label: 'Après descente raide (<−12%)' },
    { key: 'after_mod_down',   label: 'Après descente modérée (−6 à −12%)' },
    { key: 'after_mild_down',  label: 'Après descente légère (−2 à −6%)' },
  ]

  const hasClimb = climbKeys.some((k) => rp.postClimbRecoveryByBucket?.[k.key]?.sampleCount)
  const hasDesc = descentKeys.some((k) => rp.postDownhillRecoveryByBucket?.[k.key]?.sampleCount)
  if (!hasClimb && !hasDesc) return null

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>

      {hasClimb && (
        <>
          <div className="mlabel" style={{ marginBottom: 6 }}>Post-montée</div>
          {climbKeys.map(({ key, label }) => {
            const rec = rp.postClimbRecoveryByBucket?.[key]
            return rec ? <RecoveryBucketRow key={key} label={label} rec={rec} /> : null
          })}
        </>
      )}

      {hasDesc && (
        <>
          <div className="mlabel" style={{ marginTop: hasClimb ? 10 : 0, marginBottom: 6 }}>Post-descente</div>
          {descentKeys.map(({ key, label }) => {
            const rec = rp.postDownhillRecoveryByBucket?.[key]
            return rec ? <RecoveryBucketRow key={key} label={label} rec={rec} /> : null
          })}
        </>
      )}

      {rp.downhillFatigue && rp.downhillFatigue.status !== 'unknown' && (
        <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--vl-bg-2)', borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="mlabel" style={{ fontSize: 10 }}>SIGNAL FATIGUE DESCENTE</div>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff',
              background: rp.downhillFatigue.status === 'high' ? 'var(--vl-ember)' : rp.downhillFatigue.status === 'moderate' ? 'var(--vl-amber)' : 'var(--vl-growth)',
            }}>
              {{ low: 'Faible', moderate: 'Modéré', high: 'Élevé' }[rp.downhillFatigue.status] ?? '—'}
            </span>
          </div>
          {rp.downhillFatigue.steepDownLateRaceEfficiencyDrop != null && rp.downhillFatigue.steepDownLateRaceEfficiencyDrop > 0 && (
            <div style={{ fontSize: 10, color: 'var(--vl-text-3)', marginTop: 3 }}>
              Vitesse reprise estimée {rp.downhillFatigue.steepDownLateRaceEfficiencyDrop.toFixed(0)}% inférieure à la normale après descente
            </div>
          )}
          <div className="mlabel" style={{ marginTop: 3, fontSize: 9, textTransform: 'none', letterSpacing: 0, color: 'var(--vl-text-3)' }}>
            Confiance : {confidenceLabel(rp.downhillFatigue.confidence)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Full profile row type ────────────────────────────────────────────────────

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
  avatar_url?: string | null
  prs?: Record<string, unknown> | null
  nutrition_level?: string | null
  nutrition_products?: string[] | null
  nutrition_no_caffeine?: boolean | null
  runner_profile?: RunnerProfileComputed | null
  coach_days_per_week?: number | null
  renfo_weekly_target?: number | null
  coach_motivation?: string | null
  fc_zones?: HrZoneConfig | null
}

// ─── Collapsible block ────────────────────────────────────────────────────────

function CollapsibleBlock({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: '0.25rem' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 0', marginBottom: open ? '0.5rem' : '0.75rem',
        }}
      >
        <span className="clabel" style={{ fontSize: '0.7rem', letterSpacing: '.12em' }}>{title}</span>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text-3)', transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

// ─── Tab styles ───────────────────────────────────────────────────────────────

const tabStyle = (active: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 12px',
  fontFamily: 'var(--vl-mono)',
  fontSize: 11,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: active ? 'var(--vl-ember)' : 'var(--vl-text-3)',
  borderBottom: active ? '2px solid var(--vl-ember)' : '2px solid transparent',
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const user = useVLStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()
  type TabKey = 'compte' | 'analyse' | 'records'
  const activeTab = (searchParams.get('tab') ?? 'compte') as TabKey
  const setActiveTab = (tab: TabKey) =>
    setSearchParams(tab === 'compte' ? {} : { tab }, { replace: false })
  const [computing, setComputing] = useState(false)
  const [computeProgress, setComputeProgress] = useState(0)
  const [computeLabel, setComputeLabel] = useState('')
  const queryClient = useQueryClient()

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
  const [formLoaded, setFormLoaded] = useState(false)

  // Records state
  const _PR_KEYS = ['5K', '10K', '15K', 'Semi', 'Marathon', 'Ultra'] as const
  const [prsEdit, setPrsEdit] = useState<Record<string, string>>({})
  const [prsMode, setPrsMode] = useState<'view' | 'edit'>('view')
  const [prsSaveMsg, setPrsSaveMsg] = useState('')

  // Save state
  const [saveMsg, setSaveMsg] = useState('')
  const [savingZones, setSavingZones] = useState(false)

  const { data: profileRow, isLoading, refetch } = useQuery<ProfileRow | null>({
    queryKey: ['profile-full', user?.id],
    queryFn: async (): Promise<ProfileRow | null> => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('id,name,weight,height,vo2max,fc_max,lactate_threshold,lactate_pace,sex,birthdate,avatar_url,prs,nutrition_level,nutrition_products,nutrition_no_caffeine,runner_profile,coach_days_per_week,renfo_weekly_target,coach_motivation,fc_zones')
        .eq('id', user.id)
        .single()
      return data as ProfileRow | null
    },
    enabled: !!user,
  })

  // Populate form once data loads
  if (profileRow && !formLoaded) {
    setName(profileRow.name ?? '')
    setBirthdate(profileRow.birthdate ?? '')
    setSex(profileRow.sex ?? '')
    setWeight(profileRow.weight != null ? String(profileRow.weight) : '')
    setHeight(profileRow.height != null ? String(profileRow.height) : '')
    setVo2max(profileRow.vo2max != null ? String(profileRow.vo2max) : '')
    setFcMax(profileRow.fc_max != null ? String(profileRow.fc_max) : '')
    setLactate(profileRow.lactate_threshold != null ? String(profileRow.lactate_threshold) : '')
    setLactatePace(profileRow.lactate_pace ?? '')
    setFormLoaded(true)
  }

  const rp = profileRow?.runner_profile

  async function handleComputeProfile() {
    if (!user) return
    setComputing(true)
    setComputeProgress(0)
    setComputeLabel('Chargement des activités…')
    try {
      const acts = await fetchActivitiesForProfile(user.id, 50)
      setComputeLabel('Synchronisation météo manquante…')
      await fillMissingWeather(user.id, acts, (done, total) => {
        setComputeLabel(`Météo ${done}/${total}…`)
      })
      const rpNew = await buildRunnerProfile(
        acts,
        profileRow?.fc_max ?? 185,
        (pct, label) => { setComputeProgress(pct); setComputeLabel(label) },
      )
      await saveRunnerProfile(user.id, rpNew)
      await queryClient.invalidateQueries({ queryKey: ['profile-full', user.id] })
    } catch (e) {
      console.error('[VL] compute profile error:', e)
    } finally {
      setComputing(false)
      setComputeProgress(0)
      setComputeLabel('')
    }
  }

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
    await refetch()
    setSaveMsg('Sauvegardé ✓')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  return (
    <>
      {/* Header */}
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        MON PROFIL
      </div>

      <ProfileTabs />

      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vl-line)', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button data-tour="profile-account" style={tabStyle(activeTab === 'compte')} onClick={() => setActiveTab('compte')}>PROFIL</button>
        <button style={tabStyle(activeTab === 'records')} onClick={() => setActiveTab('records')}>RECORDS</button>
        <button style={tabStyle(activeTab === 'analyse')} onClick={() => setActiveTab('analyse')}>LABO</button>
      </div>

      {activeTab === 'compte' && (
        <>
          {/* Card DONNÉES PHYSIOLOGIQUES */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="clabel" style={{ marginBottom: '0.75rem' }}>DONNÉES PHYSIOLOGIQUES</div>

            {isLoading ? (
              <div className="loading"><div className="spinner" /></div>
            ) : (
              <>
                <div className="fg">
                  <span className="fl">PRÉNOM / NOM</span>
                  <input className="fi" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
                </div>

                <div className="fg">
                  <span className="fl">DATE DE NAISSANCE</span>
                  <input className="fi" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
                </div>

                <div className="fg">
                  <span className="fl">SEXE</span>
                  <select className="fi" value={sex} onChange={(e) => setSex(e.target.value)}>
                    <option value="">—</option>
                    <option value="M">Homme</option>
                    <option value="F">Femme</option>
                  </select>
                </div>

                <div className="fg">
                  <span className="fl">POIDS (KG)</span>
                  <input className="fi" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="70.0" />
                </div>

                <div className="fg">
                  <span className="fl">TAILLE (CM)</span>
                  <input className="fi" type="number" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="175" />
                </div>

                <div className="fg">
                  <span className="fl">VO2MAX</span>
                  <input className="fi" type="number" value={vo2max} onChange={(e) => setVo2max(e.target.value)} placeholder="55" />
                </div>

                <div className="fg">
                  <span className="fl">FC MAX (BPM)</span>
                  <input className="fi" type="number" value={fcMax} onChange={(e) => setFcMax(e.target.value)} placeholder="185" />
                </div>

                <div className="fg">
                  <span className="fl">SEUIL LACTIQUE (BPM)</span>
                  <input className="fi" type="number" value={lactate} onChange={(e) => setLactate(e.target.value)} placeholder="165" />
                </div>

                <div className="fg">
                  <span className="fl">SEUIL LACTIQUE (/KM)</span>
                  <input className="fi" type="text" value={lactatePace} onChange={(e) => setLactatePace(e.target.value)} placeholder="4:50" />
                </div>

                <button
                  className="hbtn"
                  style={{ marginTop: '0.5rem', background: 'var(--vl-ember)', color: '#fff' }}
                  onClick={handleSave}
                >
                  💾 Sauvegarder
                </button>
                {saveMsg && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-growth)', fontFamily: 'var(--vl-mono)' }}>
                    {saveMsg}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Card ARCHIVE STRAVA */}
          <CollapsibleBlock title="HISTORIQUE COMPLET — ARCHIVE STRAVA" defaultOpen={false}>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: 12, color: 'var(--vl-text-2)', lineHeight: 1.6 }}>
                Strava → Paramètres → Mes données → Demander une archive → uploade le ZIP reçu par email.
              </div>
            </div>
          </CollapsibleBlock>
        </>
      )}

      {/* ── Tab RECORDS ── */}
      {activeTab === 'records' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="clabel">RECORDS PERSONNELS</div>
            {prsMode === 'view' && (
              <button
                className="mlabel"
                onClick={() => {
                  const raw = profileRow?.prs ?? {}
                  const flat: Record<string, string> = {}
                  for (const k of ['5K', '10K', '15K', 'Semi', 'Marathon', 'Ultra']) {
                    flat[k] = prToStr(raw[k])
                  }
                  setPrsEdit(flat)
                  setPrsMode('edit')
                }}
                style={{ background: 'none', border: '1px solid var(--vl-line)', borderRadius: 4, cursor: 'pointer', color: 'var(--vl-text-3)', padding: '2px 7px', fontSize: 10, letterSpacing: '.04em' }}
              >
                ✏ Modifier
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : prsMode === 'edit' ? (
            <>
              {(['5K', '10K', '15K', 'Semi', 'Marathon'] as const).map((k) => (
                <div key={k} className="fg" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="fl" style={{ minWidth: 80 }}>{k}</span>
                  <input
                    className="fi"
                    type="text"
                    placeholder={k === 'Semi' ? '1:45:30' : k === 'Marathon' ? '3:45:00' : '23:45'}
                    value={prsEdit[k] ?? ''}
                    onChange={(e) => setPrsEdit((p) => ({ ...p, [k]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                </div>
              ))}
              <div className="fg" style={{ marginBottom: 6 }}>
                <span className="fl">Ultra</span>
                <input
                  className="fi"
                  type="text"
                  placeholder="ex: UTMB 170K en 45h23, ou 67K 3500D+ 11h30"
                  value={prsEdit['Ultra'] ?? ''}
                  onChange={(e) => setPrsEdit((p) => ({ ...p, Ultra: e.target.value }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  className="hbtn"
                  style={{ background: 'var(--vl-ember)', color: '#fff', flex: 1 }}
                  onClick={async () => {
                    const cleaned: Record<string, string> = {}
                    for (const [k, v] of Object.entries(prsEdit)) {
                      if (v.trim()) cleaned[k] = v.trim()
                    }
                    const { error } = await supabase.from('profiles').update({ prs: cleaned }).eq('id', user!.id)
                    if (!error) {
                      queryClient.invalidateQueries({ queryKey: ['profile-full', user?.id] })
                      setPrsMode('view')
                      setPrsSaveMsg('Sauvegardé ✓')
                      setTimeout(() => setPrsSaveMsg(''), 2000)
                    } else {
                      setPrsSaveMsg(`⚠ Échec de la sauvegarde : ${error.message}`)
                    }
                  }}
                >
                  💾 Sauvegarder
                </button>
                <button className="hbtn" onClick={() => setPrsMode('view')} style={{ flex: 1 }}>
                  Annuler
                </button>
              </div>
              {prsSaveMsg && <div style={{ marginTop: 6, fontSize: 11, color: prsSaveMsg.startsWith('⚠') ? 'var(--vl-ember)' : 'var(--vl-growth)', fontFamily: 'var(--vl-mono)' }}>{prsSaveMsg}</div>}
            </>
          ) : (
            (() => {
              const formatPr = prToStr
              const entries = Object.entries(profileRow?.prs ?? {}).filter(([, v]) => formatPr(v))
              return entries.length > 0 ? (
                <div>
                  {entries.map(([dist, val]) => (
                    <div key={dist} className="fg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className="fl">{dist}</span>
                      <span className="mlabel" style={{ color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0 }}>{formatPr(val)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                  Aucun record enregistré. Cliquez sur ✏ Modifier pour les saisir.
                </div>
              )
            })()
          )}
        </div>
      )}

      {/* ── Tab ANALYSE COUREUR ── */}
      {activeTab === 'analyse' && (
        <>
          {isLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <>
              {/* Ton moteur — ce que l'algo lit du coureur (déplacé depuis Coach). */}
              <CollapsibleBlock title="MOTEUR & CALIBRAGE">
                <CoachEngine />
                <CalibrationCard />
              </CollapsibleBlock>

              {/* Allures de référence (déplacées ici depuis le profil) */}
              <CollapsibleBlock title="ZONES D'EFFORT">
              <PaceZonesCard prs={profileRow?.prs} vo2max={profileRow?.vo2max} fcMax={profileRow?.fc_max} showFcZones={false} />
              <HrZonesCard
                config={profileRow?.fc_zones ?? null}
                inputs={{ fcMax: profileRow?.fc_max, lthr: profileRow?.lactate_threshold }}
                saving={savingZones}
                onSave={async (cfg) => {
                  if (!user) return
                  setSavingZones(true)
                  const { error } = await supabase.from('profiles').update({ fc_zones: cfg }).eq('id', user.id)
                  if (!error) await queryClient.invalidateQueries({ queryKey: ['profile-full', user.id] })
                  setSavingZones(false)
                }}
              />
              </CollapsibleBlock>

              {/* Progress bar (auto or manual compute) */}
              {computing && (
                <div style={{ marginBottom: '1rem' }}>
                  <div className="mlabel" style={{ marginBottom: 6, color: 'var(--vl-text-2)', textTransform: 'none', letterSpacing: 0 }}>
                    {computeLabel}
                  </div>
                  <div style={{ height: 3, background: 'var(--vl-bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${computeProgress}%`,
                      background: 'var(--vl-ember)', borderRadius: 2, transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )}

              {rp && (
                <>
                  {/* FCmax warning: if not set, %FCmax metrics are unreliable */}
                  {!profileRow?.fc_max && (
                    <div style={{
                      marginBottom: '0.75rem', padding: '8px 12px', borderRadius: 6,
                      background: 'rgba(229,86,42,0.08)', border: '1px solid var(--vl-ember)',
                      fontSize: 11, color: 'var(--vl-ember)', lineHeight: 1.6,
                    }}>
                      ⚠ FCmax non renseignée — calcul basé sur <strong>185 bpm par défaut</strong>. Les pourcentages FCmax et l'efficacité cardio sont inexacts. Renseignez votre FCmax dans l'onglet <strong>PROFIL</strong> puis recalculez.
                    </div>
                  )}

                  {/* Stale FCmax: profile FCmax changed since the analysis was computed */}
                  {!!profileRow?.fc_max && rp.fcMax !== profileRow.fc_max && (
                    <div style={{
                      marginBottom: '0.75rem', padding: '8px 12px', borderRadius: 6,
                      background: 'rgba(229,86,42,0.08)', border: '1px solid var(--vl-ember)',
                      fontSize: 11, color: 'var(--vl-ember)', lineHeight: 1.6,
                    }}>
                      ⚠ Ta FCmax ({profileRow.fc_max} bpm) a changé depuis le dernier calcul — l'analyse ci-dessous utilise encore <strong>{rp.fcMax} bpm</strong>. Clique sur <strong>↺ Recalculer</strong> pour la rafraîchir.
                    </div>
                  )}

                  {/* Stale profile warning: old data computed without streams */}
                  {rp.streamCoverage < 0.01 && rp.analyzedRuns != null && rp.analyzedRuns > 0 && (
                    <div style={{
                      marginBottom: '0.75rem', padding: '8px 12px', borderRadius: 6,
                      background: 'rgba(229,86,42,0.12)', border: '1px solid var(--vl-ember)',
                      fontSize: 11, color: 'var(--vl-ember)', lineHeight: 1.5,
                    }}>
                      ⚠ Profil calculé sans streams GPS — métriques incomplètes. Cliquez sur ↺ Recalculer pour charger les vraies données.
                    </div>
                  )}

                  {/* Header row: computed date + FCmax used + discreet recalc button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div className="mlabel" style={{ fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                      Mis à jour le {new Date(rp._computedAt).toLocaleDateString('fr-FR')}
                      {' · '}FCmax&nbsp;
                      <span style={{ color: !profileRow?.fc_max || rp.fcMax !== profileRow.fc_max ? 'var(--vl-ember)' : 'var(--vl-text-2)' }}>
                        {profileRow?.fc_max ?? rp.fcMax} bpm
                        {!profileRow?.fc_max && ' (défaut)'}
                        {!!profileRow?.fc_max && rp.fcMax !== profileRow.fc_max && ` (analyse : ${rp.fcMax})`}
                      </span>
                      {rp.analyzedRuns != null && ` · ${rp.analyzedRuns} sorties`}
                      {' · '}{Math.round(rp.totalStreamSeconds / 3600)}h analysées
                    </div>
                    <button
                      className="mlabel"
                      disabled={computing}
                      onClick={() => handleComputeProfile()}
                      style={{
                        background: 'none', border: '1px solid var(--vl-line)', borderRadius: 4,
                        cursor: computing ? 'wait' : 'pointer', color: 'var(--vl-text-3)',
                        padding: '2px 7px', fontSize: 10, letterSpacing: '.04em',
                      }}
                    >
                      ↺ Recalculer
                    </button>
                  </div>

                  {/* Analyzed months */}
                  {rp.analyzedMonths && rp.analyzedMonths.length > 0 && (
                    <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {rp.analyzedMonths.map((m) => {
                        const d = new Date(m + '-01')
                        const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
                        return (
                          <span key={m} style={{
                            fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.04em',
                            padding: '2px 6px', borderRadius: 3, background: 'var(--vl-bg-2)',
                            color: 'var(--vl-text-3)', textTransform: 'uppercase',
                          }}>
                            {label}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  <CollapsibleBlock title="ANALYSE GLOBALE">
                    <GlobalAnalysisCard rp={rp} />
                  </CollapsibleBlock>
                  {rp.conditionPenalties && Object.keys(rp.conditionPenalties).length > 0 && (
                    <CollapsibleBlock title="CONDITIONS MÉTÉO & CONTEXTE" defaultOpen={false}>
                      <ConditionPenaltiesCard rp={rp} />
                    </CollapsibleBlock>
                  )}
                  <CollapsibleBlock title="RÉCUPÉRATION PAR GRADIENT" defaultOpen={false}>
                    <RecoveryByBucketSection rp={rp} />
                  </CollapsibleBlock>
                  <CollapsibleBlock title="PROFIL PAR GRADIENT">
                  {/* All 7 buckets — always shown */}
                  {GRADE_BUCKETS.map((b) => {
                    const bkey = b.key as BucketKey
                    const stats = rp.buckets?.[bkey]
                    if (stats && stats.totalSeconds > 0) {
                      return <BucketCard key={bkey} bucketKey={bkey} stats={stats as BucketStats} />
                    }
                    return (
                      <div key={bkey} className="card" style={{ marginBottom: '0.75rem', opacity: 0.45 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '0.85rem', letterSpacing: '0.04em' }}>
                            {b.label}
                          </div>
                          <span className="mlabel" style={{ fontSize: 9, color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                            Pas de données
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  </CollapsibleBlock>
                </>
              )}

              {!rp && !computing && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <div className="mlabel" style={{ color: 'var(--vl-text-3)', textTransform: 'none', letterSpacing: 0 }}>
                    Analyse en cours de chargement…
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

    </>
  )
}
