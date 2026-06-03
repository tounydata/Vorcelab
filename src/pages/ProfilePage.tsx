import { useState } from 'react'
import { useSearchParams, Link } from 'react-router'
import { useVLStore } from '../store/vlStore'
import { supabase } from '../lib/supabase'
import { NUTRITION_TYPE_LABELS, nutritionBrands } from '../lib/nutritionProducts'
import { MOTIVATION_LABELS, type CoachMotivation } from '../lib/coach/motivation'
import StravaConnection from '../components/StravaConnection'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import PaceZonesCard from '../components/PaceZonesCard'
import {
  fmtVam,
  fmtSpeed,
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
            {isUp ? fmtVam(stats.vamMH) : fmtSpeed(stats.avgSpeedKmH)}
          </div>
          <div className="slbl" style={{ fontSize: 10 }}>
            {isUp ? `VAM · ${fmtSpeed(stats.avgSpeedKmH)}` : 'Vitesse'}
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
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>CONDITIONS MÉTÉO & CONTEXTE</div>
      <div style={{ fontSize: 11, color: 'var(--vl-text-3)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        Impact mesuré sur <em>tes</em> sorties des 90 derniers jours — normalisé par le D+/km de chaque sortie pour isoler l'effet condition du terrain. Positif = tu es plus lent dans ces conditions. Alimentera l'algorithme de projection.
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
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 13, fontWeight: 700, color }}>
                {isSlower ? '+' : ''}{p.paceImpactPct.toFixed(1)}%
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
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>ANALYSE GLOBALE</div>

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
              reprise {rp.postClimbResumeSpeedKmH.toFixed(1)} km/h
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
        {rec.resumeSpeedKmH != null && ` · reprise ${rec.resumeSpeedKmH.toFixed(1)} km/h`}
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
      <div className="clabel" style={{ marginBottom: '0.75rem' }}>RÉCUPÉRATION PAR GRADIENT</div>

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
  goals?: string | null
  sex?: string | null
  birthdate?: string | null
  avatar_url?: string | null
  prs?: Record<string, unknown> | null
  nutrition_level?: string | null
  nutrition_products?: string[] | null
  runner_profile?: RunnerProfileComputed | null
  coach_days_per_week?: number | null
  renfo_weekly_target?: number | null
  coach_motivation?: string | null
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
  type TabKey = 'reglages' | 'compte' | 'analyse' | 'records' | 'nutrition'
  const activeTab = (searchParams.get('tab') ?? 'reglages') as TabKey
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
  const [goals, setGoals] = useState('')
  const [formLoaded, setFormLoaded] = useState(false)

  // Records state
  const _PR_KEYS = ['5K', '10K', '15K', 'Semi', 'Marathon', 'Ultra'] as const
  const [prsEdit, setPrsEdit] = useState<Record<string, string>>({})
  const [prsMode, setPrsMode] = useState<'view' | 'edit'>('view')
  const [prsSaveMsg, setPrsSaveMsg] = useState('')

  // Password change state
  const [showPwdInput, setShowPwdInput] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')

  // Save state
  const [saveMsg, setSaveMsg] = useState('')

  // Produits nutrition cochés par l'athlète (ids du catalogue) — utilisés par la stratégie de course.
  const [nutritionProducts, setNutritionProducts] = useState<string[]>([])
  const [nutritionLoaded, setNutritionLoaded] = useState(false)
  const [nutritionSaved, setNutritionSaved] = useState(false)
  const [openBrand, setOpenBrand] = useState<string | null>(null)

  function toggleNutritionProduct(id: string) {
    setNutritionProducts((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function saveNutritionProducts() {
    if (!user) return
    const { error } = await supabase.from('profiles').upsert({ id: user.id, nutrition_products: nutritionProducts })
    if (!error) {
      setNutritionSaved(true)
      setTimeout(() => setNutritionSaved(false), 2500)
      refetch()
    }
  }

  const { data: profileRow, isLoading, refetch } = useQuery<ProfileRow | null>({
    queryKey: ['profile-full', user?.id],
    queryFn: async (): Promise<ProfileRow | null> => {
      if (!user) return null
      const { data } = await supabase
        .from('profiles')
        .select('id,name,weight,height,vo2max,fc_max,lactate_threshold,lactate_pace,goals,sex,birthdate,avatar_url,prs,nutrition_level,nutrition_products,runner_profile,coach_days_per_week,renfo_weekly_target,coach_motivation')
        .eq('id', user.id)
        .single()
      return data as ProfileRow | null
    },
    enabled: !!user,
  })

  // Réglages coach/renfo (onglet Paramètres) — patch partiel sur profiles.
  const settingsMut = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile-full', user?.id] }),
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
    setGoals(profileRow.goals ?? '')
    setFormLoaded(true)
  }
  if (profileRow && !nutritionLoaded) {
    setNutritionProducts(profileRow.nutrition_products ?? [])
    setNutritionLoaded(true)
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
      goals: goals || null,
    })
    await refetch()
    setSaveMsg('Sauvegardé ✓')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function handlePwdChange() {
    if (!newPwd) return
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) {
      setPwdMsg('Erreur : ' + error.message)
    } else {
      setPwdMsg('Mot de passe mis à jour ✓')
      setNewPwd('')
      setShowPwdInput(false)
      setTimeout(() => setPwdMsg(''), 3000)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="clabel" style={{ marginBottom: '1rem', fontSize: '1.4rem', fontFamily: 'var(--vl-display)', letterSpacing: '0.04em' }}>
        MON PROFIL
      </div>

      {/* Tabs */}
      <div data-tour="profile-data" style={{ display: 'flex', borderBottom: '1px solid var(--vl-border)', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button style={tabStyle(activeTab === 'reglages')} onClick={() => setActiveTab('reglages')}>PARAMÈTRES</button>
        <button style={tabStyle(activeTab === 'compte')} onClick={() => setActiveTab('compte')}>COMPTE</button>
        <button style={tabStyle(activeTab === 'analyse')} onClick={() => setActiveTab('analyse')}>ANALYSE</button>
        <button style={tabStyle(activeTab === 'records')} onClick={() => setActiveTab('records')}>RECORDS</button>
        <button data-tour="profile-nutrition" style={tabStyle(activeTab === 'nutrition')} onClick={() => setActiveTab('nutrition')}>NUTRITION</button>
      </div>

      {/* ── Tab COMPTE ── */}
      {activeTab === 'reglages' && (() => {
        const motivation = (profileRow?.coach_motivation ?? 'mix') as CoachMotivation
        const days = profileRow?.coach_days_per_week ?? 5
        const renfoTarget = profileRow?.renfo_weekly_target ?? 3
        const segWrap: React.CSSProperties = { display: 'flex', gap: 1, background: 'var(--vl-line)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden', flexWrap: 'wrap' }
        const seg = (on: boolean): React.CSSProperties => ({
          border: 'none', cursor: on ? 'default' : 'pointer', padding: '7px 14px', minWidth: 0,
          background: on ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: on ? 'var(--vl-ink)' : 'var(--vl-text-2)',
          fontFamily: 'var(--vl-display)', fontWeight: 700, fontSize: '.8rem', letterSpacing: '.04em', textTransform: 'uppercase',
        })
        return (
          <>
            {/* Connexion Strava */}
            <div data-tour="settings-strava" className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 8 }}>CONNEXION STRAVA</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Connecte ta montre : Vorcelab analyse tes sorties et estime ta VO2max. Tu peux forcer une synchro ou te déconnecter ici.
              </p>
              <StravaConnection variant="full" />
            </div>

            {/* Orientation coach */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 4 }}>ORIENTATION COACH</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Comment tu veux t'entraîner — ça ajuste le volume et l'intensité de ton plan.
              </p>
              <div style={segWrap}>
                {(['plaisir', 'mix', 'performance'] as CoachMotivation[]).map((m) => (
                  <button key={m} style={seg(motivation === m)} onClick={() => motivation !== m && settingsMut.mutate({ coach_motivation: m })}>
                    {MOTIVATION_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Course */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 4 }}>COURSE</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Jours de course disponibles par semaine — calibre le nombre de séances du plan.
              </p>
              <div style={segWrap}>
                {[3, 4, 5, 6].map((n) => (
                  <button key={n} style={seg(days === n)} onClick={() => days !== n && settingsMut.mutate({ coach_days_per_week: n })}>{n} j</button>
                ))}
              </div>
              <Link to="/race" style={{ textDecoration: 'none' }}>
                <div className="mlabel" style={{ color: 'var(--vl-ember)', marginTop: 14, fontSize: 11 }}>Calendrier des courses →</div>
              </Link>
            </div>

            {/* Renfo */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div className="clabel" style={{ marginBottom: 4 }}>RENFORCEMENT</div>
              <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
                Objectif de séances de renfo par semaine.
              </p>
              <div style={segWrap}>
                {[2, 3, 4, 5].map((n) => (
                  <button key={n} style={seg(renfoTarget === n)} onClick={() => renfoTarget !== n && settingsMut.mutate({ renfo_weekly_target: n })}>{n}/sem</button>
                ))}
              </div>
              <Link to="/renfo/settings" style={{ textDecoration: 'none' }}>
                <div className="mlabel" style={{ color: 'var(--vl-ember)', marginTop: 14, fontSize: 11 }}>Équipement & détails renfo →</div>
              </Link>
            </div>
          </>
        )
      })()}

      {activeTab === 'compte' && (
        <>
          <PaceZonesCard prs={profileRow?.prs} vo2max={profileRow?.vo2max} fcMax={profileRow?.fc_max} />

          {/* Card COMPTE */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="clabel" style={{ marginBottom: '0.75rem' }}>COMPTE</div>

            {/* Avatar */}
            <div style={{ marginBottom: '0.75rem' }}>
              {profileRow?.avatar_url ? (
                <img
                  src={profileRow.avatar_url}
                  alt="avatar"
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                  onError={(e) => {
                    const parent = (e.target as HTMLImageElement).parentElement
                    if (parent) {
                      (e.target as HTMLImageElement).style.display = 'none'
                      const fb = document.createElement('div')
                      fb.style.cssText = 'width:56px;height:56px;border-radius:50%;background:var(--vl-ember);display:flex;align-items:center;justify-content:center;font-family:var(--vl-display);font-size:1.4rem;color:#fff;letter-spacing:.04em'
                      fb.textContent = (profileRow?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()
                      parent.prepend(fb)
                    }
                  }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--vl-ember)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--vl-display)', fontSize: '1.4rem', color: '#fff', letterSpacing: '.04em' }}>
                  {(profileRow?.name?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="fg">
              <span className="fl">EMAIL</span>
              <input
                className="fi"
                type="email"
                value={user?.email ?? ''}
                readOnly
                disabled
              />
            </div>

            {/* Password change */}
            <div style={{ marginTop: '0.75rem' }}>
              {!showPwdInput ? (
                <button
                  className="hbtn"
                  onClick={() => setShowPwdInput(true)}
                >
                  🔑 Changer le mot de passe
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    className="fi"
                    type="password"
                    placeholder="Nouveau mot de passe"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="hbtn" onClick={handlePwdChange}>Confirmer</button>
                    <button
                      className="hbtn"
                      style={{ background: 'var(--vl-bg-2)', color: 'var(--vl-text-3)' }}
                      onClick={() => { setShowPwdInput(false); setNewPwd('') }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
              {pwdMsg && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-growth)', fontFamily: 'var(--vl-mono)' }}>
                  {pwdMsg}
                </div>
              )}
            </div>
          </div>

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

                <div className="fg">
                  <span className="fl">OBJECTIFS</span>
                  <textarea
                    className="fi"
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    placeholder="Vos objectifs de course..."
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
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
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="clabel" style={{ marginBottom: '0.5rem' }}>HISTORIQUE COMPLET — ARCHIVE STRAVA</div>
            <div style={{ fontSize: 12, color: 'var(--vl-text-2)', lineHeight: 1.6 }}>
              Strava → Paramètres → Mes données → Demander une archive → uploade le ZIP reçu par email.
            </div>
          </div>
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
                    const v = raw[k]
                    flat[k] = typeof v === 'string' ? v : (v && typeof v === 'object' ? String((v as Record<string,unknown>).time ?? (v as Record<string,unknown>).value ?? '') : '')
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
                    }
                  }}
                >
                  💾 Sauvegarder
                </button>
                <button className="hbtn" onClick={() => setPrsMode('view')} style={{ flex: 1 }}>
                  Annuler
                </button>
              </div>
              {prsSaveMsg && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--vl-growth)', fontFamily: 'var(--vl-mono)' }}>{prsSaveMsg}</div>}
            </>
          ) : (
            (() => {
              const formatPr = (v: unknown) => typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as Record<string,unknown>).time ?? (v as Record<string,unknown>).value ?? '') : String(v)
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

      {/* ── Tab NUTRITION ── */}
      {activeTab === 'nutrition' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div className="clabel" style={{ margin: 0 }}>MES PRODUITS NUTRITION</div>
            <button className="hbtn" style={{ fontSize: 10, padding: '4px 10px' }} onClick={saveNutritionProducts}>
              {nutritionSaved ? 'Enregistré ✓' : 'Enregistrer'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
            Coche les produits que tu utilises. Ils alimentent ton plan de ravitaillement dans la stratégie de course.
            <span style={{ color: 'var(--vl-text-2)' }}> {nutritionProducts.length} sélectionné{nutritionProducts.length > 1 ? 's' : ''}.</span>
          </p>
          {isLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nutritionBrands().map(({ brand, products }) => {
                const open = openBrand === brand
                const selCount = products.filter((p) => nutritionProducts.includes(p.id)).length
                return (
                  <div key={brand} style={{ border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden' }}>
                    <button
                      onClick={() => setOpenBrand(open ? null : brand)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        background: open ? 'var(--vl-surf-2)' : 'transparent', border: 'none', cursor: 'pointer',
                        padding: '11px 13px', textAlign: 'left', color: 'var(--vl-text)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontFamily: 'var(--vl-display)', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '.01em' }}>{brand}</span>
                        {selCount > 0 && (
                          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)', background: 'color-mix(in oklab, var(--vl-ember) 12%, transparent)', borderRadius: 4, padding: '1px 6px' }}>
                            {selCount} ✓
                          </span>
                        )}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>{products.length} produit{products.length > 1 ? 's' : ''}</span>
                        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 12, color: 'var(--vl-text-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                      </span>
                    </button>
                    {open && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 13px 10px' }}>
                        {products.map((p) => {
                          const checked = nutritionProducts.includes(p.id)
                          return (
                            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 0', color: checked ? 'var(--vl-text)' : 'var(--vl-text-2)' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleNutritionProduct(p.id)} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                {p.name}
                                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>{NUTRITION_TYPE_LABELS[p.type]}</span>
                              </span>
                              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', whiteSpace: 'nowrap' }}>
                                {p.carbs}g{p.per ? `/${p.per}` : ''}{p.caffeine ? ` · ${p.caffeine}mg caf` : ''}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
                      ⚠ FCmax non renseignée — calcul basé sur <strong>185 bpm par défaut</strong>. Les pourcentages FCmax et l'efficacité cardio sont inexacts. Renseignez votre FCmax dans l'onglet <strong>COMPTE</strong> puis recalculez.
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
                      <span style={{ color: profileRow?.fc_max ? 'var(--vl-text-2)' : 'var(--vl-ember)' }}>
                        {rp.fcMax} bpm{!profileRow?.fc_max && ' (défaut)'}
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

                  <GlobalAnalysisCard rp={rp} />
                  <ConditionPenaltiesCard rp={rp} />
                  <RecoveryByBucketSection rp={rp} />
                  <div className="clabel" style={{ marginBottom: '0.5rem' }}>PROFIL PAR GRADIENT</div>

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

      {/* Logout */}
      <button
        className="hbtn"
        style={{ marginTop: '1.5rem' }}
        onClick={() => supabase.auth.signOut()}
      >
        Se déconnecter
      </button>
    </>
  )
}
