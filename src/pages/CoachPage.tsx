import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase'
import {
  generateTrainingPlan, PHASE_LABELS, SYSTEM_LABELS,
  type PlannedSession,
} from '../lib/coach/planGenerator'
import type { Phase } from '../lib/coach/workouts'

interface Race {
  id: string
  name: string
  date: string
  distance: number | null
  elevation: number | null
  type: string | null
}

const DOW_LABELS = ['', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM']

const PHASE_COLORS: Record<Phase, string> = {
  base: 'var(--vl-growth)',
  build: 'var(--vl-amber)',
  specific: 'var(--vl-ember)',
  taper: '#3B82F6',
  race: 'var(--vl-text)',
}

const INTENSITY_COLOR: Record<string, string> = {
  easy: 'var(--vl-growth)',
  moderate: 'var(--vl-amber)',
  hard: 'var(--vl-ember)',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtRaceDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function SessionRow({ s }: { s: PlannedSession }) {
  const isRace = s.system === 'race'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--vl-line)' }}>
      <div style={{ width: 32, flexShrink: 0, fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', paddingTop: 2 }}>
        {DOW_LABELS[s.dayOfWeek]}
      </div>
      <div
        style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0, background: isRace ? 'var(--vl-ember)' : INTENSITY_COLOR[s.intensity] }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--vl-display)', fontSize: '.9rem', fontWeight: 700 }}>{s.title}</span>
          {!isRace && (
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)', border: '1px solid var(--vl-line)', borderRadius: 3, padding: '1px 5px' }}>
              {SYSTEM_LABELS[s.system]}
            </span>
          )}
          {s.climbing && <span style={{ fontSize: 11 }} title="Dénivelé positif">⛰</span>}
          {s.targetDurationMin > 0 && (
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-2)' }}>~{s.targetDurationMin} min</span>
          )}
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--vl-text-2)', marginTop: 2, lineHeight: 1.4 }}>{s.description}</div>
        {s.system === 'strength' && (
          <Link to="/renfo" style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-ember)' }}>→ ouvrir le module Renfo</Link>
        )}
      </div>
    </div>
  )
}

export default function CoachPage() {
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

  const today = todayISO()
  const upcoming = useMemo(
    () => races.filter((r) => r.date.slice(0, 10) >= today),
    [races, today],
  )
  const targetRace = useMemo(
    () => upcoming.find((r) => r.id === selectedRaceId) ?? upcoming[0] ?? null,
    [upcoming, selectedRaceId],
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
    })
  }, [targetRace, daysPerWeek, today])

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

      {/* ── Choix-first : le plan est une structure indicative, l'athlète choisit ── */}
      <Link
        to="/sessions"
        className="card"
        style={{ display: 'block', textDecoration: 'none', marginBottom: '1.25rem', borderLeft: '3px solid var(--vl-ember)' }}
      >
        <div className="clabel" style={{ margin: '0 0 4px' }}>Tu choisis tes séances</div>
        <div style={{ fontSize: 13, color: 'var(--vl-text-2)', lineHeight: 1.5 }}>
          Ce plan est une <strong>structure indicative</strong>, pas une obligation : parcours le
          catalogue et choisis librement — les recommandations ne sont que des suggestions.{' '}
          <span style={{ color: 'var(--vl-ember)', fontFamily: 'var(--vl-mono)', fontSize: 11 }}>Ouvrir le catalogue →</span>
        </div>
      </Link>

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
      <div className="card" style={{ padding: '12px 16px', marginBottom: '1.25rem' }}>
        <div className="clabel" style={{ marginBottom: 6 }}>Pourquoi ce plan</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--vl-text-2)', fontSize: '.82rem', lineHeight: 1.6 }}>
          {plan.rationale.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>

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

      {/* ── Semaines ── */}
      {plan.weeks.map((w) => (
        <div key={w.weekIndex} className="card" style={{ padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>S{w.weekIndex + 1}</span>
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.08em', color: PHASE_COLORS[w.phase], border: `1px solid ${PHASE_COLORS[w.phase]}`, borderRadius: 3, padding: '1px 6px' }}>
                {PHASE_LABELS[w.phase]}
              </span>
              {w.isRecovery && (
                <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 8, color: 'var(--vl-text-3)' }}>DÉCHARGE</span>
              )}
            </div>
            {w.volumeHours > 0 && (
              <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-2)' }}>~{w.volumeHours} h</span>
            )}
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--vl-text-3)', marginBottom: 6, fontStyle: 'italic' }}>{w.focus}</div>
          {w.sessions.map((s, i) => <SessionRow key={i} s={s} />)}
        </div>
      ))}

      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)', marginTop: 16, lineHeight: 1.6 }}>
        Plan généré localement par un moteur déterministe (aucune IA, aucune donnée envoyée à l'extérieur).
        Prochaine étape : personnalisation par ton CTL réel et tes points faibles du profil, puis adaptation hebdomadaire.
      </div>
    </div>
  )
}
