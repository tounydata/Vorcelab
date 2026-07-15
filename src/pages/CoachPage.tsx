import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { priceLabels } from '../lib/pricing'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { allocatePhases, PHASE_LABELS, type PlannedSession, type PlanWeek } from '../lib/coach/planGenerator'
import { getWorkout, type Phase } from '../lib/coach/workouts'
import { computeAdjustment, scaleWorkout, nextQualityWorkoutId } from '../lib/coach/sessionModulation'
import { structureWorkout } from '../lib/coach/structureWorkout'
import { listSessionLog } from '../lib/coach/sessionLog'
import { useCoachPlan } from '../lib/coach/useCoachPlan'
import { usePlanTier } from '../lib/usePlanTier'
import { useUpgradeModal } from '../lib/useUpgradeModal'
import { useAutoUpgradeModal } from '../lib/useAutoUpgradeModal'
import { useTrackEvent } from '../lib/useTrackEvent'
import { predictRaceTimeS, fmtRaceTime, estimateVdotGain } from '../lib/raceTimeProjection'
import CalibrationPopup from '../components/coach/CalibrationPopup'
import WeekProgram, { type HistoryWeek } from '../components/WeekProgram'
import SessionAdaptationSplash from '../components/SessionAdaptationSplash'
import BrandedLoader from '../components/BrandedLoader'

const PHASE_COLORS: Record<Phase, string> = {
  base: 'var(--vl-growth)',
  build: 'var(--vl-amber)',
  specific: 'var(--vl-ember)',
  taper: '#3B82F6',
  race: 'var(--vl-text)',
}

/** Lundi (ISO) de la semaine contenant une date donnée. */
function mondayOfISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const day = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

/** Durée de prépa « pleine » de référence selon la distance (pour reconstituer
 *  les phases déjà passées même si le plan ne génère que le restant). */
function standardPrepWeeks(distanceKm: number): number {
  if (distanceKm >= 42) return 16
  if (distanceKm >= 21) return 12
  if (distanceKm >= 10) return 10
  return 8
}

/** Forme de la charge par phase (0..1) — montée en base/développement, pic en
 *  spécifique, décrue en affûtage. Donne l'arc « périodisation » du HTML. */
function phaseShape(phase: Phase, k: number, len: number): number {
  const f = len > 1 ? k / (len - 1) : 0.5
  switch (phase) {
    case 'base': return 0.50 + 0.25 * f
    case 'build': return 0.78 + 0.18 * f
    case 'specific': return 0.97 + 0.03 * f
    case 'taper': return 0.72 - 0.32 * f
    case 'race': return 0.20
  }
}

/** Graphe de périodisation : la prépa complète (phases passées « faite » →
 *  en cours « ◂ ici » → à venir), arc de charge + dégradé, comme la maquette. */
