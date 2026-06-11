import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { generateTrainingPlan, allocatePhases, PHASE_LABELS } from '../lib/coach/planGenerator'
import { type CoachMotivation } from '../lib/coach/motivation'
import { getWorkout, type Phase } from '../lib/coach/workouts'
import { levelFromVdot, weaknessesFromRunnerProfile } from '../lib/coach/profileSignals'
import { computeAdjustment, scaleWorkout, nextQualityWorkoutId } from '../lib/coach/sessionModulation'
import { structureWorkout } from '../lib/coach/structureWorkout'
import { listSessionLog } from '../lib/coach/sessionLog'
import { applyReplan } from '../lib/coach/replan'
import { fuseRenfoIntoWeek, RENFO_FOCUS_SHORT } from '../lib/coach/renfoFusion'
import type { RunnerProfileComputed } from '../lib/runnerProfile'
import { deriveRunnerPaces, deriveAutoPrs } from '../lib/runnerPaces'
import { computeDailyPMC, computeACWR } from '../lib/trainingLoad'
import WeekProgram, { type HistoryWeek } from '../components/WeekProgram'
import SessionAdaptationSplash from '../components/SessionAdaptationSplash'
import type { LinkActivity } from '../components/SessionFeedback'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
  priority?: string | null
}

interface ProfileRow {
  prs?: Record<string, unknown> | null
  vo2max?: number | null
  fc_max?: number | null
  runner_profile?: RunnerProfileComputed | null
  coach_days_per_week?: number | null
  coach_motivation?: string | null
}

