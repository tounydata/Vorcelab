import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { generateTrainingPlan, PHASE_LABELS } from '../lib/coach/planGenerator'
import { getWorkout, type Phase } from '../lib/coach/workouts'
import { levelFromVdot, weaknessesFromRunnerProfile } from '../lib/coach/profileSignals'
import { computeAdjustment, scaleWorkout, nextQualityWorkoutId } from '../lib/coach/sessionModulation'
import { structureWorkout } from '../lib/coach/structureWorkout'
import { listSessionLog } from '../lib/coach/sessionLog'
import type { RunnerProfileComputed } from '../lib/runnerProfile'
import { deriveRunnerPaces } from '../lib/runnerPaces'
import { computeDailyPMC } from '../lib/trainingLoad'
import PaceZonesCard from '../components/PaceZonesCard'
import Collapsible from '../components/Collapsible'
import WeekProgram from '../components/WeekProgram'
import SessionAdaptationSplash from '../components/SessionAdaptationSplash'
import type { LinkActivity } from '../components/SessionFeedback'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
}

interface ProfileRow {
  prs?: Record<string, unknown> | null
  vo2max?: number | null
  fc_max?: number | null
  runner_profile?: RunnerProfileComputed | null
  coach_days_per_week?: number | null
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

const PHASE_ORDER: Phase[] = ['base', 'build', 'specific', 'taper', 'race']

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

