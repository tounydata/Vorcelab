import { useState } from 'react'
import SessionBrowser, { type SessionBrowserLink } from './SessionBrowser'
import { buildWeekCatalog } from '../lib/coach/catalog'
import { buildRecommendContext } from '../lib/coach/recommendContext'
import { PHASE_LABELS } from '../lib/coach/planGenerator'
import { ChevronLeft, ChevronRight } from './coach/CoachIcons'
import { scaleWorkout, type ModulationDir } from '../lib/coach/sessionModulation'
import type { Phase } from '../lib/coach/workouts'
import type { RecommendContext } from '../lib/sessionRecommender'
import type { LinkActivity } from './SessionFeedback'

export interface ProgramSession {
  workoutId: string
  dayOfWeek?: number
  targetDurationMin?: number
}

export interface ProgramWeek {
  weekIndex: number
  weekStartISO?: string
  phase: Phase
  isRecovery: boolean
  focus: string
  sessions: readonly ProgramSession[]
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'Cette semaine'
  if (offset === 1) return 'Semaine prochaine'
  return `Dans ${offset} semaines`
}

/**
 * Programme HEBDOMADAIRE — une semaine à la fois, navigation ‹ ›.
 * L'athlète voit ce qu'il a à faire cette semaine et peut se projeter sur les
 * suivantes. Les séances sont décidées par l'algo (plan) et présentées en
 * choix-first (badges = suggestion). Pas de librairie à parcourir.
 */
export default function WeekProgram({ weeks, vdot, activities, fcMax, scale }: {
  weeks: ProgramWeek[]
  vdot: number
  activities: LinkActivity[]
  fcMax?: number | null
  /** Modulation v3 : adapte la séance qualité ciblée de la semaine COURANTE. */
  scale?: { workoutId: string; dir: ModulationDir }
}) {
  const [idx, setIdx] = useState(0)

  if (weeks.length === 0) {
    return <div className="card" style={{ fontSize: 13, color: 'var(--vl-text-3)' }}>Pas de programme.</div>
  }

  const clamped = Math.min(Math.max(idx, 0), weeks.length - 1)
  const week = weeks[clamped]
  const entries = buildWeekCatalog(week.sessions, vdot)
  // Modulation v3 : on adapte la séance qualité ciblée (semaine courante uniquement).
  const shownEntries = clamped === 0 && scale
    ? entries.map((e) => e.template.id === scale.workoutId
        ? { ...e, workout: scaleWorkout(e.workout, scale.dir).workout }
        : e)
    : entries
  // Le contexte temps réel (charge/fraîcheur) ne vaut que pour la semaine courante.
  const ctx: RecommendContext =
    clamped === 0 ? buildRecommendContext(week.phase, activities, fcMax) : { phase: week.phase }

  // Liaison Strava : seulement la semaine COURANTE (on ne lie pas une séance à venir).
  const link: SessionBrowserLink | undefined =
    clamped === 0 && week.weekStartISO
      ? { vdot, fcMax: fcMax ?? null, weekStartISO: week.weekStartISO, weekPhase: week.phase, activities, sessions: week.sessions }
      : undefined

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <button
          className="hbtn" onClick={() => setIdx(clamped - 1)} disabled={clamped === 0}
          aria-label="Semaine précédente" style={{ opacity: clamped === 0 ? 0.4 : 1 }}
        ><ChevronLeft size={16} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: 17, color: 'var(--vl-text)' }}>{weekLabel(clamped)}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
            S{week.weekIndex + 1} · {PHASE_LABELS[week.phase]}{week.isRecovery ? ' · DÉCHARGE' : ''}
          </div>
        </div>
        <button
          className="hbtn" onClick={() => setIdx(clamped + 1)} disabled={clamped === weeks.length - 1}
          aria-label="Semaine suivante" style={{ opacity: clamped === weeks.length - 1 ? 0.4 : 1 }}
        ><ChevronRight size={16} /></button>
      </div>

      {week.focus ? (
        <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>{week.focus}</p>
      ) : null}

      <SessionBrowser key={clamped} entries={shownEntries} ctx={ctx} link={link} />
    </div>
  )
}