const PHASE_COLORS: Record<Phase, string> = {
  base: 'var(--vl-growth)',
  build: 'var(--vl-amber)',
  specific: 'var(--vl-ember)',
  taper: '#3B82F6',
  race: 'var(--vl-text)',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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

export default function CoachPage() {
  const user = useVLStore((s) => s.user)
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null)

  const { data: races = [], isLoading } = useQuery<Race[]>({
    queryKey: ['races'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('race_calendar')
        .select('id,name,date,distance,elevation,type,priority')
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Race[]
    },
  })

  const { data: profile } = useQuery<ProfileRow | null>({
    queryKey: ['profile-sessions'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('prs,vo2max,fc_max,runner_profile,coach_days_per_week,coach_motivation').eq('id', user!.id).maybeSingle()
      return (data ?? null) as ProfileRow | null
    },
  })

  const { data: activities = [] } = useQuery<LinkActivity[]>({
    queryKey: ['activities'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,strava_activity_id,name,moving_time,average_heartrate,sport_type,type,distance,total_elevation_gain,start_date,is_race,workout_type:raw_data->workout_type')
        .order('start_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as LinkActivity[]
    },
  })

  const today = todayISO()
  const upcoming = useMemo(
    () => races.filter((r) => r.date.slice(0, 10) >= today),
    [races, today],
  )
  // Cible = choix manuel, sinon la prochaine course A (objectif principal),
  // sinon la prochaine course tout court.
  const targetRace = useMemo(
    () => upcoming.find((r) => r.id === selectedRaceId)
      ?? upcoming.find((r) => (r.priority ?? 'A') === 'A')
      ?? upcoming[0] ?? null,
    [upcoming, selectedRaceId],
  )
  // Courses secondaires (B/C) entre aujourd'hui et la cible → intégrées au plan.
  const secondaryRaces = useMemo(() => {
    if (!targetRace) return []
    return upcoming
      .filter((r) => r.id !== targetRace.id && r.date.slice(0, 10) < targetRace.date.slice(0, 10)
        && (r.priority === 'B' || r.priority === 'C'))
      .map((r) => ({ name: r.name, dateISO: r.date.slice(0, 10), priority: r.priority as 'B' | 'C' }))
  }, [upcoming, targetRace])

  // Profil réel → signaux d'adaptation : niveau (VDOT) + points faibles (runner_profile).
  // VDOT : PR manuels d'abord, complétés par les PR AUTO dérivés des courses
  // étiquetées (Strava « Course » / Vorcelab) → plus de saisie obligatoire.
  const autoPrs = useMemo(() => deriveAutoPrs(activities as unknown as Parameters<typeof deriveAutoPrs>[0]), [activities])
  const vdot = useMemo(
    () => deriveRunnerPaces({ ...(autoPrs ?? {}), ...((profile?.prs as Record<string, unknown>) ?? {}) }, profile?.vo2max)?.vdot ?? 45,
    [autoPrs, profile?.prs, profile?.vo2max],
  )
  const level = useMemo(() => levelFromVdot(vdot), [vdot])
  const weaknesses = useMemo(
    () => weaknessesFromRunnerProfile(profile?.runner_profile ?? null),
    [profile?.runner_profile],
  )

  // Charge chronique réelle (CTL/PMC) depuis les activités → calibre volume & prudence.
  // On expose tout le dernier jour PMC (CTL + TSB) pour le « moteur » du Coach.
  const loadSignals = useMemo(() => {
    if (!activities.length) return { today: null, acwrRatio: null as number | null }
    const pmc = computeDailyPMC(activities, profile?.fc_max ?? null)
    const today = pmc.length ? pmc[pmc.length - 1] : null
    return { today, acwrRatio: computeACWR(pmc).ratio }
  }, [activities, profile?.fc_max])
  const pmcToday = loadSignals.today
  const currentCTL = pmcToday?.ctl ?? null

  // Jours de course/semaine : réglé dans les paramètres (profil), plus dans la page.
  const daysPerWeek = profile?.coach_days_per_week ?? 5
  // Orientation lue depuis le profil (réglée dans Profil › Paramètres) → pilote le plan.
  const motivation = (profile?.coach_motivation ?? 'mix') as CoachMotivation

  // Priorité de la course cible (A = principal, B = secondaire, C = rodage).
  const qc = useQueryClient()
  const priorityMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: string }) => {
      const { error } = await supabase.from('race_calendar').update({ priority: p }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['races'] }),
  })

  const plan = useMemo(() => {
    if (!targetRace) return null
    return generateTrainingPlan({
      raceName: targetRace.name,
      raceDateISO: targetRace.date.slice(0, 10),
      raceDistanceKm: targetRace.distance ?? 0,
      raceElevationM: targetRace.elevation ?? 0,
      raceType: targetRace.type,
      todayISO: today,
      daysPerWeek,
      currentCTL,
      level,
      weaknesses,
      motivation,
      secondaryRaces,
    })
  }, [targetRace, daysPerWeek, today, level, weaknesses, currentCTL, motivation, secondaryRaces])

  // ── Replanification RÉACTIVE : la charge RÉELLE (ACWR/forme) ajuste la semaine ──
  // courante (allègement si surcharge, reprise progressive si désentraînement).
  // Le générateur cale déjà le VOLUME sur le CTL réel et intègre les courses
  // ajoutées (régénération) ; cette couche gère en plus l'INTENSITÉ et l'explique.
  const replan = useMemo(
    () => (plan ? applyReplan(plan.weeks, { acwrRatio: loadSignals.acwrRatio, tsb: pmcToday?.tsb ?? null }) : null),
    [plan, loadSignals.acwrRatio, pmcToday?.tsb],
  )
  const displayWeeks = useMemo(() => replan?.weeks ?? plan?.weeks ?? [], [replan, plan])

  // Profil renfo (séances/sem.) → fusion du renforcement dans la semaine course.
  const { data: renfoProfile } = useQuery({
    queryKey: ['renfo-profile-coach', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('renfo_profile').select('sessions_per_week').eq('user_id', user!.id).maybeSingle()
      return data as { sessions_per_week?: number | null } | null
    },
  })
  const renfoFusion = useMemo(
    () => (displayWeeks[0] ? fuseRenfoIntoWeek(displayWeeks[0], renfoProfile?.sessions_per_week ?? null) : null),
    [displayWeeks, renfoProfile?.sessions_per_week],
  )

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
    return <div className="loading"><div className="spinner" /></div>
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

  // ── Données « moteur » (ce que l'algo lit du coureur) ──
  const raceDate = new Date(plan.race.dateISO + 'T00:00:00')
  const daysLeft = Math.max(0, Math.ceil((raceDate.getTime() - Date.now()) / 86_400_000))
  const currentPhase: Phase = plan.weeks[0]?.phase ?? 'base'
  const LEVEL_LABELS: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Confirmé' }
  const rp = profile?.runner_profile ?? null
  const driftVal = rp?.hrDriftPct
  const durability = driftVal != null
    ? {
        v: `${driftVal > 0 ? '+' : ''}${driftVal.toFixed(0)}%`,
        sub: rp!.hrDriftStatus === 'marked' ? 'Faiblit en fin' : rp!.hrDriftStatus === 'moderate' ? 'Correcte' : 'Solide',
        color: rp!.hrDriftStatus === 'marked' ? 'var(--vl-status-watch)' : 'var(--vl-status-prod)',
      }
    : { v: '—', sub: 'Données à venir', color: 'var(--vl-text-3)' }
  const climbWeak = weaknesses.includes('climbing')
  const climb = rp
    ? { v: climbWeak ? 'À renforcer' : 'OK', sub: climbWeak ? 'Point faible' : 'Point fort', color: climbWeak ? 'var(--vl-status-watch)' : 'var(--vl-status-prod)' }
    : { v: '—', sub: 'Données à venir', color: 'var(--vl-text-3)' }
  const engine: { cl: string; v: string; sub: string; color: string }[] = [
    { cl: 'VDOT · niveau', v: String(Math.round(vdot)), sub: LEVEL_LABELS[level] ?? level, color: 'var(--vl-text)' },
    { cl: 'CTL · charge chro.', v: currentCTL != null ? String(currentCTL) : '—', sub: 'Fond', color: 'var(--vl-ember)' },
    { cl: 'Fraîcheur · TSB', v: pmcToday ? (pmcToday.tsb > 0 ? `+${pmcToday.tsb}` : String(pmcToday.tsb)) : '—', sub: pmcToday ? (pmcToday.tsb > 5 ? 'Frais' : pmcToday.tsb < -10 ? 'Chargé' : 'Stable') : '—', color: 'var(--vl-status-peak)' },
    { cl: 'Durabilité', v: durability.v, sub: durability.sub, color: durability.color },
    { cl: 'Côtes · VAM', v: climb.v, sub: climb.sub, color: climb.color },
  ]
  // Rationale en prose (hors ligne périodisation, déjà visualisée par la frise).
  const rationale = plan.rationale.filter((r) => !r.startsWith('Périodisation'))

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
            <div className="coach-cd-ph" style={{ color: PHASE_COLORS[currentPhase] }}>▸ {PHASE_LABELS[currentPhase]}</div>
          </div>
        </div>

        {/* Frise de périodisation (phases groupées, semaine en cours mise en avant) */}
        <PeriodizationArc weeks={plan.weeks} weeksToRace={plan.weeksToRace} distanceKm={plan.race.distanceKm} />

        <div className="coach-seal"><span className="coach-seal-dot" />Plan déterministe · calcul 100 % local · aucune IA · aucune donnée envoyée</div>
      </div>

      {/* L'orientation d'entraînement (plaisir / équilibre / performance) se règle
          désormais uniquement dans Profil › Paramètres. Elle pilote ce plan en arrière-plan. */}

      {/* ── 2 · TON MOTEUR : ce que l'algo lit du coureur (métriques en vedette) ── */}
      <div className="coach-block-h">
        <span className="coach-block-ttl">Ton moteur</span>
        <span className="coach-block-sub">Ce que l'algo lit de toi</span>
      </div>
      <div className="coach-engine">
        {engine.map((c) => (
          <div key={c.cl} className="coach-cell">
            <div className="coach-cell-cl">{c.cl}</div>
            <div className="coach-cell-v" style={{ color: c.color }}>{c.v}</div>
            <div className="coach-cell-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 3 · POURQUOI CE PLAN : voix éditoriale (Fraunces assumé, cf. audit) ── */}
      {rationale.length > 0 && (
        <div className="coach-why">
          <div className="coach-why-lab">Pourquoi ce plan</div>
          {rationale.map((r, i) => <p key={i} className="coach-why-p">{r}</p>)}
        </div>
      )}


      {/* ── 4 · CETTE SEMAINE : séances proposées (jamais imposées) ── */}
      <div data-tour="coach-week" className="coach-block-h">
        <span className="coach-block-ttl">Cette semaine</span>
        <span className="coach-block-sub">Proposition · tu choisis ta séance du jour</span>
      </div>

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
        weeks={displayWeeks}
        vdot={vdot}
        activities={activities}
        fcMax={profile?.fc_max}
        scale={modulation ? { workoutId: modulation.workoutId, dir: modulation.dir } : undefined}
        logs={sessionLogs}
        onSaved={onSessionSaved}
        pastWeeks={pastWeeks}
      />

      {/* ── Renfo fusionné : placé autour des séances course (entraînement concurrent).
          Le renfo n'a plus d'onglet à lui : il vit ici, et chaque slot lance la séance. ── */}
      {renfoFusion && renfoFusion.slots.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <div className="coach-block-h">
            <span className="coach-block-ttl">Renfo cette semaine</span>
            <span className="coach-block-sub">Intégré à ton plan · touche un créneau pour lancer la séance</span>
          </div>
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {renfoFusion.slots.map((sl, i) => (
                <Link key={i} to={`/renfo/session/${sl.focus}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, fontWeight: 700, color: 'var(--vl-text-3)', minWidth: 30, textTransform: 'uppercase', paddingTop: 2 }}>
                    {['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][sl.dayOfWeek]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--vl-text)' }}>
                      {RENFO_FOCUS_SHORT[sl.focus] ?? sl.focus}
                      {sl.heavy ? <span style={{ marginLeft: 6, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)', letterSpacing: '.05em' }}>LOURD</span> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--vl-text-3)', lineHeight: 1.45, marginTop: 1 }}>{sl.rationale}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-ember)', letterSpacing: '.08em', flexShrink: 0, paddingTop: 3 }}>
                    LANCER →
                  </span>
                </Link>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--vl-text-3)', lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--vl-line)' }}>
              {renfoFusion.note}{' '}
              <Link to="/renfo" style={{ color: 'var(--vl-ember)', textDecoration: 'none', whiteSpace: 'nowrap' }}>→ Toutes les séances</Link>
              {' · '}
              <Link to="/renfo/library" style={{ color: 'var(--vl-ember)', textDecoration: 'none', whiteSpace: 'nowrap' }}>→ Bibliothèque d'exercices</Link>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          <div className="coach-block-h">
            <span className="coach-block-ttl">Renfo cette semaine</span>
            <span className="coach-block-sub">Intégré à ton plan</span>
          </div>
          <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: 'var(--vl-text-2)', lineHeight: 1.5 }}>
              Le renforcement se co-périodise avec ta course. Choisis une séance ou règle ton objectif hebdo.
            </div>
            <Link to="/renfo" className="hbtn" style={{ textDecoration: 'none', flexShrink: 0 }}>→ Mon renfo</Link>
          </div>
        </div>
      )}

      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 16, lineHeight: 1.6 }}>
        Les séances sont une <strong>proposition</strong> : tu restes libre de ton calendrier et de ton choix.
      </div>
    </div>
  )
}