  // Reconstitue les semaines DÉJÀ FAITES : les phases situées avant la phase
  // courante dans une prépa pleine de référence (réparties par poids).
  const curPhase = weeks[0].phase
  const curRank = PHASE_ORDER.indexOf(curPhase)
  const fullWeeks = Math.max(weeksToRace, standardPrepWeeks(distanceKm))
  const weeksDone = Math.max(0, fullWeeks - weeksToRace)
  const pool = PHASE_ORDER.slice(0, Math.max(0, curRank)) // phases avant la courante
  const pastPhases: Phase[] = []
  if (weeksDone > 0 && pool.length > 0) {
    const w: Record<string, number> = { base: 0.5, build: 0.32, specific: 0.18 }
    const sum = pool.reduce((s, p) => s + (w[p] ?? 0.2), 0)
    let remaining = weeksDone
    pool.forEach((p, i) => {
      const cnt = i === pool.length - 1 ? remaining : Math.max(1, Math.round(weeksDone * ((w[p] ?? 0.2) / sum)))
      for (let j = 0; j < cnt && remaining > 0; j++) { pastPhases.push(p); remaining-- }
    })
  }

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
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        {runs.map((r, i) => {
          const color = PHASE_COLORS[r.phase]
          const state = r.isCurrent ? ' · en cours' : r.isPast ? ' · faite' : ''
          return (
            <div key={i} title={`${PHASE_LABELS[r.phase]} · ${r.len} sem.${state}`}
              style={{
                flex: r.len, minWidth: 0, borderRadius: 6, padding: '6px 8px',
                background: `color-mix(in srgb, ${color} ${r.isCurrent ? 22 : r.isPast ? 6 : 11}%, transparent)`,
                border: r.isCurrent ? `1px solid ${color}` : '1px solid transparent',
                borderTop: `3px solid ${color}`, opacity: r.isPast ? 0.7 : 1,
              }}>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {PHASE_LABELS[r.phase]}{r.isCurrent ? ' ◂ ici' : ''}
              </div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 1 }}>
                {r.len} sem.{state}
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
        .select('id,name,date,distance,elevation,type')
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Race[]
    },
  })

  const { data: profile } = useQuery<ProfileRow | null>({
    queryKey: ['profile-sessions'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('prs,vo2max,fc_max,runner_profile,coach_days_per_week').eq('id', user!.id).maybeSingle()
      return (data ?? null) as ProfileRow | null
    },
  })

  const { data: activities = [] } = useQuery<LinkActivity[]>({
    queryKey: ['activities'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('id,strava_activity_id,name,moving_time,average_heartrate,sport_type,type,distance,total_elevation_gain,start_date')
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
  const targetRace = useMemo(
    () => upcoming.find((r) => r.id === selectedRaceId) ?? upcoming[0] ?? null,
    [upcoming, selectedRaceId],
  )

  // Profil réel → signaux d'adaptation : niveau (VDOT) + points faibles (runner_profile).
  const vdot = useMemo(
    () => deriveRunnerPaces(profile?.prs, profile?.vo2max)?.vdot ?? 45,
    [profile?.prs, profile?.vo2max],
  )
  const level = useMemo(() => levelFromVdot(vdot), [vdot])
  const weaknesses = useMemo(
    () => weaknessesFromRunnerProfile(profile?.runner_profile ?? null),
    [profile?.runner_profile],
  )

  // Charge chronique réelle (CTL/PMC) depuis les activités → calibre volume & prudence.
  // On expose tout le dernier jour PMC (CTL + TSB) pour le « moteur » du Coach.
  const pmcToday = useMemo(() => {
    if (!activities.length) return null
    const pmc = computeDailyPMC(activities, profile?.fc_max ?? null)
    return pmc.length ? pmc[pmc.length - 1] : null
  }, [activities, profile?.fc_max])
  const currentCTL = pmcToday?.ctl ?? null

  // Jours de course/semaine : réglé dans les paramètres (profil), plus dans la page.
  const daysPerWeek = profile?.coach_days_per_week ?? 5

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
    })
  }, [targetRace, daysPerWeek, today, level, weaknesses, currentCTL])

  // ── Modulation v3 : le verdict de la dernière séance ajuste la prochaine ──
  const { data: latestVerdict = null } = useQuery({
    queryKey: ['latest-verdict', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const rows = await listSessionLog(1)
      return rows[0] ? { id: rows[0].id, verdict: rows[0].verdict } : null
    },
  })

  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    setDismissed(!!latestVerdict && localStorage.getItem('vl-modul-dismiss') === latestVerdict.id)
  }, [latestVerdict])

  // Cible : la 1re séance qualité de la semaine courante est adaptée DE L'INTÉRIEUR
  // (reps + allure) selon le verdict. L'affûtage (taper/course) n'est jamais modulé.
  const modulation = useMemo(() => {
    if (!plan || !latestVerdict || dismissed) return null
    const adj = computeAdjustment(latestVerdict.verdict)
    if (adj.direction === 'none') return null
    const week0 = plan.weeks[0]
    if (!week0 || week0.phase === 'taper' || week0.phase === 'race') return null
    const workoutId = nextQualityWorkoutId(week0.sessions)
    const t = workoutId ? getWorkout(workoutId) : null
    if (!workoutId || !t) return null
    const { summary } = scaleWorkout(structureWorkout(t, vdot), adj.direction)
    return { workoutId, dir: adj.direction, reason: adj.reason, summary, title: t.name }
  }, [plan, latestVerdict, dismissed, vdot])

  const [splash, setSplash] = useState(false)
  useEffect(() => {
    if (modulation && latestVerdict && localStorage.getItem('vl-modul-splash') !== latestVerdict.id) {
      localStorage.setItem('vl-modul-splash', latestVerdict.id)
      setSplash(true)
    }
  }, [modulation, latestVerdict])

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

      {/* ── Allures (secondaire) ── */}
      <Collapsible title="Mes allures">
        <PaceZonesCard prs={profile?.prs} vo2max={profile?.vo2max} fcMax={profile?.fc_max} bare />
      </Collapsible>

      {/* ── 4 · CETTE SEMAINE : séances proposées (jamais imposées) ── */}
      <div className="coach-block-h">
        <span className="coach-block-ttl">Cette semaine</span>
        <span className="coach-block-sub">Proposition · tu choisis ta séance du jour</span>
      </div>

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
        weeks={plan.weeks}
        vdot={vdot}
        activities={activities}
        fcMax={profile?.fc_max}
        scale={modulation ? { workoutId: modulation.workoutId, dir: modulation.dir } : undefined}
      />

      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)', marginTop: 16, lineHeight: 1.6 }}>
        Les séances sont une <strong>proposition</strong> : tu restes libre de ton calendrier et de ton choix.
      </div>
    </div>
  )
}
