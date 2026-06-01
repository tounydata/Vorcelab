import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import { useVLStore } from '../store/vlStore'
import { generateTrainingPlan, PHASE_LABELS } from '../lib/coach/planGenerator'
import type { Phase } from '../lib/coach/workouts'
import { levelFromVdot, weaknessesFromRunnerProfile } from '../lib/coach/profileSignals'
import type { RunnerProfileComputed } from '../lib/runnerProfile'
import { deriveRunnerPaces } from '../lib/runnerPaces'
import type { ActivityForLoad } from '../lib/trainingLoad'
import PaceZonesCard from '../components/PaceZonesCard'
import Collapsible from '../components/Collapsible'
import WeekProgram from '../components/WeekProgram'

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

function fmtRaceDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function CoachPage() {
  const user = useVLStore((s) => s.user)
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null)
  const [daysPerWeek, setDaysPerWeek] = useState(5)

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
      const { data } = await supabase.from('profiles').select('prs,vo2max,fc_max,runner_profile').eq('id', user!.id).maybeSingle()
      return (data ?? null) as ProfileRow | null
    },
  })

  const { data: activities = [] } = useQuery<ActivityForLoad[]>({
    queryKey: ['activities'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strava_activities')
        .select('moving_time,average_heartrate,sport_type,type,distance,total_elevation_gain,start_date')
        .order('start_date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as ActivityForLoad[]
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
      currentCTL: null,
      level,
      weaknesses,
    })
  }, [targetRace, daysPerWeek, today, level, weaknesses])

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

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.8rem', fontWeight: 700 }}>Coach</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>
          {plan.weeksToRace} semaine{plan.weeksToRace > 1 ? 's' : ''} avant le jour J
        </div>
      </div>

      {/* ── Course cible + réglages ── */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: '1.25rem' }}>
        <div className="clabel" style={{ marginBottom: 8 }}>Course cible</div>
        {upcoming.length > 1 ? (
          <select
            value={targetRace.id}
            onChange={(e) => setSelectedRaceId(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', background: 'var(--vl-surf-2)', color: 'var(--vl-text)', border: '1px solid var(--vl-line)', borderRadius: 6, fontFamily: 'var(--vl-display)', fontSize: '.95rem', marginBottom: 8 }}
          >
            {upcoming.map((r) => (
              <option key={r.id} value={r.id}>{r.name} — {fmtRaceDate(r.date.slice(0, 10))}</option>
            ))}
          </select>
        ) : (
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: '1.1rem', fontWeight: 700 }}>{targetRace.name}</div>
        )}
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)', marginTop: 4 }}>
          {fmtRaceDate(plan.race.dateISO)}
          {plan.race.distanceKm > 0 ? ` · ${plan.race.distanceKm} km` : ''}
          {plan.race.elevationM > 0 ? ` · ${plan.race.elevationM} m D+` : ''}
          {' · '}{plan.race.isTrail ? 'TRAIL' : 'ROUTE'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span className="mlabel" style={{ margin: 0 }}>JOURS / SEMAINE</span>
          {[3, 4, 5, 6].map((d) => (
            <button
              key={d}
              onClick={() => setDaysPerWeek(d)}
              className="hbtn"
              style={{
                padding: '4px 10px', fontSize: 11,
                background: d === plan.daysPerWeek ? 'var(--vl-ember)' : 'transparent',
                color: d === plan.daysPerWeek ? 'var(--vl-ink)' : 'var(--vl-text-2)',
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ── Rationale ── */}
      <Collapsible title="Pourquoi ce plan">
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--vl-text-2)', fontSize: '.82rem', lineHeight: 1.6 }}>
          {plan.rationale
            .filter((r) => !r.startsWith('Périodisation'))
            .map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </Collapsible>

      {/* ── Frise des phases ── */}
      <div style={{ display: 'flex', gap: 3, marginBottom: '1.5rem' }}>
        {plan.weeks.map((w) => (
          <div
            key={w.weekIndex}
            title={`S${w.weekIndex + 1} · ${PHASE_LABELS[w.phase]}${w.isRecovery ? ' (décharge)' : ''}`}
            style={{
              flex: 1, height: 8, borderRadius: 2,
              background: PHASE_COLORS[w.phase],
              opacity: w.isRecovery ? 0.4 : 1,
            }}
          />
        ))}
      </div>

      {/* ── Programme hebdomadaire (séances de l'algo, choix-first, navigation ← →) ── */}
      <Collapsible title="Mes allures">
        <PaceZonesCard prs={profile?.prs} vo2max={profile?.vo2max} fcMax={profile?.fc_max} bare />
      </Collapsible>

      <WeekProgram weeks={plan.weeks} vdot={vdot} activities={activities} fcMax={profile?.fc_max} />

      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 16, lineHeight: 1.6 }}>
        Plan généré localement par un moteur déterministe (aucune IA, aucune donnée envoyée à l'extérieur).
        Les séances sont une <strong>proposition</strong> : tu restes libre de ton choix.
      </div>
    </div>
  )
}