function PeriodizationArc({ weeks, weeksToRace, distanceKm }: {
  weeks: { phase: Phase }[]
  weeksToRace: number
  distanceKm: number
}) {
  if (weeks.length === 0) return null

  // Prépa COMPLÈTE avec le VRAI modèle de phases (allocatePhases — la même
  // périodisation sport-science que le plan) : semaines passées = tête du modèle
  // plein, puis semaines réelles restantes du plan.
  const fullWeeks = Math.max(weeksToRace, standardPrepWeeks(distanceKm))
  const weeksDone = Math.max(0, fullWeeks - weeksToRace)
  const pastPhases: Phase[] = allocatePhases(fullWeeks, distanceKm).slice(0, weeksDone)
  const fullPhases: Phase[] = [...pastPhases, ...weeks.map((x) => x.phase)]
  const boundary = pastPhases.length // index de la semaine en cours

  // Regroupe en segments contigus de même phase.
  type Run = { phase: Phase; start: number; len: number; isPast: boolean; isCurrent: boolean }
  const runs: Run[] = []
  fullPhases.forEach((ph, i) => {
    const last = runs[runs.length - 1]
    if (last && last.phase === ph) last.len += 1
    else runs.push({ phase: ph, start: i, len: 1, isPast: false, isCurrent: false })
  })
  runs.forEach((r) => {
    const end = r.start + r.len - 1
    r.isCurrent = r.start <= boundary && boundary <= end
    r.isPast = end < boundary
  })

  const vols: number[] = []
  runs.forEach((r) => { for (let k = 0; k < r.len; k++) vols.push(phaseShape(r.phase, k, r.len)) })
  const n = vols.length
  const W = 900, H = 92, PAD = 8
  const xAt = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W)
  const yAt = (v: number) => H - PAD - v * (H - PAD * 2)
  const pts = vols.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${xAt(n - 1).toFixed(1)},${H} L${xAt(0).toFixed(1)},${H} Z`

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 92, display: 'block' }} aria-hidden="true">
        <defs>
          <linearGradient id="periG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--vl-ember)" stopOpacity={0.34} />
            <stop offset="1" stopColor="var(--vl-ember)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#periG)" />
        <path d={line} fill="none" stroke="var(--vl-ember)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* marqueur « tu es ici » */}
        {boundary > 0 && boundary < n && (
          <>
            <line x1={xAt(boundary).toFixed(1)} y1={0} x2={xAt(boundary).toFixed(1)} y2={H} stroke="var(--vl-text)" strokeWidth={0.7} strokeDasharray="3 3" opacity={0.55} />
            <circle cx={xAt(boundary)} cy={yAt(vols[boundary])} r={4} fill="var(--vl-text)" />
          </>
        )}
        <circle cx={xAt(n - 1)} cy={yAt(vols[n - 1])} r={4} fill="var(--color-victory)" />
      </svg>
      {/* Légende = barre connectée colorée par phase (façon maquette HTML) */}
      <div style={{ display: 'flex', marginTop: 10, border: '1px solid var(--vl-line)', borderRadius: 8, overflow: 'hidden' }}>
        {runs.map((r, i) => {
          const color = PHASE_COLORS[r.phase]
          const sub = r.phase === 'race' ? 'jour J' : `${r.len} sem.${r.isCurrent ? ' · en cours' : r.isPast ? ' · faite' : ''}`
          return (
            <div key={i} title={`${PHASE_LABELS[r.phase]} · ${sub}`}
              style={{
                flex: r.len, minWidth: 0, padding: '8px 10px',
                borderRight: i < runs.length - 1 ? '1px solid var(--vl-line)' : 'none',
                background: r.isCurrent ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
                opacity: r.isPast ? 0.78 : 1,
              }}>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {PHASE_LABELS[r.phase]}{r.isCurrent ? ' ◂ ici' : ''}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sub}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function fmtRaceDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Retourne la séance du jour ou la prochaine séance de la semaine, si la semaine est en cours. */
function findTodayOrNextSession(week: PlanWeek): { session: PlannedSession; isToday: boolean } | null {
  if (!week?.sessions?.length) return null
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const weekStart = week.weekStartISO
  const weekEndISO = new Date(new Date(weekStart + 'T00:00:00').getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
  if (todayISO < weekStart || todayISO > weekEndISO) return null
  const todayDow = today.getDay() === 0 ? 7 : today.getDay()
  const sorted = [...week.sessions].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  const todaySession = sorted.find((s) => s.dayOfWeek === todayDow)
  if (todaySession) return { session: todaySession, isToday: true }
  const next = sorted.find((s) => s.dayOfWeek > todayDow)
  return next ? { session: next, isToday: false } : null
}

const INTENSITY_LABEL: Record<string, string> = {
  easy: 'Endurance fondamentale',
  moderate: 'Allure soutenue',
  hard: 'Intensité',
  very_hard: 'Haute intensité',
  recovery: 'Récupération active',
}
const SYSTEM_LABEL: Record<string, string> = {
  aerobic: 'Aérobie',
  quality: 'Qualité',
  strength: 'Force',
  race_specific: 'Spécifique course',
}

function TodayCTA({ week }: { week: PlanWeek }) {
  const found = findTodayOrNextSession(week)
  if (!found) return null
  const { session, isToday } = found
  const intensityLbl = INTENSITY_LABEL[session.intensity] ?? session.intensity
  const systemLbl = SYSTEM_LABEL[session.system] ?? session.system
  return (
    <div style={{
      background: 'var(--vl-ember)', borderRadius: 'var(--vl-r)',
      padding: '18px 20px', marginBottom: '1rem',
      boxShadow: '0 2px 12px color-mix(in srgb, var(--vl-ember) 30%, transparent)',
    }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--vl-ink)', opacity: .65, marginBottom: 6 }}>
        {isToday ? 'Séance du jour' : 'Prochaine séance cette semaine'}
      </div>
      <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.55rem', fontWeight: 800, color: 'var(--vl-ink)', lineHeight: 1.1, marginBottom: 8 }}>
        {session.title}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,.15)', color: 'var(--vl-ink)', borderRadius: 4, padding: '2px 8px' }}>
          {session.targetDurationMin} min
        </span>
        <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'rgba(0,0,0,.55)', letterSpacing: '.04em' }}>
          {intensityLbl} · {systemLbl}
        </span>
        {session.climbTargetM && (
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'rgba(0,0,0,.55)' }}>
            ↑ {session.climbTargetM.min}–{session.climbTargetM.max} m D+
          </span>
        )}
      </div>
    </div>
  )
}

export default function CoachPage() {
  const user = useVLStore((s) => s.user)
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null)

  // Source de vérité unique du plan (partagée avec le dashboard).
  const {
    isLoading, upcoming, targetRace,
    profile, activities,
    vdot,
    plan, replan, displayWeeks, renfoSessionsPerWeek,
  } = useCoachPlan(selectedRaceId)

  const { tier } = usePlanTier()
  const { openModal } = useUpgradeModal()
  const track = useTrackEvent()

  useEffect(() => { track('coach_viewed') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 2 premières semaines gratuites ; le reste nécessite PRO.
  const FREE_WEEKS = 2
  const isGated = tier !== 'pro' && displayWeeks.length > FREE_WEEKS

  // Free qui atteint le plan verrouillé → popup PRO auto (1×/session), avec le
  // teaser de gain de perf pour maximiser l'envie.
  useAutoUpgradeModal(
    isGated && !!plan,
    'coach',
    plan ? { vdot, weeksToRace: plan.weeksToRace, distanceKm: plan.race.distanceKm, raceName: plan.race.name } : null,
  )
  const visibleWeeks = isGated ? displayWeeks.slice(0, FREE_WEEKS) : displayWeeks

  // Priorité de la course cible (A = principal, B = secondaire, C = rodage).
  const qc = useQueryClient()
  const priorityMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: string }) => {
      const { error } = await supabase.from('race_calendar').update({ priority: p }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['races'] }),
  })

  // Test demi-Cooper (6 min) → calibre la VMA/CS. NULL = fallback historique.
  const demiCooperMut = useMutation({
    mutationFn: async (distanceM: number) => {
      const { error } = await supabase.from('profiles')
        .update({ demi_cooper: { distanceM, dateISO: new Date().toISOString().slice(0, 10) } })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-sessions'] }),
  })

  // « Plus tard » sur le pop-up de calibrage → on persiste le report CÔTÉ SERVEUR
  // (sinon navigation privée = re-proposé à chaque visite). Reste refaisable en LABO.
  const demiCooperSkipMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('profiles')
        .update({ demi_cooper: { skipped: true, dateISO: new Date().toISOString().slice(0, 10) } })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-sessions'] }),
  })

  // ── Modulation v3 : le verdict de la dernière séance ajuste la prochaine ──
  const { data: latestVerdict = null } = useQuery({
    queryKey: ['latest-verdict', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const rows = await listSessionLog(1)
      return rows[0] ? { id: rows[0].id, verdict: rows[0].verdict } : null
    },
  })

  // Journal des séances → affiche celles déjà validées (bug : repartait à zéro au retour).
  const queryClient = useQueryClient()
  const { data: sessionLogs = [] } = useQuery({
    queryKey: ['session-log-all', user?.id],
    enabled: !!user,
    queryFn: () => listSessionLog(120),
  })
  function onSessionSaved() {
    queryClient.invalidateQueries({ queryKey: ['session-log-all', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['latest-verdict', user?.id] })
  }

  // Semaines passées reconstruites depuis le journal (séances réellement validées),
  // pour pouvoir naviguer en arrière et revoir ce qui a été fait.
  const pastWeeks = useMemo<HistoryWeek[]>(() => {
    const currentStart = plan?.weeks[0]?.weekStartISO
    if (!currentStart) return []
    const byWeek = new Map<string, HistoryWeek['done']>()
    for (const l of sessionLogs) {
      const wk = mondayOfISO(l.planned_date)
      if (wk >= currentStart) continue // semaines passées uniquement
      const arr = byWeek.get(wk) ?? []
      arr.push({
        workoutId: l.planned_workout_id,
        workoutName: getWorkout(l.planned_workout_id)?.name ?? l.planned_workout_id,
        date: l.planned_date,
        verdict: l.verdict,
      })
      byWeek.set(wk, arr)
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStartISO, done]) => ({ weekStartISO, done: done.sort((x, y) => x.date.localeCompare(y.date)) }))
  }, [plan, sessionLogs])

  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    setDismissed(!!latestVerdict && localStorage.getItem('vl-modul-dismiss') === latestVerdict.id)
  }, [latestVerdict])

  // Cible : la 1re séance qualité de la semaine courante est adaptée DE L'INTÉRIEUR
  // (reps + allure) selon le verdict. L'affûtage (taper/course) n'est jamais modulé.
  const modulation = useMemo(() => {
    if (!plan || !latestVerdict || dismissed) return null
    if (replan?.trigger) return null // la replanif réactive prime sur la modulation
    const adj = computeAdjustment(latestVerdict.verdict)
    if (adj.direction === 'none') return null
    const week0 = plan.weeks[0]
    if (!week0 || week0.phase === 'taper' || week0.phase === 'race') return null
    const workoutId = nextQualityWorkoutId(week0.sessions)
    const t = workoutId ? getWorkout(workoutId) : null
    if (!workoutId || !t) return null
    const { summary } = scaleWorkout(structureWorkout(t, vdot), adj.direction)
    return { workoutId, dir: adj.direction, reason: adj.reason, summary, title: t.name }
  }, [plan, latestVerdict, dismissed, vdot, replan?.trigger])

  const [splash, setSplash] = useState(false)
  useEffect(() => {
    if (modulation && latestVerdict && localStorage.getItem('vl-modul-splash') !== latestVerdict.id) {
      localStorage.setItem('vl-modul-splash', latestVerdict.id)
      setSplash(true)
    }
  }, [modulation, latestVerdict])

  // Splash « régénération » quand la replanif réactive change la semaine (une fois
  // par état semaine×déclencheur) → le coureur VOIT que son plan s'est adapté.
  const [replanSplash, setReplanSplash] = useState(false)
  useEffect(() => {
    const wk = plan?.weeks[0]?.weekStartISO
    if (!replan?.trigger || !wk) return
    const key = `${wk}:${replan.trigger}`
    if (localStorage.getItem('vl-replan-splash') !== key) {
      localStorage.setItem('vl-replan-splash', key)
      setReplanSplash(true)
    }
  }, [replan?.trigger, plan])

  function cancelModulation() {
    if (latestVerdict) localStorage.setItem('vl-modul-dismiss', latestVerdict.id)
    setDismissed(true)
  }

  if (isLoading) {
    return <BrandedLoader />
  }

  if (!targetRace || !plan) {
    return (
      <div style={{ paddingBottom: '2rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 700, marginBottom: '1rem' }}>Coach</div>
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div className="mlabel" style={{ color: 'var(--vl-text-3)', marginBottom: 12 }}>Aucune course à venir</div>
          <div style={{ color: 'var(--vl-text-2)', fontSize: '.9rem', marginBottom: 16 }}>
            Ajoute une course cible dans ton calendrier et le Coach construira ton plan vers le jour J.
          </div>
          <Link to="/race" className="hbtn" style={{ textDecoration: 'none', display: 'inline-block' }}>→ Calendrier</Link>
        </div>
      </div>
    )
  }

  // ── Cap sur le jour J (héros) ──
  const raceDate = new Date(plan.race.dateISO + 'T00:00:00')
  const daysLeft = Math.max(0, Math.ceil((raceDate.getTime() - Date.now()) / 86_400_000))
  const currentPhase: Phase = plan.weeks[0]?.phase ?? 'base'
  const isPostRaceRecov = !!plan.weeks[0]?.isPostRaceRecovery
  const currentPhaseLabel = isPostRaceRecov ? 'RÉCUP' : PHASE_LABELS[currentPhase]
  const currentPhaseColor = isPostRaceRecov ? 'var(--vl-status-rest)' : PHASE_COLORS[currentPhase]

  return (
    <div style={{ paddingBottom: '3rem' }}>
      {splash ? <SessionAdaptationSplash message="J'ajuste ta prochaine séance selon ton dernier ressenti." onDone={() => setSplash(false)} /> : null}
      {replanSplash ? <SessionAdaptationSplash message="Je régénère ton plan selon ta charge réelle…" onDone={() => setReplanSplash(false)} /> : null}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 700 }}>Coach</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
          {plan.weeksToRace} semaine{plan.weeksToRace > 1 ? 's' : ''} avant le jour J
        </div>
      </div>

      {/* ── 1 · HÉROS : cap sur le jour J (course + countdown + frise + sceau) ── */}
      <div className="coach-hero">
        <div className="coach-hero-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="coach-kic">Course visée · cap sur le jour J</div>
            {upcoming.length > 1 ? (
              <select
                value={targetRace.id}
                onChange={(e) => setSelectedRaceId(e.target.value)}
                style={{ width: '100%', maxWidth: 320, padding: '6px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line-2)', borderRadius: 6, fontFamily: 'var(--vl-display)', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '.01em', textTransform: 'uppercase', margin: '6px 0' }}
              >
                {upcoming.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} — {fmtRaceDate(r.date.slice(0, 10))}</option>
                ))}
              </select>
            ) : (
              <div className="coach-race">{targetRace.name}</div>
            )}
            <div className="coach-meta">
              {fmtRaceDate(plan.race.dateISO)}
              {plan.race.distanceKm > 0 ? ` · ${plan.race.distanceKm} km` : ''}
              {plan.race.elevationM > 0 ? ` · ${plan.race.elevationM} m D+` : ''}
              {' · '}{plan.race.isTrail ? 'TRAIL' : 'ROUTE'}
              {' · '}{plan.daysPerWeek} j/sem.
            </div>
            {/* Priorité A/B/C de la course */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--vl-text-3)' }}>Objectif</span>
              <div style={{ display: 'flex', gap: 1, background: 'var(--vl-line)', border: '1px solid var(--vl-line)', borderRadius: 'var(--vl-r-sm)', overflow: 'hidden' }}>
                {(['A', 'B', 'C'] as const).map((p) => {
                  const on = (targetRace.priority ?? 'A') === p
                  const lbl = p === 'A' ? 'Principal' : p === 'B' ? 'Secondaire' : 'Rodage'
                  return (
                    <button key={p} title={lbl} onClick={() => !on && priorityMut.mutate({ id: targetRace.id, p })}
                      style={{ border: 'none', cursor: on ? 'default' : 'pointer', padding: '4px 10px',
                        background: on ? 'var(--vl-ember)' : 'var(--vl-surf-2)', color: on ? 'var(--vl-ink)' : 'var(--vl-text-2)',
                        fontFamily: 'var(--vl-mono)', fontWeight: 700, fontSize: 9.5, letterSpacing: '.06em' }}>
                      {p} · {lbl}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="coach-cd">
            <div className="coach-cd-n">{daysLeft}</div>
            <div className="coach-cd-u">jours</div>
            <div className="coach-cd-ph" style={{ color: currentPhaseColor }}>▸ {currentPhaseLabel}</div>
          </div>
        </div>

        {/* Frise de périodisation (phases groupées, semaine en cours mise en avant) */}
        <PeriodizationArc weeks={plan.weeks} weeksToRace={plan.weeksToRace} distanceKm={plan.race.distanceKm} />
      </div>

      {/* Calibrage VMA (demi-Cooper) proposé une fois par objectif, en début de prépa. */}
      <CalibrationPopup show={!!profile && !profile.demi_cooper} saving={demiCooperMut.isPending} onSave={(mtr) => demiCooperMut.mutate(mtr)} onSkip={() => demiCooperSkipMut.mutate()} />

      {/* ── CETTE SEMAINE (en premier) : le menu de la semaine — course + renfo,
            tu choisis ta séance (jamais imposée). « Ton moteur » vit dans Profil › LABO. ── */}
      <div data-tour="coach-week" className="coach-block-h">
        <span className="coach-block-ttl">Cette semaine</span>
      </div>

      {/* ── CTA séance du jour (ou prochaine séance) ── */}
      <TodayCTA week={plan.weeks[0]} />

      {replan?.trigger ? (
        <div className="card" style={{ borderLeft: `4px solid ${replan.trigger === 'surcharge' ? 'var(--vl-ember)' : 'var(--vl-status-watch)'}`, padding: '10px 14px', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: replan.trigger === 'surcharge' ? 'var(--vl-ember)' : 'var(--vl-status-watch)', fontWeight: 700 }}>
              {replan.badge}
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--vl-text-2)' }}>{replan.reason}</div>
        </div>
      ) : null}

      {modulation ? (
        <div className="card" style={{ borderLeft: '4px solid var(--vl-ember)', padding: '10px 14px', marginBottom: '1rem', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: 'var(--vl-text-2)' }}>
            <strong style={{ color: 'var(--vl-text)' }}>
              {modulation.dir === 'lighten' ? `${modulation.title} allégée` : `${modulation.title} renforcée`}
            </strong>
            {' — '}{modulation.reason}.{' '}
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 11, color: 'var(--vl-text)' }}>{modulation.summary}</span>
          </div>
          <button className="hbtn" style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0 }} onClick={cancelModulation}>Annuler</button>
        </div>
      ) : null}

      <WeekProgram
        weeks={visibleWeeks}
        vdot={vdot}
        activities={activities}
        fcMax={profile?.fc_max}
        scale={modulation ? { workoutId: modulation.workoutId, dir: modulation.dir } : undefined}
        logs={sessionLogs}
        onSaved={onSessionSaved}
        pastWeeks={pastWeeks}
        renfoSessionsPerWeek={renfoSessionsPerWeek}
      />

      {/* ── Gate PRO : plan complet après les 2 semaines gratuites ── */}
      {isGated && plan && (
        <CoachProTeaser
          vdot={vdot}
          weeksToRace={plan.weeksToRace}
          lockedWeeks={displayWeeks.length - FREE_WEEKS}
          distanceKm={plan.race.distanceKm}
          raceName={plan.race.name}
          onUpgrade={() => openModal({
            vdot,
            weeksToRace: plan.weeksToRace,
            distanceKm: plan.race.distanceKm,
            raceName: plan.race.name,
          })}
        />
      )}

      {!isGated && (
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 16, lineHeight: 1.6 }}>
          Les séances sont une <strong>proposition</strong> : tu restes libre de ton calendrier et de ton choix.
          Le renforcement est <strong>intégré à ta semaine</strong> et co-périodisé avec ta course.
        </div>
      )}
    </div>
  )
}

// ── Teaser inline affiché sous les 2 semaines gratuites ──────────────────────
function CoachProTeaser({
  vdot, weeksToRace, lockedWeeks, distanceKm, raceName, onUpgrade,
}: {
  vdot: number
  weeksToRace: number
  lockedWeeks: number
  distanceKm: number
  raceName: string
  onUpgrade: () => void
}) {
  const gain = estimateVdotGain(weeksToRace)
  const distM = distanceKm * 1000
  const currentTimeS = distM > 0 && vdot > 0 ? predictRaceTimeS(vdot, distM) : null
  const coachTimeS = distM > 0 && vdot > 0 ? predictRaceTimeS(vdot + gain, distM) : null

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {/* Semaines verrouillées — aperçu empilé */}
      <div style={{ position: 'relative', marginBottom: '0.75rem', height: 88 }}>
        {[2, 1, 0].map((i) => (
          <div key={i} style={{
            position: 'absolute',
            top: i * 10, left: i * 4, right: i * 4,
            height: 64,
            background: 'var(--vl-surf)',
            border: '1px solid var(--vl-line)',
            borderRadius: 10,
            opacity: 0.35 + i * 0.2,
          }} />
        ))}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 4,
        }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
            {lockedWeeks} semaine{lockedWeeks > 1 ? 's' : ''} verrouillée{lockedWeeks > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Card upgrade */}
      <div className="card" style={{ borderLeft: '4px solid var(--vl-ember)', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{
            fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700,
            letterSpacing: '.14em', color: 'var(--vl-ember)',
            background: 'color-mix(in oklab, var(--vl-ember) 12%, transparent)',
            border: '1px solid var(--vl-ember)', borderRadius: 999, padding: '3px 10px',
          }}>✦ PRO</span>
          <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
            Plan complet {raceName && `· ${raceName}`}
          </span>
        </div>

        {/* Comparaison */}
        {currentTimeS && coachTimeS && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, letterSpacing: '.08em', color: 'var(--vl-text-3)', marginBottom: 4 }}>AUJOURD'HUI</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-text)', lineHeight: 1 }}>
                {fmtRaceTime(currentTimeS)}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 4 }}>
                VDOT {Math.round(vdot)}
              </div>
            </div>
            <div style={{ color: 'var(--vl-ember)', textAlign: 'center', fontSize: 16 }}>→</div>
            <div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 8.5, letterSpacing: '.08em', color: 'var(--vl-ember)', marginBottom: 4 }}>AVEC LE COACH</div>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--vl-ember)', lineHeight: 1 }}>
                {fmtRaceTime(coachTimeS)}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 4 }}>
                visée VDOT {Math.round(vdot + gain)}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onUpgrade}
          style={{
            width: '100%', background: 'var(--vl-ember)', color: 'var(--vl-ink)',
            border: 'none', borderRadius: 10, padding: '12px',
            fontFamily: 'var(--vl-display)', fontSize: '0.95rem', fontWeight: 800,
            letterSpacing: '.05em', cursor: 'pointer',
          }}
        >
          DÉBLOQUER LE PLAN COMPLET →
        </button>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', textAlign: 'center', marginTop: 8 }}>
          {priceLabels.annual()} · {priceLabels.monthly()} sans engagement
        </div>
      </div>
    </div>
  )
}
