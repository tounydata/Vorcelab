import { useState } from 'react'
import SessionBrowser from './SessionBrowser'
import { buildWeekCatalog } from '../lib/coach/catalog'
import { buildRecommendContext } from '../lib/coach/recommendContext'
import { PHASE_LABELS } from '../lib/coach/planGenerator'
import type { Phase } from '../lib/coach/workouts'
import type { RecommendContext } from '../lib/sessionRecommender'
import type { ActivityForLoad } from '../lib/trainingLoad'

export interface ProgramWeek {
  weekIndex: number
  phase: Phase
  isRecovery: boolean
  focus: string
  sessions: readonly { workoutId: string }[]
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'Cette semaine'
  if (offset === 1) return 'Semaine prochaine'
  return `Dans ${offset} semaines`
}

/**
 * Programme HEBDOMADAIRE — une semaine à la fois, navigation ← →.
 * L'athlète voit ce qu'il a à faire cette semaine et peut se projeter sur les
 * suivantes. Les séances sont décidées par l'algo (plan) et présentées en
 * choix-first (badges = suggestion). Pas de librairie à parcourir.
 */
export default function WeekProgram({ weeks, vdot, activities, fcMax }: {
  weeks: ProgramWeek[]
  vdot: number
  activities: ActivityForLoad[]
  fcMax?: number | null
}) {
  const [idx, setIdx] = useState(0)

  if (weeks.length === 0) {
    return <div className="card" style={{ fontSize: 13, color: 'var(--vl-text-3)' }}>Pas de programme.</div>
  }

  const clamped = Math.min(Math.max(idx, 0), weeks.length - 1)
  const week = weeks[clamped]
  const entries = buildWeekCatalog(week.sessions, vdot)
  // Le contexte temps réel (charge/fraîcheur) ne vaut que pour la semaine courante.
  const ctx: RecommendContext =
    clamped === 0 ? buildRecommendContext(week.phase, activities, fcMax) : { phase: week.phase }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <button
          className="hbtn" onClick={() => setIdx(clamped - 1)} disabled={clamped === 0}
          aria-label="Semaine précédente" style={{ opacity: clamped === 0 ? 0.4 : 1 }}
        >←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--vl-display)', fontSize: 17, color: 'var(--vl-text)' }}>{weekLabel(clamped)}</div>
          <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>
            S{week.weekIndex + 1} · {PHASE_LABELS[week.phase]}{week.isRecovery ? ' · DÉCHARGE' : ''}
          </div>
        </div>
        <button
          className="hbtn" onClick={() => setIdx(clamped + 1)} disabled={clamped === weeks.length - 1}
          aria-label="Semaine suivante" style={{ opacity: clamped === weeks.length - 1 ? 0.4 : 1 }}
        >→</button>
      </div>

      {week.focus ? (
        <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>{week.focus}</p>
      ) : null}

      <SessionBrowser key={clamped} entries={entries} ctx={ctx} />
    </div>
  )
}
