import { useState } from 'react'
import WeekMenu from './coach/WeekMenu'
import { fuseRenfoIntoWeek } from '../lib/coach/renfoFusion'
import { computeCoPerioWarnings } from '../lib/renfoUtils'
import type { SessionLogRow } from '../lib/coach/sessionLog'
import { PHASE_LABELS } from '../lib/coach/planGenerator'
import { ChevronLeft, ChevronRight } from './coach/CoachIcons'
import { type ModulationDir } from '../lib/coach/sessionModulation'
import type { PlanWeek } from '../lib/coach/planGenerator'
import type { LinkActivity } from './SessionFeedback'

function addDaysISO(weekStartISO: string, days: number): string {
  const d = new Date(weekStartISO + (weekStartISO.length <= 10 ? 'T00:00:00' : ''))
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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
export interface HistoryDone {
  workoutId: string
  workoutName: string
  date: string
  verdict: string
}
export interface HistoryWeek {
  weekStartISO: string
  done: HistoryDone[]
}

const HISTORY_VERDICT: Record<string, { label: string; color: string }> = {
  conforme: { label: 'Conforme', color: 'var(--vl-growth)' },
  trop_facile: { label: 'Trop facile', color: 'var(--vl-amber)' },
  trop_dur: { label: 'Trop dur', color: 'var(--vl-ember)' },
  a_surveiller: { label: 'À surveiller', color: 'var(--vl-amber)' },
}
function fmtDayDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
}
function HistoryWeekView({ week }: { week: HistoryWeek }) {
  if (!week.done.length) {
    return <div className="card" style={{ fontSize: 13, color: 'var(--vl-text-3)' }}>Aucune séance validée cette semaine-là.</div>
  }
  return (
    <div>
      {week.done.map((d, i) => {
        const v = HISTORY_VERDICT[d.verdict] ?? { label: d.verdict, color: 'var(--vl-text-2)' }
        return (
          <div key={i} className="card" style={{ marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--vl-display)', fontSize: 16, color: 'var(--vl-text)' }}>{d.workoutName}</div>
              <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 10, color: 'var(--vl-text-3)' }}>{fmtDayDate(d.date)}</div>
            </div>
            <span style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: v.color, border: `1px solid ${v.color}`, borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>✓ {v.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function WeekProgram({ weeks, vdot, activities, fcMax, scale, logs, onSaved, pastWeeks, renfoSessionsPerWeek }: {
  weeks: PlanWeek[]
  vdot: number
  activities: LinkActivity[]
  fcMax?: number | null
  /** Modulation v3 : adapte la séance qualité ciblée de la semaine COURANTE. */
  scale?: { workoutId: string; dir: ModulationDir }
  /** Journal des séances → marque celles déjà validées. */
  logs?: SessionLogRow[]
  onSaved?: () => void
  /** Semaines passées reconstruites depuis le journal (navigation arrière). */
  pastWeeks?: HistoryWeek[]
  /** Renfo/sem. (réglages) → séances de renfo fusionnées dans la semaine. */
  renfoSessionsPerWeek?: number | null
}) {
  // `offset` = écart à la semaine courante (0 = cette semaine, <0 = passé, >0 = à venir).
  // Robuste si pastWeeks arrive après coup : on reste calé sur la semaine courante.
  const pastN = pastWeeks?.length ?? 0
  const [offset, setOffset] = useState(0)

  if (weeks.length === 0 && pastN === 0) {
    return <div className="card" style={{ fontSize: 13, color: 'var(--vl-text-3)' }}>Pas de programme.</div>
  }

  const off = Math.min(Math.max(offset, -pastN), weeks.length - 1)
  const isPast = off < 0
  const atStart = off === -pastN
  const atEnd = off === weeks.length - 1

  const navBar = (label: string, sub: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <button
        className="hbtn" onClick={() => setOffset(off - 1)} disabled={atStart}
        aria-label="Semaine précédente" style={{ opacity: atStart ? 0.4 : 1 }}
      ><ChevronLeft size={16} /></button>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--vl-display)', fontSize: 17, color: 'var(--vl-text)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--vl-mono)', fontSize: 9, color: 'var(--vl-text-3)' }}>{sub}</div>
      </div>
      <button
        className="hbtn" onClick={() => setOffset(off + 1)} disabled={atEnd}
        aria-label="Semaine suivante" style={{ opacity: atEnd ? 0.4 : 1 }}
      ><ChevronRight size={16} /></button>
    </div>
  )

  // ── Semaine passée : historique des séances validées (lecture seule) ──
  if (isPast) {
    const hw = pastWeeks![pastN + off]
    const weeksAgo = -off
    const n = hw.done.length
    return (
      <div>
        {navBar(weeksAgo === 1 ? 'Semaine dernière' : `Il y a ${weeksAgo} semaines`, `${n} séance${n > 1 ? 's' : ''} validée${n > 1 ? 's' : ''}`)}
        <HistoryWeekView week={hw} />
      </div>
    )
  }

  // ── Semaine courante ou à venir (plan) ──
  const week = weeks[off]
  const isCurrent = off === 0

  // Co-périodisation (fatigue récente) — ne vaut que pour la semaine COURANTE.
  // Source unique : focus à éviter / à privilégier, partagée par la séance proposée
  // (fusion) ET les badges du détail renfo → jamais de contradiction.
  const coPerio = isCurrent ? computeCoPerioWarnings(activities as Parameters<typeof computeCoPerioWarnings>[0]) : []
  const avoided = new Set(coPerio.flatMap((w) => w.avoid))
  const preferred = new Set(coPerio.flatMap((w) => w.prefer))

  // Séances de renfo fusionnées dans CETTE semaine (course + renfo, même menu).
  const renfoSlots = fuseRenfoIntoWeek(week, renfoSessionsPerWeek ?? null, avoided)?.slots ?? []

  // Séances déjà validées (depuis session_log), clé `${workoutId}@${date}` —
  // distingue deux séances de même type (ex. deux footings) dans la semaine.
  const doneByKey = (() => {
    const m = new Map<string, SessionLogRow>()
    if (!logs || !week.weekStartISO) return m
    for (const s of week.sessions) {
      const date = addDaysISO(week.weekStartISO, (s.dayOfWeek ?? 1) - 1)
      const row = logs.find((l) => l.planned_workout_id === s.workoutId && l.planned_date === date)
      if (row) m.set(`${s.workoutId}@${date}`, row)
    }
    return m
  })()

  return (
    <div>
      {navBar(weekLabel(off), `S${week.weekIndex + 1} · ${PHASE_LABELS[week.phase]}${week.isRecovery ? ' · DÉCHARGE' : ''}`)}

      {week.focus ? (
        <p style={{ fontSize: 12, color: 'var(--vl-text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>{week.focus}</p>
      ) : null}

      <WeekMenu
        key={off}
        week={week}
        vdot={vdot}
        fcMax={fcMax}
        activities={activities}
        isCurrent={isCurrent}
        weekStartISO={week.weekStartISO}
        renfoSlots={renfoSlots}
        renfoPreferred={preferred}
        renfoAvoided={avoided}
        scale={isCurrent ? scale : undefined}
        doneByKey={doneByKey}
        onSaved={onSaved}
      />
    </div>
  )
}
